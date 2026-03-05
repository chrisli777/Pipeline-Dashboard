import { createClient } from '@/lib/supabase/server'
import { getWmsToken } from '@/lib/wms-auth'
import { NextResponse } from 'next/server'

// POST: Sync delivery status by checking WMS receivers
// Calls WMS receivers API for each supplier/warehouse combo,
// collects ReferenceNumbers, matches them against container_number
// in v_container_dispatch, and updates matched containers to DELIVERED.
export async function POST() {
  try {
    const supabase = await createClient()

    // All WMS credential combos to check
    const combos = [
      { warehouse: 'Kent', supplier: 'AMC' },
      { warehouse: 'Kent', supplier: 'HX' },
      { warehouse: 'Moses Lake', supplier: 'HX' },
    ]

    // Date range: last 30 days to catch recent deliveries
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - 30)
    const start = startDate.toISOString().split('T')[0]
    const end = endDate.toISOString().split('T')[0]

    // Collect all ReferenceNumbers from all WMS combos
    const allReferences = new Set<string>()
    const comboResults: { combo: string; refs: number; error?: string }[] = []

    for (const combo of combos) {
      try {
        const wmsToken = await getWmsToken(combo.warehouse, combo.supplier)

        // RQL filter: receivers created within date range
        const rql = `ReadOnly.CreationDate=ge=${start}T00:00:00Z;ReadOnly.CreationDate=le=${end}T23:59:59Z`
        const encodedRql = encodeURIComponent(rql)

        let pageNum = 1
        let hasMore = true
        let comboRefCount = 0

        while (hasMore) {
          const wmsUrl = `https://secure-wms.com/inventory/receivers?pgsiz=100&pgnum=${pageNum}&rql=${encodedRql}`

          const wmsResponse = await fetch(wmsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${wmsToken}`,
              'Accept': 'application/json',
            },
          })

          if (!wmsResponse.ok) {
            const errorText = await wmsResponse.text()
            comboResults.push({
              combo: `${combo.warehouse}|${combo.supplier}`,
              refs: 0,
              error: `WMS ${wmsResponse.status}: ${errorText.slice(0, 100)}`,
            })
            break
          }

          const wmsData = await wmsResponse.json()
          const receivers = wmsData.ResourceList || []

          for (const receiver of receivers) {
            const ref = (receiver.ReferenceNumber || '').trim()
            if (ref) {
              allReferences.add(ref)
              comboRefCount++
            }
          }

          const totalResults = wmsData.TotalResults || 0
          if (pageNum * 100 >= totalResults || receivers.length === 0) {
            hasMore = false
          } else {
            pageNum++
          }
        }

        if (!comboResults.find(r => r.combo === `${combo.warehouse}|${combo.supplier}`)) {
          comboResults.push({
            combo: `${combo.warehouse}|${combo.supplier}`,
            refs: comboRefCount,
          })
        }
      } catch (err) {
        comboResults.push({
          combo: `${combo.warehouse}|${combo.supplier}`,
          refs: 0,
          error: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    if (allReferences.size === 0) {
      return NextResponse.json({
        success: true,
        message: 'No reference numbers found from WMS receivers in the last 30 days.',
        totalReferences: 0,
        deliveryMatches: 0,
        comboResults,
        matchedContainers: [],
      })
    }

    // Fetch all non-delivered containers from dispatch view
    const { data: containers, error: fetchErr } = await supabase
      .from('v_container_dispatch')
      .select('id, shipment_id, container_number, invoice_number, status')
      .in('status', ['CLEARED', 'DELIVERING'])

    if (fetchErr) {
      return NextResponse.json(
        { error: 'Failed to fetch containers', details: fetchErr.message },
        { status: 500 }
      )
    }

    if (!containers || containers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No CLEARED/DELIVERING containers to match against.',
        totalReferences: allReferences.size,
        deliveryMatches: 0,
        comboResults,
        matchedContainers: [],
      })
    }

    // Build a map of container_number (uppercase) -> container
    const byContainerNumber = new Map<string, typeof containers[0]>()
    for (const c of containers) {
      if (c.container_number) {
        byContainerNumber.set(c.container_number.toUpperCase(), c)
      }
    }

    // Match reference numbers against container_number
    const matched: { container_number: string; shipment_id: string; ref: string; prev_status: string }[] = []
    const today = new Date().toISOString().split('T')[0]

    for (const ref of allReferences) {
      const refUpper = ref.toUpperCase()
      const match = byContainerNumber.get(refUpper)
      if (match) {
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
      totalReferences: allReferences.size,
      deliveryMatches: matched.length,
      containersChecked: containers.length,
      comboResults,
      matchedContainers: matched,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync delivery failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
