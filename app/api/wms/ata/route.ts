import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'



// Calculate week dates from week number
// Weeks run Sunday to Saturday
// Week 1: Dec 28, 2025 (Sun) - Jan 3, 2026 (Sat)
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  const week1Sunday = new Date(2025, 11, 28) // Dec 28, 2025 (Sunday)
  const weekSunday = new Date(week1Sunday)
  weekSunday.setDate(week1Sunday.getDate() + (weekNumber - 1) * 7)

  // Saturday is 6 days after Sunday, but use next Sunday for exclusive end range
  const nextSunday = new Date(weekSunday)
  nextSunday.setDate(weekSunday.getDate() + 7)

  return {
    start: formatDateForRQL(weekSunday),
    end: formatDateForRQL(nextSunday),
  }
}

// Format date for WMS RQL query (2026-01-01T00:00:00)
function formatDateForRQL(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}T00:00:00`
}

// Calculate current week number
function getCurrentWeekNumber(): number {
  const week1Monday = new Date(2025, 11, 29) // Dec 29, 2025 (Monday)
  const today = new Date()
  const diffTime = today.getTime() - week1Monday.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return Math.floor(diffDays / 7) + 1
}

// GET: Return current week number
export async function GET() {
  const currentWeek = getCurrentWeekNumber()
  return NextResponse.json({ currentWeek })
}

// POST: Sync ATA from WMS receivers API for a specific SKU and week
// Uses /inventory/receivers?detail=ReceiveItems endpoint
// Iterates all receivers, filters ReceiveItems by SKU, sums Qty
export async function POST(request: Request) {
  try {
    const { skuId, weekNumber } = await request.json()
  
    if (!skuId || !weekNumber) {
      return NextResponse.json(
        { error: 'Missing skuId or weekNumber' },
        { status: 400 }
      )
    }

    // Look up the SKU's warehouse from the database to route to the correct WMS credentials
    const supabaseForLookup = await createClient()
    const { data: skuRow } = await supabaseForLookup
      .from('skus')
      .select('warehouse, supplier_code')
      .eq('sku_code', skuId)
      .single()

    if (!skuRow) {
      return NextResponse.json(
        { error: `SKU ${skuId} not found in database` },
        { status: 400 }
      )
    }

    // Get a fresh OAuth2 token for the correct warehouse
    let wmsToken: string
    try {
      const { getWmsToken } = await import('@/lib/wms-auth')
      wmsToken = await getWmsToken(skuRow.warehouse, skuRow.supplier_code)
    } catch (authError: any) {
      return NextResponse.json(
        { error: authError.message },
        { status: 500 }
      )
    }

    // Get date range for the week
    const { start, end } = getWeekDateRange(weekNumber)

    // Build WMS receivers API URL
    // readOnly.status==1 means received/completed
    // arrivalDate is the actual arrival date
    const rql = `readOnly.status==1;arrivalDate=ge=${start};arrivalDate=lt=${end}`
    const encodedRql = encodeURIComponent(rql)
    
    // Paginate through all results
    let totalAta = 0
    let pageNum = 1
    let hasMore = true

    while (hasMore) {
      const wmsUrl = `https://secure-wms.com/inventory/receivers?detail=ReceiveItems&pgsiz=100&pgnum=${pageNum}&rql=${encodedRql}`

      const wmsResponse = await fetch(wmsUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${wmsToken}`,
          'Accept': 'application/json',
        },
      })

      if (!wmsResponse.ok) {
        const errorText = await wmsResponse.text()
        return NextResponse.json(
          { error: `WMS API error: ${wmsResponse.status}`, details: errorText },
          { status: wmsResponse.status }
        )
      }

      const wmsData = await wmsResponse.json()

      // wmsData should have ResourceList (array of receivers)
      const receivers = wmsData.ResourceList || []

      // Iterate through each receiver and its ReceiveItems
      for (const receiver of receivers) {
        // ReceiveItems is a direct array on each receiver
        const receiveItems = receiver.ReceiveItems || []
        const items = Array.isArray(receiveItems) ? receiveItems : []

        for (const item of items) {
          // SKU in WMS has "GT" suffix (e.g. "61415GT" for SKU "61415")
          const itemSku = item.ItemIdentifier?.Sku || ''
          // Match by checking if the WMS SKU starts with our target SKU ID
          if (itemSku === skuId || itemSku === `${skuId}GT` || itemSku.startsWith(skuId)) {
            const qty = item.Qty || 0
            totalAta += qty
          }
        }
      }

      // Check if there are more pages
      const totalResults = wmsData.TotalResults || 0
      if (pageNum * 100 >= totalResults || receivers.length === 0) {
        hasMore = false
      } else {
        pageNum++
      }
    }

    // Update the ata in database
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from('inventory_data')
      .update({
        ata: totalAta,
        updated_at: new Date().toISOString(),
      })
      .eq('sku_id', skuId)
      .eq('week_number', weekNumber)

    if (updateError) {
      return NextResponse.json(
        { error: 'Database update failed', details: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      skuId,
      weekNumber,
      ata: totalAta,
      dateRange: { start, end },
      pagesScanned: pageNum,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync ATA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
