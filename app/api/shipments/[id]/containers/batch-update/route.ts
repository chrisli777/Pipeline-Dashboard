import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const CONTAINER_TRANSITIONS: Record<string, string[]> = {
  'ON_WATER': ['CLEARED'],
  'CLEARED': ['DELIVERING'],
  'DELIVERING': ['DELIVERED', 'CLEARED'],
  'DELIVERED': ['DELIVERING'],
  'CLOSED': [],
}

// POST: Batch update multiple containers in a shipment
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: shipmentId } = await params
    const body = await request.json()
    const { container_numbers, updates } = body

    if (!container_numbers || !Array.isArray(container_numbers) || container_numbers.length === 0) {
      return NextResponse.json({ error: 'container_numbers array is required' }, { status: 400 })
    }

    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Get current tracking for all requested containers
    const { data: existingContainers, error: fetchError } = await supabase
      .from('container_tracking')
      .select('*')
      .eq('shipment_id', shipmentId)
      .in('container_number', container_numbers)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!existingContainers || existingContainers.length === 0) {
      return NextResponse.json({ error: 'No matching containers found' }, { status: 404 })
    }

    // Validate status transitions for each container
    const targetStatus = updates.status
    const errors: string[] = []
    const validIds: string[] = []

    for (const container of existingContainers) {
      if (targetStatus && targetStatus !== container.status) {
        const allowed = CONTAINER_TRANSITIONS[container.status] || []
        if (!allowed.includes(targetStatus)) {
          errors.push(`${container.container_number}: ${container.status} → ${targetStatus} not allowed`)
          continue
        }
      }
      validIds.push(container.id)
    }

    if (validIds.length === 0) {
      return NextResponse.json(
        { error: 'No valid transitions', details: errors },
        { status: 400 }
      )
    }

    // Build update payload
    const updateData: Record<string, unknown> = {}
    if (updates.status) updateData.status = updates.status
    if (updates.picked_up_date !== undefined) updateData.picked_up_date = updates.picked_up_date
    if (updates.scheduled_delivery_date !== undefined) updateData.scheduled_delivery_date = updates.scheduled_delivery_date
    if (updates.delivered_date !== undefined) updateData.delivered_date = updates.delivered_date
    if (updates.carrier !== undefined) updateData.carrier = updates.carrier
    if (updates.warehouse !== undefined) updateData.warehouse = updates.warehouse
    if (updates.delivery_reference !== undefined) updateData.delivery_reference = updates.delivery_reference
    if (updates.estimated_warehouse_date !== undefined) updateData.estimated_warehouse_date = updates.estimated_warehouse_date
    if (updates.notes !== undefined) updateData.notes = updates.notes

    // Batch update all valid containers
    const { data: updated, error: updateError } = await supabase
      .from('container_tracking')
      .update(updateData)
      .in('id', validIds)
      .select()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Find containers that were not in the request
    const notFound = container_numbers.filter(
      (cn: string) => !existingContainers.find(c => c.container_number === cn)
    )

    return NextResponse.json({
      updated: updated || [],
      updatedCount: updated?.length || 0,
      errors: errors.length > 0 ? errors : undefined,
      notFound: notFound.length > 0 ? notFound : undefined,
      message: `Updated ${updated?.length || 0} containers${errors.length > 0 ? `, ${errors.length} skipped` : ''}`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to batch update', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
