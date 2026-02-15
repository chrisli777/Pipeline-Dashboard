import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  computeProjection,
  generateSuggestions,
  computeProjectionSummary,
  getCurrentWeekNumber,
} from '@/lib/replenishment-engine'
import type { SKUClassificationExtended } from '@/lib/types'

// GET: Compute 20-week inventory projection for all classified SKUs
export async function GET() {
  try {
    const supabase = await createClient()
    const currentWeek = getCurrentWeekNumber()

    // 1. Fetch classified SKUs (with policy fields from enhanced view)
    const { data: skus, error: skuError } = await supabase
      .from('v_sku_classification')
      .select('*')

    if (skuError) {
      return NextResponse.json({ error: skuError.message }, { status: 500 })
    }

    // 2. Fetch current inventory for each SKU
    //    Get the most recent week with actual_inventory data
    const { data: inventoryRows, error: invError } = await supabase
      .from('inventory_data')
      .select('sku_id, actual_inventory, week_number')
      .gte('week_number', currentWeek - 4)  // look back up to 4 weeks
      .lte('week_number', currentWeek)
      .not('actual_inventory', 'is', null)
      .order('week_number', { ascending: false })

    if (invError) {
      return NextResponse.json({ error: invError.message }, { status: 500 })
    }

    // Build map: sku_id → latest actual_inventory
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
      return NextResponse.json({ error: itError.message }, { status: 500 })
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

    // 4. Build SKU master data map for suggestion enrichment
    const skuMap = new Map<string, SKUClassificationExtended>()
    for (const sku of skus || []) {
      skuMap.set(sku.sku_code, sku as SKUClassificationExtended)
    }

    // 5. Compute 20-week projections for each SKU
    const projections = (skus || []).map((sku: SKUClassificationExtended) => {
      const currentInventory = inventoryMap.get(sku.id) ?? 0
      const skuInTransit = inTransitMap.get(sku.sku_code) ?? new Map<number, number>()

      return computeProjection(sku, currentInventory, currentWeek, skuInTransit, 20)
    })

    // 6. Generate enriched suggestions with SKU master data
    const suggestions = generateSuggestions(projections, currentWeek, skuMap)

    // 7. Compute summary (includes consolidated POs)
    const summary = computeProjectionSummary(projections, suggestions)

    return NextResponse.json({
      currentWeek,
      projections,
      suggestions,
      summary,
      dataAsOf: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to compute projections', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
