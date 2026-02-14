import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CONTAINER_TRANSITIONS: Record<string, string[]> = {
  'ON_WATER': ['CLEARED'],
  'CLEARED': ['DELIVERING'],
  'DELIVERING': ['DELIVERED', 'CLEARED'],  // Allow revert to CLEARED
  'DELIVERED': ['DELIVERING'],             // Allow revert to DELIVERING
  'CLOSED': [],
}

// PATCH: Update single container tracking
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; containerNumber: string }> }
) {
  try {
    const { id: shipmentId, containerNumber } = await params
    const decodedContainer = decodeURIComponent(containerNumber)
    const body = await request.json()
    const {
      status,
      picked_up_date,
      scheduled_delivery_date,
      delivered_date,
      carrier,
      warehouse,
      delivery_reference,
      estimated_warehouse_date,
      wms_receipt_number,
      wms_received_qty,
      notes,
    } = body

    const supabase = await createClient()

    // Get current container tracking
    const { data: existing, error: fetchError } = await supabase
      .from('container_tracking')
      .select('*')
      .eq('shipment_id', shipmentId)
      .eq('container_number', decodedContainer)
      .single()

    if (fetchError) {
      return NextResponse.json(
        { error: `Container ${decodedContainer} not found in shipment` },
        { status: 404 }
      )
    }

    // Build update
    const updateData: Record<string, unknown> = {}

    // Validate status transition if status change requested
    if (status && status !== existing.status) {
      const allowed = CONTAINER_TRANSITIONS[existing.status] || []
      if (!allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid container transition: ${existing.status} → ${status}. Allowed: ${allowed.join(', ') || 'none'}`,
            currentStatus: existing.status,
            allowedTransitions: allowed,
          },
          { status: 400 }
        )
      }
      updateData.status = status
    }

    if (picked_up_date !== undefined) updateData.picked_up_date = picked_up_date
    if (scheduled_delivery_date !== undefined) updateData.scheduled_delivery_date = scheduled_delivery_date
    if (delivered_date !== undefined) updateData.delivered_date = delivered_date
    if (carrier !== undefined) updateData.carrier = carrier
    if (warehouse !== undefined) updateData.warehouse = warehouse
    if (delivery_reference !== undefined) updateData.delivery_reference = delivery_reference
    if (estimated_warehouse_date !== undefined) updateData.estimated_warehouse_date = estimated_warehouse_date
    if (wms_receipt_number !== undefined) updateData.wms_receipt_number = wms_receipt_number
    if (wms_received_qty !== undefined) updateData.wms_received_qty = wms_received_qty
    if (notes !== undefined) updateData.notes = notes

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Note: status_history and shipment status auto-derivation handled by DB triggers
    const { data: updated, error: updateError } = await supabase
      .from('container_tracking')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // When container transitions to DELIVERED, update inventory (ATA + refresh in-transit)
    let inventoryResult = null
    if (status === 'DELIVERED') {
      const deliveryDate = delivered_date || new Date().toISOString().split('T')[0]
      const { data: invData, error: invError } = await supabase.rpc(
        'deliver_container_to_inventory',
        {
          p_shipment_id: shipmentId,
          p_container_number: decodedContainer,
          p_delivered_date: deliveryDate,
        }
      )
      if (invError) {
        // Log but don't fail the container update — inventory sync is secondary
        console.error('deliver_container_to_inventory error:', invError.message)
        inventoryResult = { error: invError.message }
      } else {
        inventoryResult = invData
      }
    }

    return NextResponse.json({
      container: updated,
      message: status
        ? `Container ${decodedContainer}: ${existing.status} → ${status}`
        : `Container ${decodedContainer} updated`,
      inventorySync: inventoryResult,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update container', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
