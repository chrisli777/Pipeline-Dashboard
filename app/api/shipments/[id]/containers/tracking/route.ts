import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: All container tracking for a shipment
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params
    const supabase = await createClient()

    // Get shipment info
    const { data: shipment, error: shipError } = await supabase
      .from('shipments')
      .select('id, invoice_number, supplier, etd, eta')
      .eq('id', shipmentId)
      .single()

    if (shipError) {
      return NextResponse.json({ error: 'Shipment not found' }, { status: 404 })
    }

    // Get shipment-level tracking
    const { data: tracking } = await supabase
      .from('shipment_tracking')
      .select('status, lfd, cleared_date, duty_amount, entry_number')
      .eq('shipment_id', shipmentId)
      .single()

    // Get container tracking from the dispatch view
    const { data: containers, error: ctError } = await supabase
      .from('v_container_dispatch')
      .select('*')
      .eq('shipment_id', shipmentId)
      .order('container_number')

    if (ctError) {
      return NextResponse.json({ error: ctError.message }, { status: 500 })
    }

    return NextResponse.json({
      shipment_id: shipment.id,
      invoice_number: shipment.invoice_number,
      supplier: shipment.supplier,
      shipment_status: tracking?.status || 'ON_WATER',
      lfd: tracking?.lfd || null,
      containers: containers || [],
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch container tracking', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
