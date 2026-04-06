/**
 * Phase 3F — Shared Replenishment Data Layer
 *
 * Extracts Supabase queries + computation logic from the projection API route.
 * Shared by: /api/replenishment/projection (page) and /api/reports/weekly-risk (email).
 *
 * Key addition: fetches customer forecast from inventory_data.customer_forecast
 * and passes it to the projection engine as the preferred demand source.
 */

import { createClient } from '@/lib/supabase/server'
import {
  computeProjection,
  generateSuggestions,
  computeProjectionSummary,
  getCurrentWeekNumber,
} from '@/lib/replenishment-engine'
import type {
  SKUClassificationExtended,
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
} from '@/lib/types'

export interface ProjectionResult {
  currentWeek: number
  projections: SKUProjection[]
  suggestions: ReplenishmentSuggestion[]
  summary: ProjectionSummary
  dataAsOf: string
}

/**
 * Fetch all data from Supabase and compute 20-week projections for all classified SKUs.
 * Includes customer forecast as the preferred demand source (falls back to historical avg).
 */
export async function fetchAndComputeProjections(): Promise<ProjectionResult> {
  const supabase = await createClient()
  const currentWeek = getCurrentWeekNumber()

  // 1. Fetch classified SKUs (with policy fields from enhanced view)
  const { data: skus, error: skuError } = await supabase
    .from('v_sku_classification')
    .select('*')

  if (skuError) {
    throw new Error(`Failed to fetch SKU classification: ${skuError.message}`)
  }

  // 2. Fetch ALL weekly inventory data for each SKU
  //    This mirrors Pipeline Dashboard's calculation:
  //    actualInventory = prevWeek.actualInventory - actualConsumption + ATA
  const { data: allInventoryRows, error: invError } = await supabase
    .from('inventory_data')
    .select('sku_id, week_number, actual_inventory, actual_consumption, customer_forecast, ata, etd')
    .order('week_number', { ascending: true })

  if (invError) {
    throw new Error(`Failed to fetch inventory data: ${invError.message}`)
  }

  // Build map: sku_id → Map<weekNumber, weekData>
  // Calculate actual inventory using same logic as Pipeline Dashboard
  const weeklyInventoryMap = new Map<string, Map<number, { actualInventory: number; consumption: number; ata: number }>>()
  
  // Group by SKU first
  const skuWeekData = new Map<string, Array<{ week: number; actual_inventory: number | null; actual_consumption: number | null; customer_forecast: number | null; ata: number | null; etd: number | null }>>()
  for (const row of allInventoryRows || []) {
    if (!skuWeekData.has(row.sku_id)) {
      skuWeekData.set(row.sku_id, [])
    }
    skuWeekData.get(row.sku_id)!.push({
      week: row.week_number,
      actual_inventory: row.actual_inventory,
      actual_consumption: row.actual_consumption,
      customer_forecast: row.customer_forecast,
      ata: row.ata,
      etd: row.etd,
    })
  }

  // Calculate actual inventory for each SKU using Pipeline Dashboard logic
  const inventoryMap = new Map<string, number>()
  
  for (const [skuId, weeks] of skuWeekData) {
    // Sort by week
    weeks.sort((a, b) => a.week - b.week)
    
    const weekMap = new Map<number, { actualInventory: number; consumption: number; ata: number }>()
    let runningInventory = 0
    
    for (let i = 0; i < weeks.length; i++) {
      const week = weeks[i]
      const consumption = week.actual_consumption ?? week.customer_forecast ?? 0
      
      // Calculate ETA from ETD 6 weeks prior (same as Pipeline Dashboard)
      let eta = 0
      const etdSourceWeekIndex = weeks.findIndex(w => w.week === week.week - 6)
      if (etdSourceWeekIndex >= 0) {
        eta = weeks[etdSourceWeekIndex].etd ?? 0
      }
      
      // ATA defaults to ETA if not synced
      const ata = week.ata ?? eta
      
      if (i === 0) {
        // First week: use actual_inventory from DB if available
        runningInventory = week.actual_inventory ?? 0
      } else {
        // Subsequent weeks: actualInventory = prev - consumption + ata
        runningInventory = runningInventory - consumption + ata
      }
      
      weekMap.set(week.week, {
        actualInventory: runningInventory,
        consumption,
        ata,
      })
    }
    
    weeklyInventoryMap.set(skuId, weekMap)
    
    // Get current week's calculated inventory for projection starting point
    const currentWeekData = weekMap.get(currentWeek)
    if (currentWeekData) {
      inventoryMap.set(skuId, currentWeekData.actualInventory)
    } else {
      // Fallback: use most recent week's inventory
      const lastWeek = weeks[weeks.length - 1]
      const lastWeekData = weekMap.get(lastWeek?.week)
      inventoryMap.set(skuId, lastWeekData?.actualInventory ?? 0)
    }
  }

  // 3. Fetch in-transit data by SKU and week
  const { data: inTransitRows, error: itError } = await supabase
    .from('in_transit_by_sku_week')
    .select('*')

  if (itError) {
    throw new Error(`Failed to fetch in-transit data: ${itError.message}`)
  }

  // Build map: sku_code → Map<weekNumber, qty>
  const inTransitMap = new Map<string, Map<number, number>>()
  for (const row of inTransitRows || []) {
    const sku = row.sku as string
    if (!inTransitMap.has(sku)) {
      inTransitMap.set(sku, new Map())
    }
    const weekMap = inTransitMap.get(sku)!
    const weekNum = row.expected_week as number
    weekMap.set(weekNum, (weekMap.get(weekNum) || 0) + (row.in_transit_qty || 0))
  }

  // 4. Fetch customer forecast for the projection window
  //    Query inventory_data for future weeks with non-zero customer_forecast
  const { data: forecastRows, error: fcError } = await supabase
    .from('inventory_data')
    .select('sku_id, week_number, customer_forecast')
    .gte('week_number', currentWeek + 1)
    .lte('week_number', currentWeek + 20)
    .not('customer_forecast', 'is', null)
    .gt('customer_forecast', 0)

  if (fcError) {
    console.error('Warning: Could not fetch forecast data:', fcError.message)
    // Non-fatal — engine will fall back to historical demand
  }

  // Build map: sku_id → Map<weekNumber, forecastQty>
  const forecastMap = new Map<string, Map<number, number>>()
  for (const row of forecastRows || []) {
    if (!forecastMap.has(row.sku_id)) {
      forecastMap.set(row.sku_id, new Map())
    }
    forecastMap.get(row.sku_id)!.set(row.week_number, row.customer_forecast)
  }

  // 5. Build SKU master data map for suggestion enrichment
  const skuMap = new Map<string, SKUClassificationExtended>()
  for (const sku of skus || []) {
    skuMap.set(sku.sku_code, sku as SKUClassificationExtended)
  }

  // 6. Compute 20-week projections for each SKU (with forecast)
  const projections = (skus || []).map((sku: SKUClassificationExtended) => {
    const currentInventory = inventoryMap.get(sku.id) ?? 0
    const skuInTransit = inTransitMap.get(sku.sku_code) ?? new Map<number, number>()
    const skuForecast = forecastMap.get(sku.id) ?? undefined
    const skuHistoricalWeeks = weeklyInventoryMap.get(sku.id) ?? undefined
    
    return computeProjection(sku, currentInventory, currentWeek, skuInTransit, 20, skuForecast, skuHistoricalWeeks)
  })

  // 7. Generate enriched suggestions with SKU master data
  const suggestions = generateSuggestions(projections, currentWeek, skuMap)

  // 8. Compute summary (includes consolidated POs)
  const summary = computeProjectionSummary(projections, suggestions)

  return {
    currentWeek,
    projections,
    suggestions,
    summary,
    dataAsOf: new Date().toISOString(),
  }
}
