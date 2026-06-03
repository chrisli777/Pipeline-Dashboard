import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/skus - Fetch SKUs for a supplier from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const supplier = searchParams.get('supplier')

    if (!supplier) {
      return NextResponse.json(
        { error: 'Supplier parameter is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    
    const { data: skus, error } = await supabase
      .from('skus')
      .select('sku_code, part_model, description')
      .eq('supplier_code', supplier)
      .order('sku_code')

    if (error) {
      console.error('[v0] Error fetching SKUs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch SKUs' },
        { status: 500 }
      )
    }

    return NextResponse.json({ skus: skus || [] })
  } catch (error) {
    console.error('[v0] SKUs API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch SKUs' },
      { status: 500 }
    )
  }
}
