import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: All containers for Dispatcher Dashboard
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')       // CLEARED,DELIVERING,DELIVERED
    const supplier = searchParams.get('supplier')    // AMC, HX, etc.
    const warehouse = searchParams.get('warehouse')  // Kent, Moses Lake
    const sort = searchParams.get('sort') || 'lfd_asc'

    // Query the dispatch view
    let query = supabase
      .from('v_container_dispatch')
      .select('*')

    // Filter by status (comma-separated)
    if (status && status !== 'ALL') {
      const statuses = status.split(',').map(s => s.trim())
      query = query.in('status', statuses)
    } else {
      // Default: show CLEARED, DELIVERING, DELIVERED (not ON_WATER or CLOSED)
      query = query.in('status', ['CLEARED', 'DELIVERING', 'DELIVERED'])
    }

    // Filter by supplier
    if (supplier && supplier !== 'ALL') {
      query = query.eq('supplier', supplier)
    }

    // Filter by warehouse
    if (warehouse && warehouse !== 'ALL') {
      query = query.eq('warehouse', warehouse)
    }

    // Sort
    switch (sort) {
      case 'lfd_asc':
        query = query.order('lfd', { ascending: true, nullsFirst: false })
        break
      case 'delivery_date_asc':
        query = query.order('scheduled_delivery_date', { ascending: true, nullsFirst: false })
        break
      case 'supplier':
        query = query.order('supplier').order('invoice_number')
        break
      default:
        query = query.order('lfd', { ascending: true, nullsFirst: false })
    }

    const { data: containers, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate summary
    const summary = {
      total: containers?.length || 0,
      by_status: {
        CLEARED: 0,
        DELIVERING: 0,
        DELIVERED: 0,
      } as Record<string, number>,
      by_warehouse: {
        Kent: 0,
        'Moses Lake': 0,
        unassigned: 0,
      } as Record<string, number>,
    }

    for (const c of containers || []) {
      const s = c.status as string
      if (s in summary.by_status) {
        summary.by_status[s]++
      }
      const w = c.warehouse as string | null
      if (w === 'Kent') summary.by_warehouse.Kent++
      else if (w === 'Moses Lake') summary.by_warehouse['Moses Lake']++
      else summary.by_warehouse.unassigned++
    }

    return NextResponse.json({
      containers: containers || [],
      summary,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch dispatcher containers', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
