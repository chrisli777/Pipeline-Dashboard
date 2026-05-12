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

    // Helper function to extract version number from filename
    // Format: PO-10903-14080875-0-US.pdf or BOL-10903-14080875-1-US.pdf
    // The version number is the digit before -US or at the end before .pdf
    const getVersionNumber = (fileName: string): number => {
      // Try to match pattern like -0-US.pdf, -1-US.pdf, -2.pdf, etc.
      const match = fileName.match(/-(\d+)(?:-[A-Z]{2})?\.pdf$/i)
      if (match) {
        return parseInt(match[1], 10)
      }
      // Also try pattern at end of filename before extension
      const altMatch = fileName.match(/-(\d+)\.pdf$/i)
      if (altMatch) {
        return parseInt(altMatch[1], 10)
      }
      return 0
    }

    // Find BOL and PO files, keeping the one with highest version number
    let bolFiles: any[] = []
    let poFiles: any[] = []

    for (const file of files) {
      const fileName = file.docName || ''
      if (fileName.toUpperCase().startsWith('BOL')) {
        bolFiles.push(file)
      } else if (fileName.toUpperCase().startsWith('PO')) {
        poFiles.push(file)
      }
    }

    // Sort by version number (descending) and pick the first (highest version)
    bolFiles.sort((a, b) => getVersionNumber(b.docName || '') - getVersionNumber(a.docName || ''))
    poFiles.sort((a, b) => getVersionNumber(b.docName || '') - getVersionNumber(a.docName || ''))

    const bolFile = bolFiles[0] || null
    const poFile = poFiles[0] || null

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
