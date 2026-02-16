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

  // 2. Fetch current inventory for each SKU
  const { data: inventoryRows, error: invError } = await supabase
    .from('inventory_data')
    .select('sku_id, actual_inventory, week_number')
    .gte('week_number', currentWeek - 4)
    .lte('week_number', currentWeek)
    .not('actual_inventory', 'is', null)
    .order('week_number', { ascending: false })

  if (invError) {
    throw new Error(`Failed to fetch inventory data: ${invError.message}`)
  }

  // Build map: sku_id -> latest actual_inventory
  const inventoryMap = new Map<string, number>()
  for (const row of inventoryRows || []) {
    if (!inventoryMap.has(row.sku_id)) {
      inventoryMap.set(row.sku_id, row.actual_inventory || 0)
    }
  }

  // 3. Fetch in-transit data by SKU and week
  const { data: inTransitRows, error: itError } = await supabase
    .from('in_transit_by_sku_week')
    .select('*')

  if (itError) {
    throw new Error(`Failed to fetch in-transit data: ${itError.message}`)
  }

  // Build map: sku_code -> Map<weekNumber, qty>
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

  // Build map: sku_id -> Map<weekNumber, forecastQty>
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

    return computeProjection(sku, currentInventory, currentWeek, skuInTransit, 20, skuForecast)
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
