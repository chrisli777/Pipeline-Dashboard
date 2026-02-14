import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: List all shipments with tracking status (5-stage model)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const supplier = searchParams.get('supplier')
    const search = searchParams.get('search')

    // Query shipments with tracking + containers via join
    let query = supabase
      .from('shipments')
      .select(`
        *,
        shipment_tracking (
          id,
          status,
          cleared_date,
          delivered_date,
          closed_date,
          duty_amount,
          entry_number,
          broker,
          lfd,
          lfd_extended,
          demurrage_amount,
          detention_amount,
          carrier,
          warehouse,
          delivery_reference,
          estimated_warehouse_date,
          wms_receipt_number,
          wms_received_qty,
          status_history,
          notes,
          created_at,
          updated_at
        ),
        shipment_containers (
          id, container_number, container_type, sku, sku_description,
          po_number, quantity, unit_price, total_amount, gross_weight
        )
      `)
      .order('eta', { ascending: true, nullsFirst: false })

    // Filter by supplier
    if (supplier && supplier !== 'ALL') {
      query = query.eq('supplier', supplier)
    }

    // Search by invoice, BOL, or SKU
    if (search) {
      // Find shipments containing matching SKU codes
      const { data: skuMatches } = await supabase
        .from('shipment_containers')
        .select('shipment_id')
        .ilike('sku', `%${search}%`)

      const skuShipmentIds = [...new Set(
        (skuMatches || []).map((r: { shipment_id: string }) => r.shipment_id)
      )]

      if (skuShipmentIds.length > 0) {
        const idFilter = skuShipmentIds.map(id => `id.eq.${id}`).join(',')
        query = query.or(
          `invoice_number.ilike.%${search}%,bol_number.ilike.%${search}%,${idFilter}`
        )
      } else {
        query = query.or(`invoice_number.ilike.%${search}%,bol_number.ilike.%${search}%`)
      }
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Transform data: flatten tracking into shipment object
    // Note: shipment_tracking is 1:1 (UNIQUE constraint) — Supabase returns object, not array
    const shipments = (data || []).map((s: Record<string, unknown>) => {
      const rawTracking = s.shipment_tracking as Record<string, unknown> | Record<string, unknown>[] | null
      const tracking = Array.isArray(rawTracking)
        ? (rawTracking.length > 0 ? rawTracking[0] : null)
        : rawTracking

      return {
        ...s,
        shipment_tracking: undefined,
        shipment_containers: undefined,
        tracking,
        containers: (s.shipment_containers as Record<string, unknown>[]) || [],
      }
    })

    // Filter by status after join (since status is in tracking table)
    let filtered = shipments
    if (status && status !== 'ALL') {
      filtered = shipments.filter(
        (s: Record<string, unknown>) => {
          const tracking = s.tracking as Record<string, unknown> | null
          return tracking?.status === status
        }
      )
    }

    return NextResponse.json({ shipments: filtered })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch shipments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
