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
    
    // Helper function to fetch receivers with specific receiverType
    // receiverType is a separate URL param: 0=Normal, 1=Return, 2=ASN
    async function fetchReceiversByType(receiverType: number): Promise<{ total: number; refs: string[] }> {
      let total = 0
      let pageNum = 1
      let hasMore = true
      const refs: string[] = []

      while (hasMore) {
        const wmsUrl = `https://secure-wms.com/inventory/receivers?detail=ReceiveItems&receiverType=${receiverType}&pgsiz=100&pgnum=${pageNum}&rql=${encodedRql}`

        const wmsResponse = await fetch(wmsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${wmsToken}`,
            'Accept': 'application/json',
          },
        })

        if (!wmsResponse.ok) {
          const errorText = await wmsResponse.text()
          throw new Error(`WMS API error: ${wmsResponse.status} - ${errorText}`)
        }

        const wmsData = await wmsResponse.json()
        const receivers = wmsData.ResourceList || []

        for (const receiver of receivers) {
          // Collect ReferenceNumber for delivery matching
          const ref = (receiver.ReferenceNumber || '').trim()
          if (ref && !refs.includes(ref)) {
            refs.push(ref)
          }

          const receiveItems = receiver.ReceiveItems || []
          const items = Array.isArray(receiveItems) ? receiveItems : []

          for (const item of items) {
            // SKU in WMS has "GT" suffix (e.g. "61415GT" for SKU "61415")
            const itemSku = item.ItemIdentifier?.Sku || ''
            // Match by checking if the WMS SKU starts with our target SKU ID
            if (itemSku === skuId || itemSku === `${skuId}GT` || itemSku.startsWith(skuId)) {
              const qty = item.Qty || 0
              total += qty
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

      return { total, refs }
    }

    // Fetch ATA (all non-return types: 0=Normal, 2=ASN)
    const { total: ataNormal, refs: normalRefs } = await fetchReceiversByType(0)
    const { total: ataAsn, refs: asnRefs } = await fetchReceiversByType(2)
    const totalAta = ataNormal + ataAsn

    // Fetch Defect (receiverType=1, Return receivers only)
    const { total: totalDefect, refs: defectRefs } = await fetchReceiversByType(1)

    // Combine reference numbers from all types
    const referenceNumbers = [...new Set([...normalRefs, ...asnRefs, ...defectRefs])]

    // Update ATA and Defect in database
    // Both ATA and Defect: replace with synced value (not cumulative)
    const supabase = await createClient()
    
    const { error: updateError } = await supabase
      .from('inventory_data')
      .update({
        ata: totalAta,
        defect: totalDefect,
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

    // ============================================================
    // ATA ROLLOVER LOGIC
    // Core rule: ETA total MUST equal ATA total (absolute requirement)
    // ============================================================
    
    const currentWeek = getCurrentWeekNumber()
    
    // Fetch all inventory data for this SKU (all weeks)
    const { data: allWeeksData, error: fetchError } = await supabase
      .from('inventory_data')
      .select('week_number, eta, ata')
      .eq('sku_id', skuId)
      .order('week_number')
    
    if (fetchError || !allWeeksData) {
      return NextResponse.json({
        success: true,
        skuId,
        weekNumber,
        ata: totalAta,
        defect: totalDefect,
        dateRange: { start, end },
        referenceNumbers,
        rolloverError: 'Failed to fetch weeks data for rollover',
      })
    }
    
    // Calculate totals
    const etaTotal = allWeeksData.reduce((sum, w) => sum + (w.eta || 0), 0)
    
    // Get synced ATA total (weeks <= current week that have been synced)
    // We consider the current synced week as well
    const syncedAtaTotal = allWeeksData
      .filter(w => w.week_number <= weekNumber)
      .reduce((sum, w) => sum + (w.ata || 0), 0)
    
    // Remaining ETA that hasn't arrived yet
    let remainingEta = etaTotal - syncedAtaTotal
    
    // Process future weeks for rollover
    // Group weeks by "shipment batches" - a batch ends when ETA = 0
    const futureWeeks = allWeeksData.filter(w => w.week_number > weekNumber)
    
    const rolloverUpdates: { week: number; ata: number }[] = []
    let inBatch = true // Track if we're in an active shipment batch
    let carryOver = 0 // Amount to carry over to next batch
    
    for (const week of futureWeeks) {
      const weekEta = week.eta || 0
      
      if (weekEta === 0) {
        // ETA = 0 marks the end of a batch
        // If we have remaining ETA to rollover, put it here before the batch ends
        if (remainingEta > 0) {
          rolloverUpdates.push({ week: week.week_number, ata: remainingEta })
          remainingEta = 0
        } else {
          rolloverUpdates.push({ week: week.week_number, ata: 0 })
        }
        inBatch = false
        carryOver = 0
      } else {
        // ETA > 0, this is part of a batch
        if (!inBatch) {
          // Starting a new batch after a gap
          inBatch = true
        }
        
        if (remainingEta > 0) {
          // We still have remaining ETA to distribute
          if (remainingEta >= weekEta) {
            // Use up this week's ETA slot
            rolloverUpdates.push({ week: week.week_number, ata: weekEta })
            remainingEta -= weekEta
          } else {
            // Remaining ETA is less than this week's ETA
            // Put what's left and the rest comes from new shipment
            rolloverUpdates.push({ week: week.week_number, ata: remainingEta })
            remainingEta = 0
          }
        } else {
          // No remaining ETA, sync ATA directly from ETA
          rolloverUpdates.push({ week: week.week_number, ata: weekEta })
        }
      }
    }
    
    // Apply rollover updates
    for (const update of rolloverUpdates) {
      await supabase
        .from('inventory_data')
        .update({
          ata: update.ata,
          updated_at: new Date().toISOString(),
        })
        .eq('sku_id', skuId)
        .eq('week_number', update.week)
    }
    
    // Verify: Recalculate totals to ensure ETA = ATA
    const { data: verifyData } = await supabase
      .from('inventory_data')
      .select('week_number, eta, ata')
      .eq('sku_id', skuId)
    
    const finalEtaTotal = verifyData?.reduce((sum, w) => sum + (w.eta || 0), 0) || 0
    const finalAtaTotal = verifyData?.reduce((sum, w) => sum + (w.ata || 0), 0) || 0

    return NextResponse.json({
      success: true,
      skuId,
      weekNumber,
      ata: totalAta,
      defect: totalDefect,
      dateRange: { start, end },
      referenceNumbers,
      rollover: {
        currentWeek,
        syncedAtaTotal,
        etaTotal,
        remainingBeforeRollover: etaTotal - syncedAtaTotal,
        updatedWeeks: rolloverUpdates.length,
        finalEtaTotal,
        finalAtaTotal,
        etaEqualsAta: finalEtaTotal === finalAtaTotal,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync ATA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
