import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: Dashboard aggregated stats (5-stage model)
export async function GET() {
  try {
    const supabase = await createClient()

    // Get all shipments with tracking
    const { data: shipments, error: shipError } = await supabase
      .from('shipments')
      .select(`
        id, supplier, total_value, eta,
        shipment_tracking (status, lfd)
      `)

    if (shipError) {
      return NextResponse.json({ error: shipError.message }, { status: 500 })
    }

    // Get container-level stats
    const { data: containerStats } = await supabase
      .from('container_tracking')
      .select('status')

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const oneWeekLater = new Date(today)
    oneWeekLater.setDate(today.getDate() + 7)
    const threeDaysLater = new Date(today)
    threeDaysLater.setDate(today.getDate() + 3)

    // Calculate stats
    const stats = {
      on_water_count: 0,
      cleared_count: 0,
      delivering_count: 0,
      delivered_count: 0,
      active_shipments: 0,
      lfd_critical_count: 0,
      arriving_this_week: 0,
      total_value_in_transit: 0,
      // Container-level stats
      total_containers: 0,
      containers_cleared: 0,
      containers_delivering: 0,
      containers_delivered: 0,
      // Supplier breakdown
      amc_active: 0,
      hx_active: 0,
      tjjsh_active: 0,
      clark_active: 0,
    }

    // Container-level counts
    if (containerStats) {
      stats.total_containers = containerStats.length
      for (const ct of containerStats) {
        if (ct.status === 'CLEARED') stats.containers_cleared++
        else if (ct.status === 'DELIVERING') stats.containers_delivering++
        else if (ct.status === 'DELIVERED') stats.containers_delivered++
      }
    }

    for (const shipment of shipments || []) {
      // shipment_tracking is a 1:1 relation (UNIQUE constraint) — Supabase returns object, not array
      const rawTracking = shipment.shipment_tracking as { status: string; lfd: string | null } | Array<{ status: string; lfd: string | null }> | null
      const tracking = Array.isArray(rawTracking)
        ? (rawTracking.length > 0 ? rawTracking[0] : null)
        : rawTracking
      const status = tracking?.status || 'ON_WATER'
      const isActive = !['DELIVERED', 'CLOSED'].includes(status)

      // Status counts (5-stage model)
      if (status === 'ON_WATER') stats.on_water_count++
      if (status === 'CLEARED') stats.cleared_count++
      if (status === 'DELIVERING') stats.delivering_count++
      if (status === 'DELIVERED') stats.delivered_count++
      if (isActive) stats.active_shipments++

      // LFD critical (within 3 days)
      if (tracking?.lfd && isActive) {
        const lfd = new Date(tracking.lfd)
        if (lfd <= threeDaysLater) {
          stats.lfd_critical_count++
        }
      }

      // Arriving this week
      if (shipment.eta && isActive) {
        const eta = new Date(shipment.eta)
        if (eta >= today && eta <= oneWeekLater) {
          stats.arriving_this_week++
        }
      }

      // Total value in transit
      if (isActive) {
        stats.total_value_in_transit += shipment.total_value || 0
      }

      // By supplier (active only)
      if (isActive) {
        const supplier = shipment.supplier?.toUpperCase() || ''
        if (supplier === 'AMC') stats.amc_active++
        else if (supplier === 'HX') stats.hx_active++
        else if (supplier === 'TJJSH') stats.tjjsh_active++
        else if (supplier.includes('CLARK')) stats.clark_active++
      }
    }

    return NextResponse.json(stats)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
