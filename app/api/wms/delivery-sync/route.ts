import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Calculate week dates from week number
// Weeks run Sunday to Saturday
// Week 1: Dec 28, 2025 (Sun) - Jan 3, 2026 (Sat)
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  const week1Sunday = new Date(2025, 11, 28) // Dec 28, 2025 (Sunday)
  const weekSunday = new Date(week1Sunday)
  weekSunday.setDate(week1Sunday.getDate() + (weekNumber - 1) * 7)

  const nextSunday = new Date(weekSunday)
  nextSunday.setDate(weekSunday.getDate() + 7)

  return {
    start: formatDateForRQL(weekSunday),
    end: formatDateForRQL(nextSunday),
  }
}

function formatDateForRQL(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}T00:00:00`
}

// POST: Fetch ALL WMS receivers in a date range (no SKU filter),
// collect reference numbers, match against containers, update statuses
export async function POST(request: Request) {
  try {
    const { weekStart, weekEnd } = await request.json()

    if (!weekStart || !weekEnd) {
      return NextResponse.json(
        { error: 'Missing weekStart or weekEnd' },
        { status: 400 }
      )
    }

    // Calculate the full date range across all weeks
    const { start } = getWeekDateRange(weekStart)
    const { end } = getWeekDateRange(weekEnd)

    const supabase = await createClient()

    // We need to fetch receivers from ALL warehouses/suppliers
    // Try each credential set to get all receivers
    const { getWmsToken } = await import('@/lib/wms-auth')

    const warehouseConfigs = [
      { warehouse: 'Moses Lake', supplier: 'HX' },
      { warehouse: 'Kent', supplier: 'HX' },
      { warehouse: 'Kent', supplier: 'AMC' },
    ]

    const allReferenceNumbers: string[] = []
    const errors: string[] = []

    for (const config of warehouseConfigs) {
      try {
        const wmsToken = await getWmsToken(config.warehouse, config.supplier)

        // Build WMS receivers API URL - NO SKU filter, only date range
        const rql = `readOnly.status==1;arrivalDate=ge=${start};arrivalDate=lt=${end}`
        const encodedRql = encodeURIComponent(rql)

        let pageNum = 1
        let hasMore = true

        while (hasMore) {
          const wmsUrl = `https://secure-wms.com/inventory/receivers?detail=ReceiveItems&pgsiz=100&pgnum=${pageNum}&rql=${encodedRql}`

          const wmsResponse = await fetch(wmsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${wmsToken}`,
              'Accept': 'application/json',
            },
          })

          if (!wmsResponse.ok) {
            errors.push(`${config.warehouse}/${config.supplier}: WMS API error ${wmsResponse.status}`)
            break
          }

          const wmsData = await wmsResponse.json()
          const receivers = wmsData.ResourceList || []

          // Collect ALL ReferenceNumbers - no SKU filtering
          for (const receiver of receivers) {
            const ref = (receiver.ReferenceNumber || '').trim()
            if (ref && !allReferenceNumbers.includes(ref)) {
              allReferenceNumbers.push(ref)
            }
          }

          const totalResults = wmsData.TotalResults || 0
          if (pageNum * 100 >= totalResults || receivers.length === 0) {
            hasMore = false
          } else {
            pageNum++
          }
        }
      } catch (err) {
        errors.push(`${config.warehouse}/${config.supplier}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    if (allReferenceNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No reference numbers found from WMS receivers.',
        totalReferences: 0,
        deliveryMatches: 0,
        matchedContainers: [],
        errors: errors.length > 0 ? errors : undefined,
        dateRange: { start, end },
      })
    }

    // Now match reference numbers against container_number in v_container_dispatch
    // Fetch all non-delivered containers
    const { data: containers, error: fetchErr } = await supabase
      .from('v_container_dispatch')
      .select('id, shipment_id, container_number, invoice_number, status')
      .in('status', ['ON_WATER', 'CLEARED', 'DELIVERING'])

    if (fetchErr) {
      return NextResponse.json(
        { error: 'Failed to fetch containers', details: fetchErr.message },
        { status: 500 }
      )
    }

    // Build a map of container_number (uppercase) -> container
    const byContainerNumber = new Map<string, (typeof containers)[0]>()
    for (const c of containers || []) {
      if (c.container_number) {
        byContainerNumber.set(c.container_number.toUpperCase(), c)
      }
    }

    // Match reference numbers against container_number
    const matched: { container_number: string; shipment_id: string; ref: string; prev_status: string }[] = []
    const today = new Date().toISOString().split('T')[0]
    const alreadyMatched = new Set<string>()

    for (const ref of allReferenceNumbers) {
      const refUpper = ref.trim().toUpperCase()
      if (!refUpper || alreadyMatched.has(refUpper)) continue

      const match = byContainerNumber.get(refUpper)
      if (match) {
        alreadyMatched.add(refUpper)

        // Update container_tracking to DELIVERED
        const { error: ctErr } = await supabase
          .from('container_tracking')
          .update({
            status: 'DELIVERED',
            delivered_date: today,
          })
          .eq('shipment_id', match.shipment_id)
          .eq('container_number', match.container_number)

        if (!ctErr) {
          matched.push({
            container_number: match.container_number,
            shipment_id: match.shipment_id,
            ref,
            prev_status: match.status,
          })

          // Check if ALL containers for this shipment are now DELIVERED
          const { data: shipmentContainers } = await supabase
            .from('container_tracking')
            .select('id, status')
            .eq('shipment_id', match.shipment_id)

          if (shipmentContainers) {
            const allDelivered = shipmentContainers.every(c => c.status === 'DELIVERED')
            if (allDelivered) {
              // Update shipment_tracking to DELIVERED too
              await supabase
                .from('shipment_tracking')
                .update({
                  status: 'DELIVERED',
                  delivered_date: today,
                })
                .eq('shipment_id', match.shipment_id)
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      totalReferences: allReferenceNumbers.length,
      deliveryMatches: matched.length,
      containersChecked: containers?.length || 0,
      matchedContainers: matched,
      errors: errors.length > 0 ? errors : undefined,
      dateRange: { start, end },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Delivery sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
