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

    // Find BOL and PO files
    const bolFile = files.find((f: any) => f.docName?.toUpperCase().startsWith('BOL'))
    const poFile = files.find((f: any) => f.docName?.toUpperCase().startsWith('PO'))

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

    // Download both files
    const downloadFile = async (file: any): Promise<string | null> => {
      if (!file) return null
      
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
      return Buffer.from(buffer).toString('base64')
    }

    const [bolBase64, poBase64] = await Promise.all([
      downloadFile(bolFile),
      downloadFile(poFile),
    ])

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

For each item, extract:
- SKU or Item Code (may include suffixes like GT, look for patterns like "824433GT", "61415GT", etc.)
- Quantity
- Description (if available)

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
    console.error('[v0] Parse compare error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to parse and compare files' },
      { status: 500 }
    )
  }
}
