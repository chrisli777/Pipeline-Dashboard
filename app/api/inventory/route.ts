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

  // Fetch inventory data from the view using pagination
  // Supabase has a server-side limit of 1000 rows per request
  const PAGE_SIZE = 1000
  let allInventoryData: any[] = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data: pageData, error: pageError } = await supabase
      .from('inventory_dashboard')
      .select('*')
      .order('sku_id')
      .order('week_number')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (pageError) {
      return NextResponse.json({ error: pageError.message }, { status: 500 })
    }

    if (pageData && pageData.length > 0) {
      allInventoryData = [...allInventoryData, ...pageData]
      page++
      hasMore = pageData.length === PAGE_SIZE
    } else {
      hasMore = false
    }
  }

  const inventoryData = allInventoryData
  
  // Fetch forecast multiplier config (for machine model display)
  const { data: forecastConfig } = await supabase
    .from('forecast_multiplier_config')
    .select('sku_code, part_model, multiplier')

  return NextResponse.json({ skus, weeks, inventoryData, forecastConfig })
}
