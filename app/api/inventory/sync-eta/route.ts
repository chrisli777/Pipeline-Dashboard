import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/inventory/sync-eta
// Calculates and updates ETA for all SKUs based on ETD (4 weeks prior)
// ETA for week N = ETD from week N-4
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))
    const { skuIds, weekStart, weekEnd } = body

    // Get all inventory data
    let query = supabase
      .from('inventory_data')
      .select('id, sku_id, week_number, etd, eta')
      .order('sku_id')
      .order('week_number')

    if (skuIds && skuIds.length > 0) {
      query = query.in('sku_id', skuIds)
    }

    const { data: allData, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!allData || allData.length === 0) {
      return NextResponse.json({ message: 'No data found', updated: 0 })
    }

    // Group by SKU
    const skuMap = new Map<string, Map<number, { id: string; etd: number | null; eta: number | null }>>()
    
    for (const row of allData) {
      if (!skuMap.has(row.sku_id)) {
        skuMap.set(row.sku_id, new Map())
      }
      skuMap.get(row.sku_id)!.set(row.week_number, {
        id: row.id,
        etd: row.etd,
        eta: row.eta,
      })
    }

    // Calculate ETA updates: ETA for week N = ETD from week N-4
    const updates: { id: string; eta: number }[] = []

    for (const [skuId, weekMap] of skuMap) {
      for (const [weekNumber, data] of weekMap) {
        // Only process weeks in range if specified
        if (weekStart && weekNumber < weekStart) continue
        if (weekEnd && weekNumber > weekEnd) continue

        const sourceWeek = weekNumber - 4
        const sourceData = weekMap.get(sourceWeek)
        
        if (sourceData?.etd != null && sourceData.etd > 0) {
          // Only update if ETA is different from calculated value
          const calculatedEta = sourceData.etd
          if (data.eta !== calculatedEta) {
            updates.push({ id: data.id, eta: calculatedEta })
          }
        }
      }
    }

    // Batch update ETA values
    let updatedCount = 0
    const batchSize = 50
    
    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize)
      
      for (const { id, eta } of batch) {
        const { error: updateError } = await supabase
          .from('inventory_data')
          .update({ eta, updated_at: new Date().toISOString() })
          .eq('id', id)
        
        if (!updateError) {
          updatedCount++
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced ETA for ${updatedCount} records`,
      totalChecked: allData.length,
      updated: updatedCount,
    })
  } catch (err) {
    console.error('ETA sync error:', err)
    return NextResponse.json(
      { error: 'Failed to sync ETA', details: String(err) },
      { status: 500 }
    )
  }
}
