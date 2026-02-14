import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: Single shipment with tracking + containers
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get shipment with tracking and containers
    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        shipment_tracking (
          id, status,
          cleared_date, delivered_date, closed_date,
          duty_amount, entry_number, broker, lfd, lfd_extended,
          demurrage_amount, detention_amount, carrier, warehouse,
          delivery_reference, estimated_warehouse_date,
          wms_receipt_number, wms_received_qty,
          status_history, notes, created_at, updated_at
        ),
        shipment_containers (
          id, container_number, container_type, sku, sku_description,
          po_number, quantity, unit_price, total_amount, gross_weight
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    // Flatten tracking — 1:1 relation returns object, not array
    const rawTracking = data.shipment_tracking as Record<string, unknown> | Record<string, unknown>[] | null
    const tracking = Array.isArray(rawTracking)
      ? (rawTracking.length > 0 ? rawTracking[0] : null)
      : rawTracking

    const result = {
      ...data,
      shipment_tracking: undefined,
      tracking,
      containers: data.shipment_containers || [],
    }

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch shipment', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
