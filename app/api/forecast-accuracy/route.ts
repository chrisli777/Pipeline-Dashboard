import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const weeks = parseInt(searchParams.get('weeks') || '4')
  const supplier = searchParams.get('supplier') || 'all'

  const supabase = await createClient()

  // Get current week number (approximate based on date)
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 1)
  const currentWeek = Math.ceil(
    ((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  )

  // Calculate week range (past weeks only, ending at current week - 1 since current week is incomplete)
  const endWeek = currentWeek - 1
  const startWeek = endWeek - weeks + 1

  // Build query for inventory data with SKU info
  let query = supabase
    .from('inventory_dashboard')
    .select('*')
    .gte('week_number', startWeek)
    .lte('week_number', endWeek)
    .order('week_number', { ascending: false })

  if (supplier !== 'all') {
    query = query.eq('supplier_code', supplier)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching accuracy data:', error)
    return NextResponse.json({ error: 'Failed to fetch accuracy data' }, { status: 500 })
  }

  // Transform data for accuracy analysis
  const accuracy = (data || [])
    .filter(row => row.customer_forecast > 0 || row.actual_consumption > 0)
    .map(row => {
      const forecast = row.customer_forecast || 0
      const actual = row.actual_consumption || forecast  // Default to forecast if null
      const variance = actual - forecast
      const variancePercent = forecast > 0 ? (variance / forecast) * 100 : 0

      return {
        skuId: row.sku_id,
        skuCode: row.sku_code,
        partModel: row.part_model,
        supplierCode: row.supplier_code,
        weekNumber: row.week_number,
        customerForecast: forecast,
        actualConsumption: actual,
        variance,
        variancePercent
      }
    })

  return NextResponse.json({ accuracy })
}
