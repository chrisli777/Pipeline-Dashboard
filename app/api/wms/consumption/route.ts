import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Format date as YYYY-MM-DDTHH:mm:ss for RQL
function formatDateForRQL(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}T00:00:00`
}

// Calculate week dates from week number
// Week 1: Dec 29, 2025 (Mon) - Jan 2, 2026 (Fri) => Friday display: Jan 2
// Week 2: Jan 5 (Mon) - Jan 9 (Fri) => Friday display: Jan 9
// Week 5: Jan 26 (Mon) - Jan 30 (Fri) => Friday display: Jan 30
// Week 6: Feb 2 (Mon) - Feb 6 (Fri) => Friday display: Feb 6
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  // Week 1 Monday is Dec 29, 2025
  const week1Monday = new Date(2025, 11, 29) // Dec 29, 2025 (Monday)
  const weekMonday = new Date(week1Monday)
  weekMonday.setDate(week1Monday.getDate() + (weekNumber - 1) * 7)
  
  // Friday is 4 days after Monday
  const friday = new Date(weekMonday)
  friday.setDate(weekMonday.getDate() + 4)
  
  return { 
    start: formatDateForRQL(weekMonday), 
    end: formatDateForRQL(friday)
  }
}

// Calculate current week number based on today's date
// Week 1 Monday is Dec 29, 2025
// Feb 3, 2026 should be Week 6
function getCurrentWeekNumber(): number {
  const week1Monday = new Date(2025, 11, 29) // Dec 29, 2025 (Monday)
  const today = new Date()
  const diffTime = today.getTime() - week1Monday.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

// GET: Return current week number for sync logic
export async function GET() {
  const currentWeek = getCurrentWeekNumber()
  return NextResponse.json({ currentWeek })
}

// POST: Fetch consumption data from WMS for a specific SKU and week
export async function POST(request: NextRequest) {
  try {
    const { skuId, weekNumber } = await request.json()

    if (!skuId || weekNumber === undefined) {
      return NextResponse.json({ error: 'Missing skuId or weekNumber' }, { status: 400 })
    }

    const wmsToken = process.env.WMS_API_TOKEN
    if (!wmsToken) {
      return NextResponse.json({ error: 'WMS_API_TOKEN not configured' }, { status: 500 })
    }

    // Calculate date range for the week (Monday to Friday)
    const { start, end } = getWeekDateRange(weekNumber)

    // Build RQL query: ReadOnly.IsClosed==true;ReadOnly.ProcessDate=ge={start};ReadOnly.ProcessDate=lt={end}
    const rqlRaw = `ReadOnly.IsClosed==true;ReadOnly.ProcessDate=ge=${start};ReadOnly.ProcessDate=lt=${end}`
    const rqlEncoded = encodeURIComponent(rqlRaw)

    // Build WMS API URL with detail=All to get order line items
    const wmsUrl = `https://secure-wms.com/orders?pgsiz=100&pgnum=1&skucontains=${skuId}&rql=${rqlEncoded}&detail=All`

    // Paginate through all results and sum qty
    let totalConsumption = 0
    let currentPage = 1
    let totalPages = 1

    while (currentPage <= totalPages) {
      const pageUrl = currentPage === 1 
        ? wmsUrl 
        : `https://secure-wms.com/orders?pgsiz=100&pgnum=${currentPage}&skucontains=${skuId}&rql=${rqlEncoded}&detail=All`

      const wmsResponse = await fetch(pageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${wmsToken}`,
          'Accept': 'application/json',
        },
      })

      if (!wmsResponse.ok) {
        const errorText = await wmsResponse.text()
        return NextResponse.json({ 
          error: `WMS API error: ${wmsResponse.status}`,
          details: errorText 
        }, { status: wmsResponse.status })
      }

      const wmsData = await wmsResponse.json()

      // Calculate total pages from TotalResults on first page
      if (currentPage === 1) {
        const totalResults = wmsData.TotalResults || 0
        totalPages = Math.ceil(totalResults / 100)
      }

      // Iterate through orders and sum qty from order line items
      const orders = wmsData.ResourceList || []
      for (const order of orders) {
        const orderItems = order.OrderItems?.ResourceList || order.OrderItems || []
        for (const item of orderItems) {
          // Only count items matching our SKU
          const itemSku = item.Sku || item.ItemIdentifier?.Sku || ''
          if (itemSku.includes(skuId)) {
            totalConsumption += item.Qty || item.QtyOrdered || item.QtyShipped || 0
          }
        }
      }

      currentPage++
    }

    // Update the actual_consumption in database
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from('inventory_data')
      .update({ 
        actual_consumption: totalConsumption,
        updated_at: new Date().toISOString()
      })
      .eq('sku_id', skuId)
      .eq('week_number', weekNumber)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      skuId,
      weekNumber,
      consumption: totalConsumption,
      dateRange: { start, end },
    })

  } catch (err) {
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}
