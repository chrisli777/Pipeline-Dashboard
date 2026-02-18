import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Fetch SKUs with customer_code from suppliers
  const { data: skus, error: skusError } = await supabase
    .from('skus')
    .select('*, suppliers!inner(customer_code)')
    .order('part_model')

  if (skusError) {
    return NextResponse.json({ error: skusError.message }, { status: 500 })
  }

  // Fetch weeks
  const { data: weeks, error: weeksError } = await supabase
    .from('weeks')
    .select('*')
    .order('week_number')

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 })
  }

  // Fetch inventory data from the view
  const { data: inventoryData, error: inventoryError } = await supabase
    .from('inventory_dashboard')
    .select('*')
    .order('part_model')
    .order('week_number')

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 })
  }

  return NextResponse.json({ skus, weeks, inventoryData })
}
