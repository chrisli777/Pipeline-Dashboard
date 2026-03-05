import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Match provided reference numbers against container_number
// in v_container_dispatch and update matched containers to DELIVERED.
// Called by the Pipeline Dashboard after ATA sync collects reference numbers.
export async function POST(request: Request) {
  try {
    const { referenceNumbers } = await request.json()

    if (!referenceNumbers || !Array.isArray(referenceNumbers) || referenceNumbers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No reference numbers provided.',
        deliveryMatches: 0,
        matchedContainers: [],
      })
    }

    const supabase = await createClient()

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
        totalReferences: referenceNumbers.length,
        deliveryMatches: 0,
        containersChecked: 0,
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
    const alreadyMatched = new Set<string>()

    for (const ref of referenceNumbers) {
      const refUpper = (ref || '').trim().toUpperCase()
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
      totalReferences: referenceNumbers.length,
      deliveryMatches: matched.length,
      containersChecked: containers.length,
      matchedContainers: matched,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Sync delivery failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
