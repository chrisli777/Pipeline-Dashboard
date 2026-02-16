import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_STATUSES = [
  'ON_WATER', 'CLEARED', 'DELIVERING', 'DELIVERED', 'CLOSED'
]

// Status transition rules (5-stage model)
const VALID_TRANSITIONS: Record<string, string[]> = {
  'ON_WATER': ['CLEARED', 'DELIVERING'],
  'CLEARED': ['DELIVERING'],
  'DELIVERING': ['DELIVERED'],
  'DELIVERED': ['CLOSED'],
  'CLOSED': [],
}

// PATCH: Update shipment tracking status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params
    const body = await request.json()
    const {
      status,
      cleared_date,
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
      delivered_date,
      wms_receipt_number,
      wms_received_qty,
      estimated_warehouse_date,
      notes,
    } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get current tracking
    const { data: existing, error: fetchError } = await supabase
      .from('shipment_tracking')
      .select('*')
      .eq('shipment_id', shipmentId)
      .single()

    if (fetchError) {
      // Create tracking record if it doesn't exist
      if (fetchError.code === 'PGRST116') {
        const newTracking: Record<string, unknown> = {
          shipment_id: shipmentId,
          status,
          notes,
          status_history: [{
            to_status: status,
            changed_at: new Date().toISOString(),
            notes: notes || `Status set to ${status}`,
          }],
        }
        if (cleared_date !== undefined) newTracking.cleared_date = cleared_date
        if (duty_amount !== undefined) newTracking.duty_amount = duty_amount
        if (entry_number !== undefined) newTracking.entry_number = entry_number
        if (broker !== undefined) newTracking.broker = broker
        if (lfd !== undefined) newTracking.lfd = lfd
        if (estimated_warehouse_date !== undefined) newTracking.estimated_warehouse_date = estimated_warehouse_date

        const { data: created, error: createError } = await supabase
          .from('shipment_tracking')
          .insert(newTracking)
          .select()
          .single()

        if (createError) {
          return NextResponse.json({ error: createError.message }, { status: 500 })
        }

        return NextResponse.json({ tracking: created, message: 'Tracking created' })
      }

      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    // Validate status transition
    const currentStatus = existing.status
    const allowedNext = VALID_TRANSITIONS[currentStatus] || []

    if (!allowedNext.includes(status) && status !== currentStatus) {
      return NextResponse.json(
        {
          error: `Invalid transition: ${currentStatus} → ${status}. Allowed: ${allowedNext.join(', ') || 'none'}`,
          currentStatus,
          allowedTransitions: allowedNext,
        },
        { status: 400 }
      )
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, unknown> = { status }

    if (cleared_date !== undefined) updateData.cleared_date = cleared_date
    if (delivered_date !== undefined) updateData.delivered_date = delivered_date
    if (duty_amount !== undefined) updateData.duty_amount = duty_amount
    if (entry_number !== undefined) updateData.entry_number = entry_number
    if (broker !== undefined) updateData.broker = broker
    if (lfd !== undefined) updateData.lfd = lfd
    if (lfd_extended !== undefined) updateData.lfd_extended = lfd_extended
    if (demurrage_amount !== undefined) updateData.demurrage_amount = demurrage_amount
    if (detention_amount !== undefined) updateData.detention_amount = detention_amount
    if (carrier !== undefined) updateData.carrier = carrier
    if (warehouse !== undefined) updateData.warehouse = warehouse
    if (delivery_reference !== undefined) updateData.delivery_reference = delivery_reference
    if (wms_receipt_number !== undefined) updateData.wms_receipt_number = wms_receipt_number
    if (wms_received_qty !== undefined) updateData.wms_received_qty = wms_received_qty
    if (estimated_warehouse_date !== undefined) updateData.estimated_warehouse_date = estimated_warehouse_date
    if (notes !== undefined) updateData.notes = notes

    const { data: updated, error: updateError } = await supabase
      .from('shipment_tracking')
      .update(updateData)
      .eq('shipment_id', shipmentId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // === Container-level cascade ===
    let containerUpdates = 0

    // When transitioning to CLEARED: update all container_tracking records to CLEARED
    if (status === 'CLEARED' && currentStatus === 'ON_WATER') {
      const { data: ctData, error: ctError } = await supabase
        .from('container_tracking')
        .update({
          status: 'CLEARED',
          notes: `Customs cleared. Entry: ${entry_number || 'N/A'}`,
        })
        .eq('shipment_id', shipmentId)
        .in('status', ['ON_WATER'])
        .select('id')

      if (!ctError && ctData) {
        containerUpdates = ctData.length
      }
    }

    // When transitioning to DELIVERED: auto-update ATA in inventory_data
    if (status === 'DELIVERED' && delivered_date) {
      try {
        const { data: deliveryResults } = await supabase.rpc('deliver_shipment_to_inventory', {
          p_shipment_id: shipmentId,
          p_delivered_date: delivered_date,
        })
        if (deliveryResults && deliveryResults.length > 0) {
          console.log(`Delivered shipment ${shipmentId}: updated ATA for ${deliveryResults.length} SKUs`)
        }
      } catch (deliverError) {
        console.error('Failed to auto-deliver to inventory:', deliverError)
      }
    }

    // When transitioning to CLOSED: update all container_tracking records to CLOSED
    if (status === 'CLOSED' && currentStatus === 'DELIVERED') {
      const { data: ctData, error: ctError } = await supabase
        .from('container_tracking')
        .update({
          status: 'CLOSED',
          notes: 'Shipment closed - costs settled',
        })
        .eq('shipment_id', shipmentId)
        .in('status', ['DELIVERED'])
        .select('id')

      if (!ctError && ctData) {
        containerUpdates = ctData.length
      }
    }

    return NextResponse.json({
      tracking: updated,
      message: `Status updated: ${currentStatus} → ${status}`,
      transition: { from: currentStatus, to: status },
      containerUpdates,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update tracking', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
