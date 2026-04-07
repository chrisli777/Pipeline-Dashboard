/**
 * Phase 3F — Shared Replenishment Data Layer
 *
 * Uses the SAME calculated data from Pipeline Dashboard.
 * Fetches data from /api/pipeline/calculated to ensure consistency.
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
 * Fetch pipeline data and compute projections using the SAME calculated 
 * actual inventory data from Pipeline Dashboard.
 */
export async function fetchAndComputeProjections(): Promise<ProjectionResult> {
  const supabase = await createClient()
  const currentWeek = getCurrentWeekNumber()

  // 1. Fetch classified SKUs
  const { data: skus, error: skuError } = await supabase
    .from('v_sku_classification')
    .select('*')

  if (skuError) {
    throw new Error(`Failed to fetch SKU classification: ${skuError.message}`)
  }

  // 2. Fetch ALL inventory data and calculate using Pipeline Dashboard logic
  const { data: inventoryData, error: invError } = await supabase
    .from('inventory_data')
    .select('*')
    .order('week_number', { ascending: true })

  if (invError) {
    throw new Error(`Failed to fetch inventory data: ${invError.message}`)
  }

  // 3. Fetch SKU metadata for enrichment
  const { data: skusMeta, error: metaError } = await supabase
    .from('skus')
    .select('*')

  if (metaError) {
    throw new Error(`Failed to fetch SKU metadata: ${metaError.message}`)
  }

  // 4. Calculate inventory using EXACT SAME LOGIC as Pipeline Dashboard
  const pipelineData = transformToPipelineData(inventoryData || [], skusMeta || [])
  
  // Build inventory map and weekly data map from calculated pipeline data
  const inventoryMap = new Map<string, number>()
  const weeklyInventoryMap = new Map<string, Map<number, { actualInventory: number; consumption: number; ata: number }>>()
  
  for (const sku of pipelineData) {
    // Find current week's actual inventory
    const currentWeekData = sku.weeks.find((w: any) => w.weekNumber === currentWeek)
    inventoryMap.set(sku.id, currentWeekData?.actualInventory ?? 0)
    
    // Build weekly data map for historical weeks
    const weekMap = new Map<number, { actualInventory: number; consumption: number; ata: number }>()
    for (const week of sku.weeks) {
      weekMap.set(week.weekNumber, {
        actualInventory: week.actualInventory ?? 0,
        consumption: week.actualConsumption ?? week.customerForecast ?? 0,
        ata: week.ata ?? 0,
      })
    }
    weeklyInventoryMap.set(sku.id, weekMap)
  }

  // 5. Fetch in-transit data
  const { data: inTransitRows, error: itError } = await supabase
    .from('in_transit_by_sku_week')
    .select('*')

  if (itError) {
    throw new Error(`Failed to fetch in-transit data: ${itError.message}`)
  }

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

  // 6. Fetch customer forecast
  const { data: forecastRows, error: fcError } = await supabase
    .from('inventory_data')
    .select('sku_id, week_number, customer_forecast')
    .gte('week_number', currentWeek + 1)
    .lte('week_number', currentWeek + 20)
    .not('customer_forecast', 'is', null)
    .gt('customer_forecast', 0)

  if (fcError) {
    console.error('Warning: Could not fetch forecast data:', fcError.message)
  }

  const forecastMap = new Map<string, Map<number, number>>()
  for (const row of forecastRows || []) {
    if (!forecastMap.has(row.sku_id)) {
      forecastMap.set(row.sku_id, new Map())
    }
    forecastMap.get(row.sku_id)!.set(row.week_number, row.customer_forecast)
  }

  // 7. Build SKU master map
  const skuMap = new Map<string, SKUClassificationExtended>()
  for (const sku of skus || []) {
    skuMap.set(sku.sku_code, sku as SKUClassificationExtended)
  }

  // 8. Compute projections with Pipeline Dashboard's calculated data
  const projections = (skus || []).map((sku: SKUClassificationExtended) => {
    const currentInventory = inventoryMap.get(sku.id) ?? 0
    const skuInTransit = inTransitMap.get(sku.sku_code) ?? new Map<number, number>()
    const skuForecast = forecastMap.get(sku.id) ?? undefined
    const skuHistoricalWeeks = weeklyInventoryMap.get(sku.id) ?? undefined
    
    return computeProjection(sku, currentInventory, currentWeek, skuInTransit, 20, skuForecast, skuHistoricalWeeks)
  })

  // 9. Generate suggestions
  const suggestions = generateSuggestions(projections, currentWeek, skuMap)

  // 10. Compute summary
  const summary = computeProjectionSummary(projections, suggestions)

  return {
    currentWeek,
    projections,
    suggestions,
    summary,
    dataAsOf: new Date().toISOString(),
  }
}

/**
 * Transform database data to calculated format using EXACT SAME LOGIC as Pipeline Dashboard
 */
function transformToPipelineData(inventoryData: any[], skusMeta: any[] = []) {
  const skuMetaMap = new Map<string, any>()
  skusMeta.forEach((s) => skuMetaMap.set(s.id, s))

  const skuMap = new Map<string, any>()

  inventoryData.forEach((row) => {
    if (!skuMap.has(row.sku_id)) {
      const meta = skuMetaMap.get(row.sku_id)
      skuMap.set(row.sku_id, {
        id: row.sku_id,
        supplierCode: row.supplier_code || null,
        weeks: [],
        allWeeks: [],
      })
    }

    const sku = skuMap.get(row.sku_id)!
    const etaValue = row.eta != null ? Number(row.eta) : null
    const rawAtaFromDb = row.ata
    
    sku.allWeeks.push({
      weekNumber: row.week_number,
      customerForecast: row.customer_forecast !== null ? Number(row.customer_forecast) : null,
      actualConsumption: row.actual_consumption !== null ? Number(row.actual_consumption) : Number(row.customer_forecast),
      etd: row.etd !== null ? Number(row.etd) : null,
      eta: etaValue,
      ata: etaValue ?? 0,
      rawAtaFromDb: rawAtaFromDb,
      actualInventory: row.actual_inventory !== null ? Number(row.actual_inventory) : null,
    })
  })

  // Process each SKU using Pipeline Dashboard logic
  skuMap.forEach((sku) => {
    sku.allWeeks.sort((a: any, b: any) => a.weekNumber - b.weekNumber)
    
    // Build ETD lookup
    const etdByWeek = new Map<number, number | null>()
    for (const w of sku.allWeeks) {
      etdByWeek.set(w.weekNumber, w.etd)
    }
    
    // ETA calculation
    for (const w of sku.allWeeks) {
      if (w.eta === null) {
        const sourceWeek = w.weekNumber - 6
        const sourceEtd = etdByWeek.get(sourceWeek)
        w.eta = sourceEtd ?? 0
      }
    }
    
    // ATA rollover logic - EXACT SAME as Pipeline Dashboard
    let lastSyncedWeekIndex = -1
    for (let i = sku.allWeeks.length - 1; i >= 0; i--) {
      if (sku.allWeeks[i].rawAtaFromDb !== null) {
        lastSyncedWeekIndex = i
        break
      }
    }

    if (lastSyncedWeekIndex === -1) {
      for (let i = 0; i < sku.allWeeks.length; i++) {
        sku.allWeeks[i].ata = sku.allWeeks[i].eta ?? 0
      }
    } else {
      let totalSyncedAta = 0
      let totalEtaUpToSynced = 0
      for (let i = 0; i <= lastSyncedWeekIndex; i++) {
        totalSyncedAta += sku.allWeeks[i].rawAtaFromDb ?? 0
        totalEtaUpToSynced += sku.allWeeks[i].eta ?? 0
        sku.allWeeks[i].ata = sku.allWeeks[i].rawAtaFromDb ?? 0
      }
      
      let remainingSyncedAta = totalSyncedAta - totalEtaUpToSynced
      let batchEnded = false
      
      for (let i = lastSyncedWeekIndex + 1; i < sku.allWeeks.length; i++) {
        const weekEta = sku.allWeeks[i].eta ?? 0
        
        if (batchEnded) {
          sku.allWeeks[i].ata = weekEta
        } else if (weekEta === 0) {
          sku.allWeeks[i].ata = 0
          batchEnded = true
        } else if (remainingSyncedAta >= weekEta) {
          remainingSyncedAta -= weekEta
          sku.allWeeks[i].ata = 0
        } else if (remainingSyncedAta > 0) {
          sku.allWeeks[i].ata = weekEta - remainingSyncedAta
          remainingSyncedAta = 0
        } else {
          sku.allWeeks[i].ata = weekEta
        }
      }
    }

    // Calculate actual inventory - EXACT SAME as Pipeline Dashboard
    const week1Index = sku.allWeeks.findIndex((w: any) => w.weekNumber === 1)
    if (week1Index >= 0) {
      for (let i = week1Index + 1; i < sku.allWeeks.length; i++) {
        const prevWeek = sku.allWeeks[i - 1]
        const currentWeek = sku.allWeeks[i]
        const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
        const ata = currentWeek.ata ?? 0
        const prevInventory = prevWeek.actualInventory ?? 0
        currentWeek.actualInventory = prevInventory - consumption + ata
      }
    }
    
    // Keep weeks >= 1
    sku.weeks = sku.allWeeks.filter((w: any) => w.weekNumber >= 1)
  })

  return Array.from(skuMap.values())
}
