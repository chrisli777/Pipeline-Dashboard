import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Update or create SKU machine model binding
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  const { skuCode, supplierCode, machineModel, multiplier } = await request.json()
  
  if (!skuCode) {
    return NextResponse.json({ error: 'skuCode is required' }, { status: 400 })
  }
  
  // Upsert the configuration
  const { error } = await supabase
    .from('forecast_multiplier_config')
    .upsert({
      sku_code: skuCode,
      supplier_code: supplierCode || 'UNKNOWN',
      part_model: machineModel || '',
      multiplier: multiplier ?? 1,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'supplier_code,sku_code'
    })
  
  if (error) {
    console.error('[v0] Error updating SKU model config:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}

// Delete SKU machine model binding
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  
  const { skuCode, supplierCode } = await request.json()
  
  if (!skuCode || !supplierCode) {
    return NextResponse.json({ error: 'skuCode and supplierCode are required' }, { status: 400 })
  }
  
  const { error } = await supabase
    .from('forecast_multiplier_config')
    .delete()
    .eq('sku_code', skuCode)
    .eq('supplier_code', supplierCode)
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}
