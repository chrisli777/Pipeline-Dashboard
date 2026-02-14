import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Run the sync + rollover algorithm
// Clears and recomputes both ETD and in-transit quantities in inventory_data
// Rolls over past-due weeks to current week (idempotent: safe to run multiple times)
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
      { error: 'Failed to run sync and rollover', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
