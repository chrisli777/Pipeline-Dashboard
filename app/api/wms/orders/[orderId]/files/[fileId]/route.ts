import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'

// GET /api/wms/orders/[orderId]/files/[fileId] - Download a specific file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string; fileId: string }> }
) {
  try {
    const { orderId, fileId } = await params
    const { searchParams } = new URL(request.url)
    const warehouse = searchParams.get('warehouse') || 'Moses Lake'
    const supplier = searchParams.get('supplier') || 'HX'

    // Get WMS token
    const token = await getWmsToken(warehouse, supplier)

    // Download file from WMS
    const wmsUrl = `https://secure-wms.com/orders/${orderId}/files/${fileId}`

    console.log('[v0] Downloading file:', wmsUrl)

    const response = await fetch(wmsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': '*/*',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[v0] WMS file download failed:', response.status, errorText)
      return NextResponse.json(
        { error: `WMS API error: ${response.status}` },
        { status: response.status }
      )
    }

    // Get file content and headers
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const contentDisposition = response.headers.get('content-disposition')
    const fileContent = await response.arrayBuffer()

    // Create response with file content
    const headers = new Headers()
    headers.set('Content-Type', contentType)
    if (contentDisposition) {
      headers.set('Content-Disposition', contentDisposition)
    } else {
      headers.set('Content-Disposition', `attachment; filename="file-${fileId}"`)
    }

    return new NextResponse(fileContent, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('[v0] File download API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to download file' },
      { status: 500 }
    )
  }
}
