import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// PATCH: Update classification policy for a matrix cell
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { matrix_cell, service_level, target_woh, review_frequency, replenishment_method, safety_stock_multiplier, notes } = body

    if (!matrix_cell) {
      return NextResponse.json({ error: 'matrix_cell is required' }, { status: 400 })
    }

    const supabase = await createClient()

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (service_level !== undefined) updateData.service_level = service_level
    if (target_woh !== undefined) updateData.target_woh = target_woh
    if (review_frequency !== undefined) updateData.review_frequency = review_frequency
    if (replenishment_method !== undefined) updateData.replenishment_method = replenishment_method
    if (safety_stock_multiplier !== undefined) updateData.safety_stock_multiplier = safety_stock_multiplier
    if (notes !== undefined) updateData.notes = notes

    const { data, error } = await supabase
      .from('classification_policies')
      .update(updateData)
      .eq('matrix_cell', matrix_cell)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      policy: data,
      message: `Policy for ${matrix_cell} updated`,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update policy', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
