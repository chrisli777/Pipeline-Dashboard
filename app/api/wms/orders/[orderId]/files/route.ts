import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'

// GET /api/wms/orders/[orderId]/files - Get files for a specific order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const { searchParams } = new URL(request.url)
    const warehouse = searchParams.get('warehouse') || 'Moses Lake'
    const supplier = searchParams.get('supplier') || 'HX'

    // Get WMS token
    const token = await getWmsToken(warehouse, supplier)

    // Fetch files for this order from WMS
    const wmsUrl = `https://secure-wms.com/orders/${orderId}/files`

    console.log('[v0] Fetching order files:', wmsUrl)

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
      console.error('[v0] WMS order files fetch failed:', response.status, errorText)
      return NextResponse.json(
        { error: `WMS API error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    // Extract files from response
    const files = data._embedded?.['http://api.3plCentral.com/rels/orders/orderfile'] || 
                  data._embedded?.files || 
                  data.files ||
                  []

    // Transform files for frontend
    const transformedFiles = Array.isArray(files) ? files.map((file: any) => ({
      fileId: file.FileId || file.Id || file.id,
      fileName: file.FileName || file.Name || file.name || 'Unknown',
      fileType: file.FileType || file.Type || file.type || 'Unknown',
      fileSize: file.FileSize || file.Size || file.size || 0,
      uploadDate: file.UploadDate || file.CreatedDate || file.createdAt || null,
      downloadUrl: file._links?.self?.href || file.DownloadUrl || null,
    })) : []

    return NextResponse.json({
      orderId,
      files: transformedFiles,
      totalFiles: transformedFiles.length,
    })
  } catch (error) {
    console.error('[v0] Order files API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch order files' },
      { status: 500 }
    )
  }
}
