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
// Weeks run Sunday to Saturday
// Week 1: Dec 28, 2025 (Sun) - Jan 3, 2026 (Sat)
// Week 6: Feb 1 (Sun) - Feb 7 (Sat)
// Week 7: Feb 8 (Sun) - Feb 14 (Sat)
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  // Week 1 Sunday is Dec 28, 2025
  const week1Sunday = new Date(2025, 11, 28) // Dec 28, 2025 (Sunday)
  const weekSunday = new Date(week1Sunday)
  weekSunday.setDate(week1Sunday.getDate() + (weekNumber - 1) * 7)
  
  // Saturday is 6 days after Sunday
  const saturday = new Date(weekSunday)
  saturday.setDate(weekSunday.getDate() + 6)
  
  return { 
    start: formatDateForRQL(weekSunday), 
    end: formatDateForRQL(saturday)
  }
}

// Calculate current week number based on today's date
// Week 1 Sunday is Dec 28, 2025
function getCurrentWeekNumber(): number {
  const week1Sunday = new Date(2025, 11, 28) // Dec 28, 2025 (Sunday)
  const today = new Date()
  const diffTime = today.getTime() - week1Sunday.getTime()
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

    // Look up the SKU's warehouse from the database to route to the correct WMS credentials
    // Use 'id' for lookup since skuId from frontend is the database id
    const supabaseForLookup = await createClient()
    const { data: skuRow } = await supabaseForLookup
      .from('skus')
      .select('warehouse, supplier_code, sku_code')
      .eq('id', skuId)
      .single()

    if (!skuRow) {
      return NextResponse.json({ error: `SKU ${skuId} not found in database` }, { status: 400 })
    }
    
    // Use sku_code for WMS API queries (e.g., "60342GT" not "60342")
    const skuCode = skuRow.sku_code

    // Get a fresh OAuth2 token for the correct warehouse
    let wmsToken: string
    try {
      const { getWmsToken } = await import('@/lib/wms-auth')
      wmsToken = await getWmsToken(skuRow.warehouse, skuRow.supplier_code)
    } catch (authError: any) {
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // Calculate date range for the week (Monday to Friday)
    const { start, end } = getWeekDateRange(weekNumber)

    // Build RQL query: ReadOnly.IsClosed==true;ReadOnly.ProcessDate=ge={start};ReadOnly.ProcessDate=lt={end}
    const rqlRaw = `ReadOnly.IsClosed==true;ReadOnly.ProcessDate=ge=${start};ReadOnly.ProcessDate=lt=${end}`
    const rqlEncoded = encodeURIComponent(rqlRaw)

    // Build WMS API URL with detail=OrderItems to get order line items
    // Use skuCode (e.g., "60342GT") not skuId (e.g., "60342") for WMS API
    const wmsUrl = `https://secure-wms.com/orders?pgsiz=100&pgnum=1&skucontains=${skuCode}&rql=${rqlEncoded}&detail=OrderItems`

    // Paginate through all results and sum qty
    let totalConsumption = 0
    let currentPage = 1
    let totalPages = 1

    while (currentPage <= totalPages) {
      const pageUrl = currentPage === 1 
        ? wmsUrl 
        : `https://secure-wms.com/orders?pgsiz=100&pgnum=${currentPage}&skucontains=${skuCode}&rql=${rqlEncoded}&detail=OrderItems`

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

      // Iterate through orders -> OrderItems -> each item's Qty
      // Response structure: { ResourceList: [ { OrderItems: [ { ItemIdentifier: { Sku }, Qty }, ... ] }, ... ] }
      const orders = wmsData.ResourceList || []
      for (const order of orders) {
        // Get OrderItems array from order
        const rawOrderItems = order.OrderItems
        let orderItems: any[] = []
        if (Array.isArray(rawOrderItems)) {
          orderItems = rawOrderItems
        } else if (rawOrderItems?.ResourceList && Array.isArray(rawOrderItems.ResourceList)) {
          orderItems = rawOrderItems.ResourceList
        }

        // Iterate through each OrderItem and sum Qty for matching SKUs
        for (const item of orderItems) {
          const itemSku = item.Sku || item.ItemIdentifier?.Sku || ''
          if (itemSku.includes(skuCode)) {
            totalConsumption += item.Qty || 0
          }
        }
      }

      currentPage++
    }

    // Save the actual consumption from WMS (even if 0)
    // If WMS returns 0, it means no shipments - this is real data, don't fallback to forecast
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
