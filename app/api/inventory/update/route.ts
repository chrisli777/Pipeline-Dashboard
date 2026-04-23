import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  // Check user role from session cookie - viewer cannot update database
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('whi_session')
  if (sessionCookie) {
    try {
      const session = JSON.parse(sessionCookie.value)
      if (session.role === 'viewer') {
        // Viewer role cannot update database - return success but don't actually save
        // This ensures the frontend thinks save succeeded but data is not persisted
        return NextResponse.json({ success: true, viewerMode: true, message: 'Changes saved locally only (viewer mode)' })
      }
    } catch {
      // Ignore parse errors
    }
  }
  
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
    eta: 'eta',
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
