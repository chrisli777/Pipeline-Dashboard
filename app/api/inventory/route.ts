import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Disable caching to always fetch fresh data
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()

  // Fetch SKUs
  const { data: skus, error: skusError } = await supabase
    .from('skus')
    .select('*')
    .order('part_model')
    .limit(1000)

  if (skusError) {
    return NextResponse.json({ error: skusError.message }, { status: 500 })
  }

  // Fetch weeks
  const { data: weeks, error: weeksError } = await supabase
    .from('weeks')
    .select('*')
    .order('week_number')
    .limit(100)

  if (weeksError) {
    return NextResponse.json({ error: weeksError.message }, { status: 500 })
  }

  // Fetch inventory data from the view
  // Note: Supabase default limit is 1000 rows, we need more for all SKUs × weeks
  const { data: inventoryData, error: inventoryError } = await supabase
    .from('inventory_dashboard')
    .select('*')
    .order('part_model')
    .order('week_number')
    .limit(10000)

  if (inventoryError) {
    return NextResponse.json({ error: inventoryError.message }, { status: 500 })
  }

  // Debug: log counts
  const uniqueSkuIds = [...new Set(inventoryData?.map((r: any) => r.sku_id) || [])]
  console.log('[v0] API inventory data rows:', inventoryData?.length)
  console.log('[v0] API unique SKU IDs:', uniqueSkuIds.length, uniqueSkuIds)
  console.log('[v0] API SKUs count:', skus?.length)

  return NextResponse.json({ skus, weeks, inventoryData })
}
