import { createClient } from '@/lib/supabase/server'
import { getWmsToken } from '@/lib/wms-auth'
import { NextResponse } from 'next/server'

interface WmsReceiver {
  ReferenceNumber?: string
  ReadOnly?: {
    Status?: number
    CreationDate?: string
  }
  ReceiveItems?: Array<{
    ItemIdentifier?: { Sku?: string }
    Qty?: number
  }>
}

interface MatchResult {
  container_id: string
  container_number: string
  invoice_number: string
  shipment_id: string
  matched_by: 'container_number' | 'invoice_number'
  wms_reference: string
  status: string
}

// POST: Check WMS receivers for delivery matches
export async function POST(request: Request) {
  try {
    const { supplier, warehouse } = await request.json()

    if (!supplier || !warehouse) {
      return NextResponse.json(
        { error: 'Missing supplier or warehouse' },
        { status: 400 }
      )
    }

    // 1. Fetch containers that are CLEARED or DELIVERING from v_container_dispatch
    const supabase = await createClient()
    const { data: containers, error: dbError } = await supabase
      .from('v_container_dispatch')
      .select('*')
      .eq('supplier', supplier)
      .eq('warehouse', warehouse)
      .in('status', ['CLEARED', 'DELIVERING'])

    if (dbError) {
      return NextResponse.json(
        { error: 'Database query failed', details: dbError.message },
        { status: 500 }
      )
    }

    if (!containers || containers.length === 0) {
      return NextResponse.json({
        matched: [],
        unmatched: [],
        totalReceivers: 0,
        updatedCount: 0,
        message: `No CLEARED/DELIVERING containers found for ${supplier} at ${warehouse}`,
      })
    }

    // Build lookup maps for matching
    const byContainerNumber = new Map<string, typeof containers[0]>()
    const byInvoiceNumber = new Map<string, typeof containers[0]>()
    for (const c of containers) {
      if (c.container_number) byContainerNumber.set(c.container_number.toUpperCase(), c)
      if (c.invoice_number) byInvoiceNumber.set(c.invoice_number.toUpperCase(), c)
    }

    // 2. Get WMS token and fetch receivers
    let wmsToken: string
    try {
      wmsToken = await getWmsToken(warehouse, supplier)
    } catch (authError: unknown) {
      const msg = authError instanceof Error ? authError.message : 'Unknown auth error'
      return NextResponse.json(
        { error: `WMS authentication failed: ${msg}` },
        { status: 500 }
      )
    }

    // Fetch all completed receivers (status==1) from WMS, paginated
    const allReceivers: WmsReceiver[] = []
    let pageNum = 1
    let hasMore = true

    while (hasMore) {
      const rql = encodeURIComponent('readOnly.status==1')
      const wmsUrl = `https://secure-wms.com/inventory/receivers?detail=ReceiveItems&pgsiz=100&pgnum=${pageNum}&rql=${rql}`

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
          { error: `WMS API error (${wmsResponse.status})`, details: errorText.slice(0, 500) },
          { status: wmsResponse.status }
        )
      }

      const wmsData = await wmsResponse.json()
      const receivers = wmsData.ResourceList || []
      allReceivers.push(...receivers)

      const totalResults = wmsData.TotalResults || 0
      if (pageNum * 100 >= totalResults || receivers.length === 0) {
        hasMore = false
      } else {
        pageNum++
      }
    }

    // 3. Match WMS ReferenceNumbers against container_number and invoice_number
    const matched: MatchResult[] = []
    const matchedContainerIds = new Set<string>()

    for (const receiver of allReceivers) {
      const ref = (receiver.ReferenceNumber || '').trim().toUpperCase()
      if (!ref) continue

      // Check container_number match
      const containerMatch = byContainerNumber.get(ref)
      if (containerMatch && !matchedContainerIds.has(containerMatch.id)) {
        matched.push({
          container_id: containerMatch.id,
          container_number: containerMatch.container_number,
          invoice_number: containerMatch.invoice_number,
          shipment_id: containerMatch.shipment_id,
          matched_by: 'container_number',
          wms_reference: receiver.ReferenceNumber || ref,
          status: containerMatch.status,
        })
        matchedContainerIds.add(containerMatch.id)
        continue
      }

      // Check invoice_number match
      const invoiceMatch = byInvoiceNumber.get(ref)
      if (invoiceMatch && !matchedContainerIds.has(invoiceMatch.id)) {
        matched.push({
          container_id: invoiceMatch.id,
          container_number: invoiceMatch.container_number,
          invoice_number: invoiceMatch.invoice_number,
          shipment_id: invoiceMatch.shipment_id,
          matched_by: 'invoice_number',
          wms_reference: receiver.ReferenceNumber || ref,
          status: invoiceMatch.status,
        })
        matchedContainerIds.add(invoiceMatch.id)
      }
    }

    // Unmatched containers
    const unmatched = containers
      .filter(c => !matchedContainerIds.has(c.id))
      .map(c => ({
        container_id: c.id,
        container_number: c.container_number,
        invoice_number: c.invoice_number,
        shipment_id: c.shipment_id,
        status: c.status,
      }))

    // 4. Update matched containers to DELIVERED
    let updatedCount = 0
    const today = new Date().toISOString().split('T')[0]

    for (const match of matched) {
      const { error: updateError } = await supabase
        .from('container_tracking')
        .update({
          status: 'DELIVERED',
          delivered_date: today,
        })
        .eq('shipment_id', match.shipment_id)
        .eq('container_number', match.container_number)

      if (!updateError) {
        updatedCount++
      }
    }

    return NextResponse.json({
      matched,
      unmatched,
      totalReceivers: allReceivers.length,
      updatedCount,
      containersChecked: containers.length,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to check WMS delivery',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
