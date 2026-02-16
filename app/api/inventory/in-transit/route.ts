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

// POST: Trigger sync_and_rollover_inventory() to refresh ETD + in-transit data
export async function POST() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('sync_and_rollover_inventory')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = data || []
    const etdUpdated = results.filter((r: { field_out: string }) => r.field_out === 'etd')
    const inTransitUpdated = results.filter((r: { field_out: string }) => r.field_out === 'in_transit')
    const rolledOver = results.filter((r: { status_out: string }) => r.status_out === 'rolled_over')

    return NextResponse.json({
      success: true,
      message: `Synced ${etdUpdated.length} ETD + ${inTransitUpdated.length} in-transit records (${rolledOver.length} rolled over)`,
      details: results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync inventory data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
