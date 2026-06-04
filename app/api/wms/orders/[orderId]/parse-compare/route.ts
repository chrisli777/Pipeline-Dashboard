import { NextRequest, NextResponse } from 'next/server'
import { getWmsToken } from '@/lib/wms-auth'
import Anthropic from '@anthropic-ai/sdk'

// POST /api/wms/orders/[orderId]/parse-compare
// Downloads BOL and PO files, uses Claude to extract and compare cargo info
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

    // First, get the files list for this order
    const filesUrl = `https://secure-wms.com/orders/${orderId}/filesummaries`
    const filesResponse = await fetch(filesUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/hal+json',
      },
    })

    if (!filesResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch files list' },
        { status: filesResponse.status }
      )
    }

    const filesData = await filesResponse.json()
    const files = filesData._embedded?.item || []

    // Helper function to extract version number from filename
    // Format: PO-10903-14080875-0-US.pdf or BOL-10903-14080875-1-US.pdf
    const getVersionNumber = (fileName: string): number => {
      const match = fileName.match(/-(\d+)(?:-[A-Z]{2})?\.pdf$/i)
      if (match) return parseInt(match[1], 10)
      const altMatch = fileName.match(/-(\d+)\.pdf$/i)
      if (altMatch) return parseInt(altMatch[1], 10)
      return 0
    }

    // Find all BOL and PO files
    // PO files can start with "PO" or "UTF" prefix (UTF files are release documents that serve as PO)
    const bolFiles = files.filter((f: any) => {
      const docName = f.docName?.toUpperCase() || ''
      return docName.startsWith('BOL')
    })
    const poFiles = files.filter((f: any) => {
      const docName = f.docName?.toUpperCase() || ''
      return docName.startsWith('PO') || docName.startsWith('UTF')
    })

    // Sort by version number (descending) and pick the highest version
    bolFiles.sort((a: any, b: any) => getVersionNumber(b.docName || '') - getVersionNumber(a.docName || ''))
    poFiles.sort((a: any, b: any) => getVersionNumber(b.docName || '') - getVersionNumber(a.docName || ''))

    const bolFile = bolFiles[0] || null
    const poFile = poFiles[0] || null

    if (!bolFile && !poFile) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'no_files',
          message: 'No BOL or PO files found',
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }

    // Check for missing files before downloading
    if (!bolFile) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'bol_missing',
          message: 'BOL file not found - cannot compare',
          bolData: null,
          poData: { file: poFile?.docName },
          comparison: null,
        }
      })
    }

    if (!poFile) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'po_missing',
          message: 'PO file not found - cannot compare',
          bolData: { file: bolFile?.docName },
          poData: null,
          comparison: null,
        }
      })
    }

    // Download both files
    const downloadFile = async (file: any): Promise<string | null> => {
      if (!file) return null
      
      const downloadPath = file._links?.['http://api.3plcentral.com/rels/orders/orderfile']?.href ||
                           file._links?.['http://api.3plCentral.com/rels/orders/orderfile']?.href
      if (!downloadPath) {
        console.error('[v0] No download path for file:', file.docName)
        return null
      }

      const fileUrl = `https://secure-wms.com${downloadPath}`
      const response = await fetch(fileUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': '*/*',
        },
      })

      if (!response.ok) {
        console.error('[v0] File download failed:', file.docName, response.status)
        return null
      }

      const buffer = await response.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      
      // Log file size for debugging
      console.log('[v0] Downloaded file:', file.docName, 'Size:', buffer.byteLength, 'bytes')
      
      return base64
    }

    const [bolBase64, poBase64] = await Promise.all([
      downloadFile(bolFile),
      downloadFile(poFile),
    ])

    // Check for download failures
    if (!bolBase64) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: `BOL file (${bolFile.docName}) could not be downloaded`,
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }
    
    if (!poBase64) {
      return NextResponse.json({
        success: true,
        result: {
          status: 'error',
          message: `PO file (${poFile.docName}) could not be downloaded`,
          bolData: null,
          poData: null,
          comparison: null,
        }
      })
    }
    }

    // Use Claude to parse both documents
    const anthropic = new Anthropic()

    const parseDocument = async (base64: string | null, docType: string) => {
      if (!base64) return null

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64,
                },
              },
              {
                type: 'text',
                text: `Extract ALL cargo/item information from this ${docType} document.

DOCUMENT FORMATS:
- BOL (Bill of Lading): Look in "CARRIER INFORMATION" or "COMMODITY DESCRIPTION" section. Items appear like "824433GT Z62, Counterweight" with QTY in HANDLING UNIT or PACKAGE columns.
- PO (Purchase Order): Look in item lines with columns like "Part Number / Description", "Quantity", "UOM". Items appear like "824433GT" with description "CAST COUNTER WEIGHT,Z62".

For each item, extract:
- SKU: The part number/item code (e.g., "824433GT", "61415GT", "1272762GT"). Always include the GT suffix if present.
- Quantity: The number of units (usually 1, 2, etc.)
- Description: Model info like "Z62", "T80", "S60J" if available

IMPORTANT:
- SKU codes typically end with "GT" suffix
- Look for quantity in QTY, Quantity, or numeric columns
- Descriptions may include model codes like Z62, T60, T80, Z80, S60J, etc.

Return ONLY valid JSON in this format, no other text:
{"items":[{"sku":"824433GT","quantity":1,"description":"Z62 Counterweight"}]}

If no items found, return: {"items":[]}`,
              },
            ],
          },
        ],
      })

      try {
        const textContent = response.content.find(c => c.type === 'text')
        if (!textContent || textContent.type !== 'text') return null
        
        // Extract JSON from response
        const jsonMatch = textContent.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null
        
        return JSON.parse(jsonMatch[0])
      } catch {
        return null
      }
    }

    const [bolData, poData] = await Promise.all([
      parseDocument(bolBase64, 'BOL (Bill of Lading)'),
      parseDocument(poBase64, 'PO (Purchase Order / Packing Slip)'),
    ])

    // Compare the two documents
    const compareDocuments = (bol: any, po: any) => {
      if (!bol && !po) {
        return { status: 'no_data', message: 'No data extracted from either document', matches: [], mismatches: [] }
      }
      if (!bol) {
        return { status: 'bol_missing', message: 'BOL data not available', matches: [], mismatches: [] }
      }
      if (!po) {
        return { status: 'po_missing', message: 'PO data not available', matches: [], mismatches: [] }
      }

      const bolItems = bol.items || []
      const poItems = po.items || []

      const matches: any[] = []
      const mismatches: any[] = []

      // Normalize SKU for comparison (remove spaces, uppercase)
      const normalizeSku = (sku: string) => sku?.replace(/\s+/g, '').toUpperCase() || ''

      // Check each BOL item against PO
      for (const bolItem of bolItems) {
        const bolSku = normalizeSku(bolItem.sku)
        const poItem = poItems.find((p: any) => normalizeSku(p.sku) === bolSku)

        if (poItem) {
          if (bolItem.quantity === poItem.quantity) {
            matches.push({
              sku: bolItem.sku,
              bolQty: bolItem.quantity,
              poQty: poItem.quantity,
              status: 'match',
            })
          } else {
            mismatches.push({
              sku: bolItem.sku,
              bolQty: bolItem.quantity,
              poQty: poItem.quantity,
              status: 'quantity_mismatch',
              message: `BOL: ${bolItem.quantity}, PO: ${poItem.quantity}`,
            })
          }
        } else {
          mismatches.push({
            sku: bolItem.sku,
            bolQty: bolItem.quantity,
            poQty: null,
            status: 'sku_not_in_po',
            message: `SKU ${bolItem.sku} found in BOL but not in PO`,
          })
        }
      }

      // Check for PO items not in BOL
      for (const poItem of poItems) {
        const poSku = normalizeSku(poItem.sku)
        const inBol = bolItems.some((b: any) => normalizeSku(b.sku) === poSku)
        if (!inBol) {
          mismatches.push({
            sku: poItem.sku,
            bolQty: null,
            poQty: poItem.quantity,
            status: 'sku_not_in_bol',
            message: `SKU ${poItem.sku} found in PO but not in BOL`,
          })
        }
      }

      const status = mismatches.length === 0 ? 'match' : 'mismatch'
      return { status, matches, mismatches }
    }

    const comparison = compareDocuments(bolData, poData)

    return NextResponse.json({
      success: true,
      result: {
        status: comparison.status,
        bolData,
        poData,
        comparison,
        bolFileName: bolFile?.docName || null,
        poFileName: poFile?.docName || null,
      }
    })

  } catch (error: any) {
    console.error('[v0] Parse compare error:', error.message, error.stack)
    // Return error as a result status so it displays in the UI
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
