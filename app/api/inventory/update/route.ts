import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  
  const { skuId, weekNumber, field, value } = await request.json()

  if (!skuId || weekNumber === undefined || !field) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Map frontend field names to database column names
  const fieldMapping: Record<string, string> = {
    customerForecast: 'customer_forecast',
    actualConsumption: 'actual_consumption',
    etd: 'etd',
    eta: 'ata',
    ata: 'ata',
    inTransit: 'in_transit',
    defect: 'defect',
    actualInventory: 'actual_inventory',
  }

  const dbField = fieldMapping[field]
  if (!dbField) {
    return NextResponse.json({ error: 'Invalid field' }, { status: 400 })
  }

  // Update the inventory_data record
  const { error: updateError } = await supabase
    .from('inventory_data')
    .update({ 
      [dbField]: value,
      updated_at: new Date().toISOString()
    })
    .eq('sku_id', skuId)
    .eq('week_number', weekNumber)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // The trigger will automatically recalculate inventory
  // Fetch updated data for this SKU
  const { data: updatedData, error: fetchError } = await supabase
    .from('inventory_dashboard')
    .select('*')
    .eq('sku_id', skuId)
    .order('week_number')

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, updatedData })
}
