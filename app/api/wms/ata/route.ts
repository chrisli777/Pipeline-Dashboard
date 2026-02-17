import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Target SKU IDs we track in our database
const TARGET_SKUS = ['1272762', '1272913', '61415', '824433', '1282199']

// Calculate week dates from week number
// Week 1 Monday is Dec 29, 2025
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  const week1Monday = new Date(2025, 11, 29) // Dec 29, 2025 (Monday)
  const weekMonday = new Date(week1Monday)
  weekMonday.setDate(week1Monday.getDate() + (weekNumber - 1) * 7)

  const nextMonday = new Date(weekMonday)
  nextMonday.setDate(weekMonday.getDate() + 7)

  return {
    start: formatDateForRQL(weekMonday),
    end: formatDateForRQL(nextMonday),
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
    const { skuId, weekNumber, token } = await request.json()
  
    if (!skuId || !weekNumber) {
      return NextResponse.json(
        { error: 'Missing skuId or weekNumber' },
        { status: 400 }
      )
    }

    // Validate SKU is one we track
    if (!TARGET_SKUS.includes(skuId)) {
      return NextResponse.json(
        { error: `SKU ${skuId} is not a tracked SKU` },
        { status: 400 }
      )
    }

    // Use provided token (for Kent warehouse SKUs) or fall back to env token (Moses Lake)
    const wmsToken = token || process.env.WMS_API_TOKEN
    if (!wmsToken) {
      return NextResponse.json(
        { error: 'WMS API token not provided' },
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
