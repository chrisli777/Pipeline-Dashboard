import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'
import Anthropic from '@anthropic-ai/sdk'

// POST /api/wms/orders/[orderId]/parse-compare
// Downloads ALL files, sends them to Claude to identify BOL/PO and compare
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await params
    const { warehouse, supplierCode } = await request.json()

    if (!warehouse || !supplierCode) {
      return NextResponse.json(
        { error: 'Missing warehouse or supplierCode' },
        { status: 400 }
      )
    }

    // Get WMS token
    const token = await getWmsToken(warehouse, supplierCode)

    // Get the files list for this order
    const filesUrl = `https://secure-wms.com/orders/${orderId}/filesummaries`
    const filesResponse = await fetch(filesUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/hal+json',
      },
    })

    if (!filesResponse.ok) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: `Failed to fetch files list: ${filesResponse.status}`,
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    const filesData = await filesResponse.json()
    const files = filesData._embedded?.item || []

    // Filter to only PDF files that are likely BOL or PO documents
    // Exclude PS (Packing Slip) files as they're not needed for comparison
    const relevantFiles = files.filter((f: any) => {
      const docName = f.docName?.toUpperCase() || ''
      return docName.endsWith('.PDF') && !docName.startsWith('PS')
    })

    if (relevantFiles.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'no_files',
          message: 'No relevant PDF files found for this order',
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    // Download all relevant files
    const downloadFile = async (file: any): Promise<{ name: string; base64: string } | null> => {
      const downloadPath = file._links?.['http://api.3plcentral.com/rels/orders/orderfile']?.href ||
                           file._links?.['http://api.3plCentral.com/rels/orders/orderfile']?.href
      if (!downloadPath) return null

      const fileUrl = `https://secure-wms.com${downloadPath}`
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': '*/*',
        },
      })

      if (!response.ok) return null

      const buffer = await response.arrayBuffer()
      return {
        name: file.docName,
        base64: Buffer.from(buffer).toString('base64'),
      }
    }

    const downloadedFiles = await Promise.all(relevantFiles.map(downloadFile))
    const validFiles = downloadedFiles.filter((f): f is { name: string; base64: string } => f !== null)

    if (validFiles.length === 0) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: 'Could not download any files',
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    // Send ALL files to Claude and let it identify and compare
    const anthropic = new Anthropic()

    // Build content array with all PDF files
    const content: any[] = validFiles.map(file => ({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: file.base64,
      },
    }))

    // Add the instruction text
    content.push({
      type: 'text',
      text: `You are analyzing shipping documents for a warehouse order. I've provided ${validFiles.length} PDF file(s): ${validFiles.map(f => f.name).join(', ')}

Your task:
1. IDENTIFY each document type:
   - BOL (Bill of Lading): Shows shipping/carrier info, typically has "CARRIER INFORMATION", "BILL OF LADING", commodity descriptions
   - PO (Purchase Order): Shows order details, typically has "Purchase Order", "Blanket Release", part numbers with quantities and prices
   - Other: Packing slips, invoices, etc. (ignore these for comparison)

2. EXTRACT item information from BOL and PO documents:
   - SKU/Part Number (usually ends with "GT" suffix, e.g., "824433GT", "61415GT")
   - Quantity (numeric)
   - Description/Model (e.g., "Z62", "T80", "S60J")

3. COMPARE BOL vs PO:
   - Check if all SKUs match
   - Check if quantities match for each SKU

Return ONLY this JSON (no other text):
{
  "bolFile": "filename or null if not found",
  "poFile": "filename or null if not found", 
  "bolItems": [{"sku": "824433GT", "quantity": 1, "description": "Z62"}],
  "poItems": [{"sku": "824433GT", "quantity": 1, "description": "Z62"}],
  "matches": [{"sku": "824433GT", "bolQty": 1, "poQty": 1}],
  "mismatches": [{"sku": "XXX", "bolQty": 1, "poQty": 2, "message": "Quantity mismatch"}],
  "status": "match" or "mismatch" or "bol_missing" or "po_missing",
  "summary": "Brief description of comparison result"
}`,
    })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    })

    // Parse Claude's response
    const textContent = response.content.find(c => c.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: 'No response from document analysis',
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    // Extract JSON from response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: 'Could not parse analysis result',
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    const analysisResult = JSON.parse(jsonMatch[0])

    return NextResponse.json({
      success: true,
      result: {
        status: analysisResult.status || 'unknown',
        message: analysisResult.summary || null,
        bolData: { items: analysisResult.bolItems || [], file: analysisResult.bolFile },
        poData: { items: analysisResult.poItems || [], file: analysisResult.poFile },
        comparison: {
          matches: analysisResult.matches || [],
          mismatches: analysisResult.mismatches || [],
        },
        filesAnalyzed: validFiles.map(f => f.name),
      }
    })

  } catch (error: any) {
    console.error('[v0] Parse compare error:', error.message, error.stack)
    return NextResponse.json({
      success: true,
      result: {
        status: 'error',
        message: error.message || 'Failed to parse and compare files',
        bolData: null,
        poData: null,
        comparison: null,
      }
    })
  }
}
