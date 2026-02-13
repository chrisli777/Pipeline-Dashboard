import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Week 1 Monday is Dec 29, 2025
const WEEK1_MONDAY = new Date(2025, 11, 29)

// Convert a date string (YYYY-MM-DD) to a week number
function dateToWeekNumber(dateStr: string): number {
  const date = new Date(dateStr + 'T00:00:00')
  const diffTime = date.getTime() - WEEK1_MONDAY.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

// POST: Sync ETD from shipment data for a specific SKU and week range
// Looks up shipment_containers by SKU, joins shipment_tracking for shipped_date,
// maps shipped_date to week number, sums quantities per week, updates inventory_data.etd
export async function POST(request: Request) {
  try {
    const { skuId, weekNumber } = await request.json()

    if (!skuId || !weekNumber) {
      return NextResponse.json(
        { error: 'Missing skuId or weekNumber' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the date range for this week number
    const weekStart = new Date(WEEK1_MONDAY)
    weekStart.setDate(WEEK1_MONDAY.getDate() + (weekNumber - 1) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const startStr = weekStart.toISOString().split('T')[0]
    const endStr = weekEnd.toISOString().split('T')[0]

    // Query: join shipment_containers with shipment_tracking to get shipped_date
    // Filter by SKU and shipped_date within the week range
    const { data: containers, error: queryError } = await supabase
      .from('shipment_containers')
      .select(`
        sku,
        quantity,
        shipment_id,
        shipments!inner (
          id
        )
      `)
      .eq('sku', skuId)

    if (queryError) {
      return NextResponse.json(
        { error: 'Query failed', details: queryError.message },
        { status: 500 }
      )
    }

    if (!containers || containers.length === 0) {
      // No shipments found for this SKU, set ETD to 0
      const { error: updateError } = await supabase
        .from('inventory_data')
        .update({
          etd: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('sku_id', skuId)
        .eq('week_number', weekNumber)

      if (updateError) {
        return NextResponse.json(
          { error: 'Database update failed', details: updateError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        skuId,
        weekNumber,
        etd: 0,
        message: 'No shipments found for this SKU',
      })
    }

    // Get all shipment IDs from the containers
    const shipmentIds = [...new Set(containers.map((c: any) => c.shipment_id))]

    // Fetch shipped_date for those shipments from shipment_tracking
    const { data: trackingData, error: trackingError } = await supabase
      .from('shipment_tracking')
      .select('shipment_id, shipped_date')
      .in('shipment_id', shipmentIds)

    if (trackingError) {
      return NextResponse.json(
        { error: 'Tracking query failed', details: trackingError.message },
        { status: 500 }
      )
    }

    // Build a map of shipment_id -> shipped_date
    const shippedDateMap = new Map<string, string>()
    for (const t of trackingData || []) {
      if (t.shipped_date) {
        shippedDateMap.set(t.shipment_id, t.shipped_date)
      }
    }

    // Sum quantities for containers whose shipped_date falls in this week
    let totalEtd = 0
    for (const container of containers) {
      const shippedDate = shippedDateMap.get(container.shipment_id)
      if (!shippedDate) continue

      const shippedWeek = dateToWeekNumber(shippedDate)
      if (shippedWeek === weekNumber) {
        totalEtd += container.quantity || 0
      }
    }

    // Update inventory_data.etd for this SKU and week
    const { error: updateError } = await supabase
      .from('inventory_data')
      .update({
        etd: totalEtd,
        updated_at: new Date().toISOString(),
      })
      .eq('sku_id', skuId)
      .eq('week_number', weekNumber)

    if (updateError) {
      return NextResponse.json(
        { error: 'Database update failed', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      skuId,
      weekNumber,
      etd: totalEtd,
      dateRange: { start: startStr, end: endStr },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync ETD', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
