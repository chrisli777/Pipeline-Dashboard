import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const BUCKET_NAME = 'forecast-files'

// Model mapping: forecast model names -> database SKU codes
// Keys are lowercase for case-insensitive matching
const MODEL_TO_SKUS: Record<string, string[]> = {
  // HX models (from PDF forecasts)
  's60j & s80j': ['1272762', '1272913'],
  's60j': ['1272762', '1272913'],
  's80j': ['1272762', '1272913'],
  'z80': ['61415'],
  'z62': ['824433'],
  'z45xc': ['1282199'],
  'sx125xc': ['60342', '60863'],
  // AMC / GENIE models (from Excel forecasts) — GS-4046 maps to all AMC SKUs
  'gs-4046': ['132383', '132385', '229579', '1260200', '1264224', '1299483', '132517', '132525', '1260307', '1260198'],
  // Additional GS models that may appear in forecast but don't have matching SKUs yet
  'gs-2632': [],
  'gs-3232': [],
  'gs-2646': [],
  'gs-3246': [],
}

// Fuzzy match a model name from the forecast to a MODEL_TO_SKUS key
function findMatchingModelKey(modelName: string): string | undefined {
  const normalized = modelName.toLowerCase().trim()

  // 1. Exact match
  if (MODEL_TO_SKUS[normalized] !== undefined) return normalized

  // 2. Try matching by extracting the model identifier (e.g. "GS-4046" from "GS-4046 E-Drive")
  for (const key of Object.keys(MODEL_TO_SKUS)) {
    // Check if the model name starts with the key or contains it
    if (normalized.startsWith(key) || normalized.includes(key)) return key
    // Check if the key is contained in the model name without separators
    const keyClean = key.replace(/[-\s]/g, '')
    const nameClean = normalized.replace(/[-\s]/g, '')
    if (nameClean.startsWith(keyClean) || nameClean.includes(keyClean)) return key
  }

  return undefined
}

interface ForecastData {
  models: {
    modelName: string
    weeklyData: { weekNumber: number; weeklyRate: number }[]
  }[]
}

// Parse CSV text into rows of string arrays
function parseCSV(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  return lines.map(line => {
    // Handle quoted fields with commas inside
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  })
}

// Extract forecast data from spreadsheet rows (Excel or CSV)
// The real format has:
//   Row: "Week Number:" | 6 | 7 | 8 | 9 | ...  (week identifiers)
//   Row: "Week Of:"     | 2/2 | 2/9 | ...       (dates, skip)
//   Row: "Working Days:" | ...                   (skip)
//   Row: "VS Daily Rate:" | ...                  (skip)
//   ...
//   Row: "GS-2632 E-drive" | 32% | 28 | 28 | 21 | 28 | ...  (model + values)
//   Row: "GS-4046 E-Drive" | 27% | 24 | 24 | 18 | 24 | ...
//
// Strategy:
// 1. Find the row where first cell contains "Week Number" -> those cells give us week columns
// 2. Below that, find rows whose first cell looks like a model name (contains letters + numbers)
// 3. For each model row, extract weekly values from the corresponding week columns
function extractForecastFromRows(rows: string[][]): ForecastData {
  if (rows.length < 2) {
    return { models: [] }
  }

  // --- Strategy 1: Look for a "Week Number" row ---
  let weekNumberRowIdx = -1
  let weekColumns: { colIndex: number; weekNumber: number }[] = []

  for (let r = 0; r < rows.length; r++) {
    // Scan ALL columns in this row for "Week Number" (it may not be in column 0)
    for (let c = 0; c < (rows[r]?.length || 0); c++) {
      const rawCell = String(rows[r][c] || '').trim()
      const cellLower = rawCell.toLowerCase()
      if (cellLower.includes('week') && (cellLower.includes('number') || cellLower.includes('#') || cellLower.includes('no'))) {
        weekNumberRowIdx = r
        // Extract week numbers from columns AFTER the label
        for (let wc = c + 1; wc < rows[r].length; wc++) {
          const cellStr = String(rows[r][wc] || '').trim()
          const val = parseInt(cellStr)
          if (!isNaN(val) && val >= 1 && val <= 53) {
            weekColumns.push({ colIndex: wc, weekNumber: val })
          }
        }
        break
      }
    }
    if (weekNumberRowIdx >= 0) break
  }

  // --- Strategy 2: Fallback - look for "Week 1", "Week 2" etc. in header row ---
  if (weekColumns.length === 0) {
    const header = rows[0].map(h => String(h).trim())
    for (let i = 1; i < header.length; i++) {
      const h = header[i]
      const weekMatch = h.match(/^(?:Week\s*|W(?:k)?\s*)(\d+)$/i) || h.match(/^(\d+)$/)
      if (weekMatch) {
        weekColumns.push({ colIndex: i, weekNumber: parseInt(weekMatch[1]) })
      }
    }
    weekNumberRowIdx = 0 // header row is the week row
  }

  if (weekColumns.length === 0) {
    return { models: [] }
  }

  // Known header/metadata rows to skip (case-insensitive partial match)
  const skipPatterns = [
    'week number', 'week of', 'working day', 'daily rate', 'constraint',
    'large slab', 'small slab', 'category', 'model', 'sku', 'part',
  ]

  const models: ForecastData['models'] = []

  // Determine the first week column index so we know which columns are "label" columns
  const firstWeekColIdx = weekColumns.length > 0 ? Math.min(...weekColumns.map(w => w.colIndex)) : 1

  // Scan rows after the week number row for model data
  const startRow = weekNumberRowIdx >= 0 ? weekNumberRowIdx + 1 : 1
  for (let r = startRow; r < rows.length; r++) {
    // Find model name: scan all columns BEFORE the first week column for a text cell
    let modelName = ''
    for (let c = 0; c < firstWeekColIdx; c++) {
      const cell = String(rows[r][c] || '').trim()
      if (cell && /[a-zA-Z]/.test(cell)) {
        modelName = cell
        break
      }
    }
    // Also check column 0 even if it's >= firstWeekColIdx (single-column layout)
    if (!modelName) {
      const cell = String(rows[r][0] || '').trim()
      if (cell && /[a-zA-Z]/.test(cell)) {
        modelName = cell
      }
    }
    if (!modelName) continue

    // Skip known header/metadata rows
    const lowerName = modelName.toLowerCase()
    if (skipPatterns.some(p => lowerName.includes(p))) continue

    const weeklyData: { weekNumber: number; weeklyRate: number }[] = []
    let hasNumericData = false

    for (const wc of weekColumns) {
      const rawVal = String(rows[r][wc.colIndex] || '').trim()
      // Skip percentage values (e.g., "32%")
      if (rawVal.includes('%')) continue
      const val = parseFloat(rawVal)
      if (!isNaN(val)) {
        weeklyData.push({ weekNumber: wc.weekNumber, weeklyRate: val })
        if (val > 0) hasNumericData = true
      }
    }

    if (weeklyData.length > 0 && hasNumericData) {
      // Clean up model name: remove trailing percentages or extra whitespace
      const cleanName = modelName.replace(/\s*\d+%\s*$/, '').trim()
      models.push({ modelName: cleanName, weeklyData })
    }
  }

  return { models }
}

// Extract forecast from PDF using Claude AI
async function extractForecastFromPDF(base64Data: string, mimeType: string): Promise<ForecastData> {
  const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mimeType || 'application/pdf',
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: `Extract forecast data from this PDF. ONLY extract these models: "S60J & S80J", "Z80", "Z62". Ignore all others (like Z60).

For each model found, extract week numbers from the "Week #" row and weekly rate values from the "Weekly Rate" row.

Return ONLY valid JSON in this exact format, no other text:
{"models":[{"modelName":"S60J & S80J","weeklyData":[{"weekNumber":2,"weeklyRate":4}]}]}`,
            },
          ],
        },
      ],
    }),
  })

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text()
    console.error('[v0] Claude API error:', claudeResponse.status, errText)
    throw new Error(`Claude API error: ${claudeResponse.status}`)
  }

  const claudeData = await claudeResponse.json()
  const rawText = claudeData.content?.[0]?.text || ''

  // Extract JSON from Claude's response (may be wrapped in markdown code blocks)
  let jsonStr = rawText
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  } else {
    const objMatch = rawText.match(/\{[\s\S]*\}/)
    if (objMatch) {
      jsonStr = objMatch[0]
    }
  }

  try {
    return JSON.parse(jsonStr)
  } catch {
    console.error('[v0] Failed to parse Claude response as JSON:', rawText)
    throw new Error('Could not parse forecast data from PDF. AI returned invalid format.')
  }
}

export async function POST(request: Request) {
  try {
    const { fileId } = await request.json()

    const supabase = await createClient()

    // Get the specified file or the latest uploaded forecast file
    let fileQuery = supabase
      .from('forecast_files')
      .select('id, file_name, file_path, mime_type')

    if (fileId) {
      fileQuery = fileQuery.eq('id', fileId)
    } else {
      fileQuery = fileQuery.order('uploaded_at', { ascending: false }).limit(1)
    }

    const { data: targetFile, error: fileError } = await fileQuery.single()

    if (fileError || !targetFile) {
      return NextResponse.json({
        error: 'No forecast file found. Please upload a forecast file first.'
      }, { status: 404 })
    }

    // Download the file from storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(targetFile.file_path)

    if (downloadError || !fileBlob) {
      return NextResponse.json({
        error: 'Failed to download forecast file from storage'
      }, { status: 500 })
    }

    // Determine file type and extract forecast data
    const fileName = targetFile.file_name.toLowerCase()
    let output: ForecastData

    if (fileName.endsWith('.csv')) {
      // Parse CSV
      const text = await fileBlob.text()
      const rows = parseCSV(text)
      output = extractForecastFromRows(rows)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      // Parse Excel
      const arrayBuffer = await fileBlob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      const workbook = XLSX.read(uint8, { type: 'array' })
      // Try all sheets, not just the first one
      let bestOutput: ForecastData = { models: [] }
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        const sheetOutput = extractForecastFromRows(rows)
        if (sheetOutput.models.length > bestOutput.models.length) {
          bestOutput = sheetOutput
        }
      }
      output = bestOutput
    } else {
      // PDF - use Claude AI
      const arrayBuffer = await fileBlob.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      let binaryString = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binaryString += String.fromCharCode(uint8Array[i])
      }
      const base64Data = btoa(binaryString)
      output = await extractForecastFromPDF(base64Data, targetFile.mime_type || 'application/pdf')
    }

    if (!output || !output.models || output.models.length === 0) {
      return NextResponse.json({
        error: 'Could not extract forecast data from file. Please ensure the file contains forecast tables with week columns.'
      }, { status: 400 })
    }

    // Get existing week numbers from database for each SKU
    const { data: existingData, error: existingError } = await supabase
      .from('inventory_data')
      .select('sku_id, week_number')

    if (existingError) {
      return NextResponse.json({
        error: 'Failed to fetch existing inventory data'
      }, { status: 500 })
    }

    // Create a Set of existing sku_id + week_number combinations
    const existingCombinations = new Set(
      existingData?.map(d => `${d.sku_id}_${d.week_number}`) || []
    )

    // Update database with extracted forecast data
    const updates: { skuId: string; weekNumber: number; value: number }[] = []
    const skippedWeeks: number[] = []
    const matchedModels: string[] = []

    for (const model of output.models) {
      let matchingSkus: string[] | undefined

      if (model.modelName.startsWith('SKU:')) {
        // Direct SKU code match (from Excel/CSV SKU-based format)
        const skuCode = model.modelName.replace('SKU:', '')
        matchingSkus = [skuCode]
      } else {
        // Fuzzy model name match
        const matchedKey = findMatchingModelKey(model.modelName)
        if (matchedKey !== undefined) {
          matchingSkus = MODEL_TO_SKUS[matchedKey]
        }
      }

      if (!matchingSkus || matchingSkus.length === 0) continue

      let modelHasUpdates = false
      for (const weekData of model.weeklyData) {
        let weekFoundForAnySku = false
        for (const skuId of matchingSkus) {
          if (existingCombinations.has(`${skuId}_${weekData.weekNumber}`)) {
            // SKU 229579 requires forecast values multiplied by 8
            // SKU-specific forecast multipliers
            const multiplier = skuId === '229579' ? 8 : skuId === '60342' ? 2 : 1
            updates.push({
              skuId,
              weekNumber: weekData.weekNumber,
              value: weekData.weeklyRate * multiplier,
            })
            modelHasUpdates = true
            weekFoundForAnySku = true
          }
        }
        if (!weekFoundForAnySku && !skippedWeeks.includes(weekData.weekNumber)) {
          skippedWeeks.push(weekData.weekNumber)
        }
      }

      if (modelHasUpdates && !matchedModels.includes(model.modelName)) {
        matchedModels.push(model.modelName)
      }
    }

    // Apply updates to database
    let successCount = 0
    let errorCount = 0

    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('inventory_data')
        .update({ customer_forecast: update.value })
        .eq('sku_id', update.skuId)
        .eq('week_number', update.weekNumber)

      if (updateError) {
        errorCount++
      } else {
        successCount++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Synced customer forecast from ${targetFile.file_name}`,
      stats: {
        modelsUpdated: matchedModels,
        totalUpdates: updates.length,
        successCount,
        errorCount,
        skippedWeeks: skippedWeeks.sort((a, b) => a - b),
      },
    })

  } catch (err) {
    console.error('[v0] Customer forecast sync error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to sync customer forecast' },
      { status: 500 }
    )
  }
}
