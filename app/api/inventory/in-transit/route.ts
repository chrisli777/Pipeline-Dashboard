import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: In-transit quantities by SKU and week
// Queries the in_transit_by_sku_week view and joins with skus for sku_id
export async function GET() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('in_transit_by_sku_week')
      .select('*')
      .gt('expected_week', 0) // Skip expired dates
      .order('sku')
      .order('expected_week')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Map sku (sku_code) to sku_id via skus table
    const { data: skus, error: skuError } = await supabase
      .from('skus')
      .select('id, sku_code')

    if (skuError) {
      return NextResponse.json({ error: skuError.message }, { status: 500 })
    }

    const skuCodeToId = new Map<string, string>()
    for (const s of skus || []) {
      if (s.sku_code) skuCodeToId.set(s.sku_code, s.id)
    }

    const inTransitData = (data || []).map((row) => ({
      sku: row.sku,
      sku_id: skuCodeToId.get(row.sku) || null,
      expected_week: row.expected_week,
      expected_arrival: row.expected_arrival,
      in_transit_qty: row.in_transit_qty,
      container_count: row.container_count,
      invoice_numbers: row.invoice_numbers || [],
      latest_status: row.latest_status,
    }))

    return NextResponse.json({ inTransitData })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch in-transit data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// POST: Trigger sync_in_transit_to_inventory() to refresh in-transit data in inventory_data
export async function POST() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('sync_in_transit_to_inventory')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${(data || []).length} in-transit records`,
      details: data,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync in-transit data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
