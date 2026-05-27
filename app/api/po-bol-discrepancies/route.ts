import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// GET - List all discrepancies with optional filters
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const warehouse = searchParams.get('warehouse')
  const supplier = searchParams.get('supplier')
  const status = searchParams.get('status')
  const resolved = searchParams.get('resolved')
  
  let query = supabase
    .from('po_bol_discrepancies')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (warehouse) {
    query = query.eq('warehouse', warehouse)
  }
  if (supplier) {
    query = query.eq('supplier_code', supplier)
  }
  if (status) {
    query = query.eq('status', status)
  }
  if (resolved === 'true') {
    query = query.not('resolved_at', 'is', null)
  } else if (resolved === 'false') {
    query = query.is('resolved_at', null)
  }
  
  const { data, error } = await query
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ discrepancies: data })
}

// POST - Add a new discrepancy to archive
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const {
    orderId,
    referenceNumber,
    warehouse,
    supplierCode,
    customerName,
    processDate,
    status,
    bolData,
    poData,
    comparisonData,
    errorMessage
  } = body
  
  // Upsert - update if exists, insert if new
  const { data, error } = await supabase
    .from('po_bol_discrepancies')
    .upsert({
      order_id: orderId,
      reference_number: referenceNumber,
      warehouse,
      supplier_code: supplierCode,
      customer_name: customerName,
      process_date: processDate,
      status,
      bol_data: bolData,
      po_data: poData,
      comparison_data: comparisonData,
      error_message: errorMessage,
      updated_at: new Date().toISOString(),
      resolved_at: null // Reset resolved status on re-archive
    }, {
      onConflict: 'order_id,warehouse,supplier_code'
    })
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ discrepancy: data })
}

// DELETE - Remove a discrepancy (when resolved)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  
  const id = searchParams.get('id')
  const orderId = searchParams.get('orderId')
  const warehouse = searchParams.get('warehouse')
  const supplier = searchParams.get('supplier')
  
  let query = supabase.from('po_bol_discrepancies').delete()
  
  if (id) {
    query = query.eq('id', id)
  } else if (orderId && warehouse && supplier) {
    query = query
      .eq('order_id', orderId)
      .eq('warehouse', warehouse)
      .eq('supplier_code', supplier)
  } else {
    return NextResponse.json({ error: 'Must provide id or (orderId, warehouse, supplier)' }, { status: 400 })
  }
  
  const { error } = await query
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

// PATCH - Update discrepancy (mark as resolved, increment reparse count)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const body = await request.json()
  
  const { id, resolved, incrementReparse, ...updates } = body
  
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  
  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString()
  }
  
  if (resolved) {
    updateData.resolved_at = new Date().toISOString()
  }
  
  // If incrementReparse, we need to do a special update
  if (incrementReparse) {
    const { data, error } = await supabase
      .from('po_bol_discrepancies')
      .update({
        ...updateData,
        reparse_count: supabase.rpc ? undefined : 1 // fallback
      })
      .eq('id', id)
      .select()
      .single()
    
    // Increment reparse_count separately
    await supabase.rpc('increment_reparse_count', { discrepancy_id: id }).catch(() => {
      // If RPC doesn't exist, do manual increment
      supabase
        .from('po_bol_discrepancies')
        .select('reparse_count')
        .eq('id', id)
        .single()
        .then(({ data: current }) => {
          if (current) {
            supabase
              .from('po_bol_discrepancies')
              .update({ reparse_count: (current.reparse_count || 0) + 1 })
              .eq('id', id)
          }
        })
    })
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ discrepancy: data })
  }
  
  const { data, error } = await supabase
    .from('po_bol_discrepancies')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ discrepancy: data })
}
