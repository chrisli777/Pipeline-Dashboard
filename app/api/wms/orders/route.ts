import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'

// Format date for RQL query
function formatDateForRQL(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}T00:00:00`
}

// GET /api/wms/orders - Fetch orders from WMS for PO/BOL reconciliation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const warehouse = searchParams.get('warehouse') || 'Moses Lake'
    const supplier = searchParams.get('supplier') || 'HX'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '1000') // Large page size to get all orders

    // Get WMS token
    const token = await getWmsToken(warehouse, supplier)

    // Build RQL query for date range
    let rql = ''
    if (startDate && endDate) {
      rql = `ReadOnly.ProcessDate=ge=${startDate}T00:00:00;ReadOnly.ProcessDate=lt=${endDate}T23:59:59`
    } else {
      // Default to last 30 days
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      rql = `ReadOnly.ProcessDate=ge=${formatDateForRQL(start)};ReadOnly.ProcessDate=lt=${formatDateForRQL(end)}`
    }

    const rqlEncoded = encodeURIComponent(rql)

    // Fetch orders from WMS with OrderItems detail (same pattern as consumption API)
    const wmsUrl = `https://secure-wms.com/orders?pgsiz=${pageSize}&pgnum=${page}&rql=${rqlEncoded}&detail=OrderItems`



    const response = await fetch(wmsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] WMS orders fetch failed:', response.status, errorText)
      return NextResponse.json(
        { error: `WMS API error: ${response.status}`, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // WMS returns ResourceList array (same as consumption API)
    const orders = data.ResourceList || []
    const totalResults = data.TotalResults || orders.length



    // Transform orders for frontend
    const transformedOrders = orders.map((order: any) => {
      // Get OrderItems - handle both array and ResourceList format
      const rawOrderItems = order.OrderItems
      let orderItems: any[] = []
      if (Array.isArray(rawOrderItems)) {
        orderItems = rawOrderItems
      } else if (rawOrderItems?.ResourceList && Array.isArray(rawOrderItems.ResourceList)) {
        orderItems = rawOrderItems.ResourceList
      }

      // Aggregate SKUs and quantities
      const skuSummary = orderItems.map((item: any) => ({
        sku: item.ItemIdentifier?.Sku || item.Sku || 'Unknown',
        quantity: item.Qty || 0,
        description: item.ItemIdentifier?.Description || item.ItemDescription || '',
      }))

      const totalQuantity = skuSummary.reduce((sum: number, item: any) => sum + item.quantity, 0)

      // Map WMS Status codes: 0=Open, 1=Closed, etc.
      const statusMap: Record<number, string> = {
        0: 'Open',
        1: 'Closed',
        2: 'Cancelled',
        3: 'Hold',
      }
      const statusCode = order.ReadOnly?.Status
      const statusText = typeof statusCode === 'number' ? (statusMap[statusCode] || `Status ${statusCode}`) : 'Unknown'

      return {
        orderId: order.ReadOnly?.OrderId || order.OrderId || '',
        referenceNumber: order.ReferenceNum || '',
        poNumber: order.PoNum || order.ReferenceNum?.split('-')[0] || '', // Try extracting PO from ReferenceNum
        customerName: order.ReadOnly?.CustomerIdentifier?.Name || order.CustomerIdentifier?.Name || '',
        warehouseName: order.ReadOnly?.FacilityIdentifier?.Name || order.FacilityIdentifier?.Name || '',
        warehouseId: order.ReadOnly?.FacilityIdentifier?.Id || order.FacilityIdentifier?.Id || '',
        status: statusText,
        statusCode: statusCode,
        processDate: order.ReadOnly?.ProcessDate || null,
        creationDate: order.ReadOnly?.CreationDate || null,
        isClosed: order.ReadOnly?.IsClosed || false,
        skuSummary,
        totalQuantity,
        totalSkus: skuSummary.length,
        notes: order.Notes || '',
        shippingNotes: order.ShippingNotes || '',
      }
    })

    return NextResponse.json({
      orders: transformedOrders,
      pagination: {
        page,
        pageSize,
        totalCount: totalResults,
        totalPages: Math.ceil(totalResults / pageSize),
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
