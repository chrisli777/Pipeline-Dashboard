import { NextRequest } from 'next/server'
import { PDFDocument } from 'pdf-lib'
import { getWmsToken } from '@/lib/wms-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const searchParams = request.nextUrl.searchParams
    const warehouse = searchParams.get('warehouse') || 'Moses Lake'
    const supplierCode = searchParams.get('supplierCode') || 'HX'
    const referenceNumber = searchParams.get('referenceNumber') || orderId

    // Get WMS token
    const token = await getWmsToken(warehouse, supplierCode)

    // First, get the list of files for this order
    const filesUrl = `https://secure-wms.com/orders/${orderId}/filesummaries`
    const filesResponse = await fetch(filesUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/hal+json',
      },
    })

    if (!filesResponse.ok) {
      return Response.json(
        { error: 'Failed to fetch files list' },
        { status: filesResponse.status }
      )
    }

    const filesData = await filesResponse.json()
    const files = filesData._embedded?.item || []

    // Find BOL and PO files
    let bolFile = null
    let poFile = null

    for (const file of files) {
      const fileName = file.docName || ''
      if (fileName.toUpperCase().startsWith('BOL')) {
        bolFile = file
      } else if (fileName.toUpperCase().startsWith('PO')) {
        poFile = file
      }
    }

    if (!bolFile && !poFile) {
      return Response.json(
        { error: 'No BOL or PO files found for this order' },
        { status: 404 }
      )
    }

    // Create merged PDF
    const mergedPdf = await PDFDocument.create()

    // Helper function to download and add PDF pages
    const addPdfToMerged = async (file: any) => {
      if (!file) return

      // Get download path from _links
      const downloadPath = file._links?.['http://api.3plcentral.com/rels/orders/orderfile']?.href ||
                           file._links?.['http://api.3plCentral.com/rels/orders/orderfile']?.href

      if (!downloadPath) return

      // Download the file
      const fileUrl = `https://secure-wms.com${downloadPath}`
      const fileResponse = await fetch(fileUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/pdf',
        },
      })

      if (!fileResponse.ok) {
        console.error(`Failed to download file: ${file.docName}`)
        return
      }

      const pdfBytes = await fileResponse.arrayBuffer()
      
      try {
        const pdf = await PDFDocument.load(pdfBytes)
        const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices())
        pages.forEach((page) => mergedPdf.addPage(page))
      } catch (error) {
        console.error(`Failed to merge PDF: ${file.docName}`, error)
      }
    }

    // Add BOL first, then PO
    await addPdfToMerged(bolFile)
    await addPdfToMerged(poFile)

    // Check if we added any pages
    if (mergedPdf.getPageCount() === 0) {
      return Response.json(
        { error: 'Could not merge any PDF files' },
        { status: 500 }
      )
    }

    // Generate the merged PDF
    const mergedPdfBytes = await mergedPdf.save()

    // Return as downloadable file with reference number as filename
    const sanitizedRefNumber = referenceNumber.replace(/[^a-zA-Z0-9-_]/g, '_')
    
    return new Response(mergedPdfBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${sanitizedRefNumber}.pdf"`,
        'Content-Length': mergedPdfBytes.length.toString(),
      },
    })
  } catch (error) {
    console.error('Error merging PDFs:', error)
    return Response.json(
      { error: 'Failed to merge PDF files' },
      { status: 500 }
    )
  }
}
