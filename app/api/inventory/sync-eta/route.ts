import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST: Sync ETA values from ETD (6 weeks prior)
// ETA for week N = ETD from week N-6
// This stores the calculated ETA in the database
export async function POST(request: Request) {
  try {
    const { skuIds, weekStart, weekEnd } = await request.json()
    
    if (!skuIds || !Array.isArray(skuIds) || skuIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing or invalid skuIds array' },
        { status: 400 }
      )
    }
    
    if (!weekStart || !weekEnd || weekStart > weekEnd) {
      return NextResponse.json(
        { error: 'Invalid week range' },
        { status: 400 }
      )
    }
    
    const supabase = await createClient()
    let updatedCount = 0
    const errors: string[] = []
    
    for (const skuId of skuIds) {
      for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
        // Get ETD from 6 weeks prior
        const sourceWeek = weekNumber - 6
        
        const { data: sourceRow } = await supabase
          .from('inventory_data')
          .select('etd')
          .eq('sku_id', skuId)
          .eq('week_number', sourceWeek)
          .single()
        
        const etaValue = sourceRow?.etd ?? 0
        
        // Update ETA for this week
        const { error: updateError } = await supabase
          .from('inventory_data')
          .update({
            eta: etaValue,
            updated_at: new Date().toISOString(),
          })
          .eq('sku_id', skuId)
          .eq('week_number', weekNumber)
        
        if (updateError) {
          errors.push(`SKU ${skuId} Week ${weekNumber}: ${updateError.message}`)
        } else {
          updatedCount++
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to sync ETA', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
