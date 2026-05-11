import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'

// GET /api/wms/orders - Fetch orders from WMS for PO/BOL reconciliation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const warehouse = searchParams.get('warehouse') || 'Moses Lake'
    const supplier = searchParams.get('supplier') || 'HX'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')

    // Get WMS token
    const token = await getWmsToken(warehouse, supplier)

    // Build RQL query for date range
    let rql = ''
    if (startDate && endDate) {
      // Filter by ProcessDate (order completion date)
      rql = `ReadOnly.ProcessDate=ge=${startDate};ReadOnly.ProcessDate=lt=${endDate}`
    } else {
      // Default to last 30 days
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      const startStr = start.toISOString().split('T')[0]
      const endStr = end.toISOString().split('T')[0]
      rql = `ReadOnly.ProcessDate=ge=${startStr};ReadOnly.ProcessDate=lt=${endStr}`
    }

    const rqlEncoded = encodeURIComponent(rql)

    // Fetch orders from WMS with OrderItems detail
    const wmsUrl = `https://secure-wms.com/orders?pgsiz=${pageSize}&pgnum=${page}&rql=${rqlEncoded}&detail=OrderItems`

    console.log('[v0] Fetching WMS orders:', wmsUrl)

    const response = await fetch(wmsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/hal+json',
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] WMS orders fetch failed:', response.status, errorText)
      return NextResponse.json(
        { error: `WMS API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    const orders = data._embedded?.['http://api.3plCentral.com/rels/orders/order'] || []

    console.log('[v0] Found', orders.length, 'orders')

    // Transform orders for frontend
    const transformedOrders = orders.map((order: any) => {
      const orderItems = order.OrderItems || []
      
      // Aggregate SKUs and quantities
      const skuSummary = orderItems.map((item: any) => ({
        sku: item.ItemIdentifier?.Sku || 'Unknown',
        quantity: item.Qty || 0,
        description: item.ItemIdentifier?.Description || '',
      }))

      const totalQuantity = skuSummary.reduce((sum: number, item: any) => sum + item.quantity, 0)

      return {
        orderId: order.ReadOnly?.OrderId || order.OrderId,
        referenceNumber: order.ReferenceNum || '',
        poNumber: order.PoNum || '',
        customerName: order.CustomerName || '',
        status: order.ReadOnly?.Status || 'Unknown',
        processDate: order.ReadOnly?.ProcessDate || null,
        creationDate: order.ReadOnly?.CreationDate || null,
        isClosed: order.ReadOnly?.IsClosed || false,
        skuSummary,
        totalQuantity,
        totalSkus: skuSummary.length,
        // For file download
        hasFiles: true, // Assume all orders may have files
      }
    })

    // Get total count from response
    const totalCount = data.totalResults || transformedOrders.length

    return NextResponse.json({
      orders: transformedOrders,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error('[v0] Orders API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch orders' },
      { status: 500 }
    )
  }
}
