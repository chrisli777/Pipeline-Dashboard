import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Run the rollover algorithm
// Moves in-transit quantities from past weeks to current week for undelivered shipments
export async function POST() {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('rollover_in_transit')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const results = data || []
    const rolledOver = results.filter((r: { status_out: string }) => r.status_out === 'rolled_over')

    return NextResponse.json({
      success: true,
      message: `Rolled over ${rolledOver.length} in-transit record(s) to current week`,
      details: results,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to run rollover', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
