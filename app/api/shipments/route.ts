import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Compute fields that shipment_overview view provides via SQL
// Replicated here so we can still use the shipments table with full joins
function computeOverviewFields(shipment: Record<string, unknown>, tracking: Record<string, unknown> | null) {
  const eta = shipment.eta as string | null
  const status = (tracking?.status as string) || 'ON_WATER'
  const lfd = (tracking?.lfd as string | null)

  // days_since_eta: days since ETA (only for active shipments)
  let days_since_eta: number | null = null
  if (!['DELIVERED', 'CLOSED'].includes(status) && eta) {
    const etaDate = new Date(eta)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    etaDate.setHours(0, 0, 0, 0)
    days_since_eta = Math.floor((today.getTime() - etaDate.getTime()) / (1000 * 60 * 60 * 24))
  }

  // days_to_lfd: days remaining until LFD (only for CLEARED/DELIVERING)
  let days_to_lfd: number | null = null
  if (lfd && ['CLEARED', 'DELIVERING'].includes(status)) {
    const lfdDate = new Date(lfd)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    lfdDate.setHours(0, 0, 0, 0)
    days_to_lfd = Math.floor((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  // lfd_status: OK / WARNING / CRITICAL / OVERDUE / RESOLVED / N/A
  let lfd_status: string = 'N/A'
  if (!lfd) {
    lfd_status = 'N/A'
  } else if (['DELIVERED', 'CLOSED'].includes(status)) {
    lfd_status = 'RESOLVED'
  } else {
    const lfdDate = new Date(lfd)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    lfdDate.setHours(0, 0, 0, 0)
    const daysUntilLfd = Math.floor((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntilLfd <= 0) {
      lfd_status = 'OVERDUE'
    } else if (daysUntilLfd <= 3) {
      lfd_status = 'CRITICAL'
    } else if (daysUntilLfd <= 7) {
      lfd_status = 'WARNING'
    } else {
      lfd_status = 'OK'
    }
  }

  return { days_since_eta, days_to_lfd, lfd_status }
}

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

    // Transform data: flatten tracking into shipment object + add computed fields
    // Note: shipment_tracking is 1:1 (UNIQUE constraint) — Supabase returns object, not array
    const shipments = (data || []).map((s: Record<string, unknown>) => {
      const rawTracking = s.shipment_tracking as Record<string, unknown> | Record<string, unknown>[] | null
      const tracking = Array.isArray(rawTracking)
        ? (rawTracking.length > 0 ? rawTracking[0] : null)
        : rawTracking

      // Compute overview fields (same as shipment_overview view)
      const computed = computeOverviewFields(s, tracking)

      return {
        ...s,
        shipment_tracking: undefined,
        shipment_containers: undefined,
        // Promote status to top level for easier frontend access
        status: (tracking?.status as string) || 'ON_WATER',
        // Computed fields from shipment_overview logic
        days_since_eta: computed.days_since_eta,
        days_to_lfd: computed.days_to_lfd,
        lfd_status: computed.lfd_status,
        // Nested data
        tracking,
        containers: (s.shipment_containers as Record<string, unknown>[]) || [],
      }
    })

    // Filter by status (now available at top level)
    let filtered = shipments
    if (status && status !== 'ALL') {
      filtered = shipments.filter(
        (s: Record<string, unknown>) => s.status === status
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
