import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Deliver a shipment — updates ATA in inventory_data and refreshes in-transit
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params
    const body = await request.json()
    const { delivered_date } = body

    if (!delivered_date) {
      return NextResponse.json(
        { error: 'delivered_date is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Call the DB function to deliver the shipment
    const { data, error } = await supabase.rpc('deliver_shipment_to_inventory', {
      p_shipment_id: shipmentId,
      p_delivered_date: delivered_date,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Summarize results
    const results = data || []
    const delivered = results.filter((r: { status_out: string }) => r.status_out === 'delivered')
    const errors = results.filter((r: { status_out: string }) => r.status_out !== 'delivered')

    return NextResponse.json({
      success: true,
      message: `Updated ATA for ${delivered.length} SKU(s)`,
      deliveredSkus: delivered,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to deliver shipment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
