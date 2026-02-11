import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Calculate week dates from week number
// Week 1 Monday is Dec 29, 2025
function getWeekDateRange(weekNumber: number): { start: string; end: string } {
  const week1Monday = new Date(2025, 11, 29) // Dec 29, 2025 (Monday)
  const weekMonday = new Date(week1Monday)
  weekMonday.setDate(week1Monday.getDate() + (weekNumber - 1) * 7)
  
  // For ATA, we use the full week (Monday to Sunday)
  // ReceivedDate >= Monday 00:00:00
  // ReceivedDate < next Monday 00:00:00
  const nextMonday = new Date(weekMonday)
  nextMonday.setDate(weekMonday.getDate() + 7)
  
  return { 
    start: formatDateForRQL(weekMonday), 
    end: formatDateForRQL(nextMonday)
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

// POST: Sync ATA from WMS inventory API for a specific SKU and week
export async function POST(request: Request) {
  try {
    const { skuId, weekNumber } = await request.json()
    
    if (!skuId || !weekNumber) {
      return NextResponse.json(
        { error: 'Missing skuId or weekNumber' },
        { status: 400 }
      )
    }
    
    // Get WMS API token from environment
    const wmsToken = process.env.WMS_API_TOKEN
    if (!wmsToken) {
      return NextResponse.json(
        { error: 'WMS_API_TOKEN not configured' },
        { status: 500 }
      )
    }
    
    // Get date range for the week
    const { start, end } = getWeekDateRange(weekNumber)
    
    // Build WMS inventory API URL
    // itemIdentifier.sku=={SKU}GT;ReceivedDate=ge={startDate};ReceivedDate=lt={endDate}
    const rql = `itemIdentifier.sku==${skuId}GT;ReceivedDate=ge=${start};ReceivedDate=lt=${end}`
    const encodedRql = encodeURIComponent(rql)
    const wmsUrl = `https://secure-wms.com/inventory?pgsiz=100&pgnum=1&rql=${encodedRql}`
    
    // Call WMS API with Bearer token authentication
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
    
    // Get TotalResults as ATA quantity
    const ataQuantity = wmsData.TotalResults ?? 0
    
    // Update the ata in database
    const supabase = await createClient()
    const { error: updateError } = await supabase
      .from('inventory_data')
      .update({ 
        ata: ataQuantity,
        updated_at: new Date().toISOString()
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
      ata: ataQuantity,
      dateRange: { start, end }
    })
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync ATA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
