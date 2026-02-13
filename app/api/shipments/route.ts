import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Fetch shipment overview
  const { data: shipments, error: shipmentsError } = await supabase
    .from('shipment_overview')
    .select('*')
    .order('etd', { ascending: false })

  if (shipmentsError) {
    return NextResponse.json({ error: shipmentsError.message }, { status: 500 })
  }

  // Fetch tracking data for all shipments
  const { data: tracking, error: trackingError } = await supabase
    .from('shipment_tracking')
    .select('*')

  if (trackingError) {
    return NextResponse.json({ error: trackingError.message }, { status: 500 })
  }

  // Fetch containers for all shipments
  const { data: containers, error: containersError } = await supabase
    .from('shipment_containers')
    .select('*')

  if (containersError) {
    return NextResponse.json({ error: containersError.message }, { status: 500 })
  }

  // Build tracking map: shipment_id -> tracking
  const trackingMap = new Map<string, typeof tracking[0]>()
  for (const t of tracking) {
    trackingMap.set(t.shipment_id, t)
  }

  // Build containers map: shipment_id -> containers[]
  const containersMap = new Map<string, typeof containers>()
  for (const c of containers) {
    if (!containersMap.has(c.shipment_id)) {
      containersMap.set(c.shipment_id, [])
    }
    containersMap.get(c.shipment_id)!.push(c)
  }

  // Merge everything into nested response
  const enrichedShipments = shipments.map((s) => ({
    ...s,
    tracking: trackingMap.get(s.id) || null,
    containers: containersMap.get(s.id) || [],
  }))

  return NextResponse.json({ shipments: enrichedShipments })
}
