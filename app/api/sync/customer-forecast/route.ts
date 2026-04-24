import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const BUCKET_NAME = 'forecast-files'

// Load forecast multipliers from database config table
async function loadForecastMultipliers(supabase: any): Promise<Record<string, number>> {
  const multipliers: Record<string, number> = {}
  
  const { data, error } = await supabase
    .from('forecast_multiplier_config')
    .select('sku_code, multiplier')
  
  if (error) {
    console.error('Error loading forecast multipliers:', error)
    return multipliers
  }
  
  if (data) {
    for (const row of data) {
      multipliers[row.sku_code] = Number(row.multiplier)
    }
  }
  
  return multipliers
}

// Compound model names that map to multiple model lookups
const COMPOUND_MODELS: Record<string, string[]> = {
  's60j & s80j': ['s60j', 's80j'],
}

// Aliases: forecast model name -> DB part_model search terms
// Used when customer model names differ from supplier part model names
const MODEL_ALIASES: Record<string, string[]> = {
  's60j': ['t60'],     // Genie S60J = HX T60 (Engine Side)
  's80j': ['t80'],     // Genie S80J = HX T80 (Control Side)
  'gs-4655': ['gs4655', 'gs-4655'],  // Tianjin GS-4655
  'gs4655': ['gs4655', 'gs-4655'],
}

// Find matching SKU codes from the database for a given model name
async function findMatchingSkuCodes(supabase: any, modelName: string): Promise<string[]> {
  const normalized = modelName.toLowerCase().trim()

  // Handle compound model names (e.g., "S60J & S80J" -> search both)
  if (COMPOUND_MODELS[normalized]) {
    const allSkus: string[] = []
    for (const subModel of COMPOUND_MODELS[normalized]) {
      const subSkus = await findMatchingSkuCodes(supabase, subModel)
      for (const s of subSkus) {
        if (!allSkus.includes(s)) allSkus.push(s)
      }
    }
    return allSkus
  }

  // Strip common suffixes for core model identifier: "GS-4046 E-Drive" -> "GS-4046", "Z45XC" -> "Z45XC"
  // Also try without hyphens/spaces: "GS-4046" -> "GS4046"
  const variants = new Set<string>()
  variants.add(normalized)
  // Remove descriptive suffixes like "E-Drive", "E-drive"
  const coreModel = normalized.replace(/\s+e[- ]?driv\w*$/i, '').trim()
  variants.add(coreModel)
  // Without hyphens
  variants.add(coreModel.replace(/-/g, ''))
  // Without spaces and hyphens
  variants.add(coreModel.replace(/[-\s]/g, ''))

  // Also add alias variants (e.g., S60J -> T60)
  if (MODEL_ALIASES[normalized]) {
    for (const alias of MODEL_ALIASES[normalized]) {
      variants.add(alias)
    }
  }

  const matchedSkuCodes: string[] = []

  // Query the skus table: find rows where part_model contains any of our variants (case-insensitive)
  for (const variant of variants) {
    if (!variant) continue
    const { data } = await supabase
      .from('skus')
      .select('sku_code, part_model')
      .ilike('part_model', `%${variant}%`)
    if (data) {
      for (const row of data) {
        if (!matchedSkuCodes.includes(row.sku_code)) {
          matchedSkuCodes.push(row.sku_code)
        }
      }
    }
    // Stop if we found matches
    if (matchedSkuCodes.length > 0) break
  }

  return matchedSkuCodes
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
// 
// NEW FORMAT (Genie Moses Lake Supplier Forecast):
// The Excel has multiple model sections, each with:
//   Row: "SX125XC" (model name as section header, may be in merged cells)
//   Row: "Week #" | 14 | 15 | 16 | 17 | ...  (week numbers)
//   Row: "Week Of:" | 3/30 | 4/6 | ...       (dates, skip)
//   Row: "Working days" | 4 | 4 | 5 | ...    (skip)
//   Row: "Weekly Rate" | 4 | 5 | 4 | 4 | ... (THIS IS THE FORECAST DATA)
//   Row: "AVG Per day" | 1 | 1 | 1 | ...     (skip)
//
// Strategy:
// 1. Scan for model name patterns (e.g., SX125XC, Z80, Z62, Z45XC, S60J, etc.)
// 2. For each model section, find the "Week #" row to get week column mapping
// 3. Find the "Weekly Rate" row to get the actual values
// 4. Map week numbers to weekly rate values
function extractForecastFromRows(rows: string[][]): ForecastData {
  if (rows.length < 2) {
    return { models: [] }
  }

  const models: ForecastData['models'] = []
  
  // Model name patterns to look for (common forklift/equipment model patterns)
  const modelPatterns = [
    /^[A-Z]{1,3}\d{2,4}[A-Z]*$/i,  // SX125XC, Z80, Z62, Z45XC, T60, T80
    /^[A-Z]\d+[A-Z]?\s*&\s*[A-Z]\d+[A-Z]?$/i,  // S60J & S80J
    /^GS-?\d+/i,  // GS-2632
    /^[A-Z]{2,3}-?\d{3,4}/i,  // PSB-1788
  ]
  
  // Find all model sections
  let currentModel: string | null = null
  let currentWeekRow: number = -1
  let weekColumns: { colIndex: number; weekNumber: number }[] = []
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length === 0) continue
    
    // Check first few cells for model name (may be in merged cells)
    for (let c = 0; c < Math.min(3, row.length); c++) {
      const cell = String(row[c] || '').trim()
      if (!cell) continue
      
      // Check if this cell matches a model pattern
      const isModel = modelPatterns.some(p => p.test(cell)) || 
        // Also match specific known models
        /^(SX|ZX|Z)\d+/i.test(cell) ||
        /^S\d+J/i.test(cell) ||
        cell.toUpperCase().includes('XC') && /\d/.test(cell)
      
      if (isModel && cell.length >= 2 && cell.length <= 20) {
        // Found a new model section
        currentModel = cell
        currentWeekRow = -1
        weekColumns = []
        break
      }
    }
    
    // Look for "Week #" or "Week Number" row within current model section
    const firstCell = String(row[0] || '').trim().toLowerCase()
    if (currentModel && (firstCell.includes('week #') || firstCell.includes('week#') || firstCell === 'week #' || firstCell.includes('week number'))) {
      currentWeekRow = r
      weekColumns = []
      // Extract week numbers from this row
      for (let c = 1; c < row.length; c++) {
        const cellStr = String(row[c] || '').trim()
        const val = parseInt(cellStr)
        if (!isNaN(val) && val >= 1 && val <= 53) {
          weekColumns.push({ colIndex: c, weekNumber: val })
        }
      }
    }
    
    // Look for "Weekly Rate" row to extract forecast values
    if (currentModel && weekColumns.length > 0 && 
        (firstCell.includes('weekly rate') || firstCell === 'weekly rate')) {
      const weeklyData: { weekNumber: number; weeklyRate: number }[] = []
      
      for (const wc of weekColumns) {
        const cellStr = String(row[wc.colIndex] || '').trim()
        const val = parseFloat(cellStr)
        if (!isNaN(val)) {
          weeklyData.push({ weekNumber: wc.weekNumber, weeklyRate: val })
        }
      }
      
      if (weeklyData.length > 0) {
        models.push({ modelName: currentModel, weeklyData })
      }
      
      // Reset for next model section
      currentModel = null
      weekColumns = []
    }
  }
  
  // Fallback: If no models found with new format, try old format
  if (models.length === 0) {
    return extractForecastFromRowsLegacy(rows)
  }
  
  return { models }
}

// Legacy extraction function for backwards compatibility
function extractForecastFromRowsLegacy(rows: string[][]): ForecastData {
  if (rows.length < 2) {
    return { models: [] }
  }

  let weekNumberRowIdx = -1
  let weekColumns: { colIndex: number; weekNumber: number }[] = []

  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < (rows[r]?.length || 0); c++) {
      const rawCell = String(rows[r][c] || '').trim()
      const cellLower = rawCell.toLowerCase()
      if (cellLower.includes('week') && (cellLower.includes('number') || cellLower.includes('#') || cellLower.includes('no'))) {
        weekNumberRowIdx = r
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

  if (weekColumns.length === 0) {
    const header = rows[0].map(h => String(h).trim())
    for (let i = 1; i < header.length; i++) {
      const h = header[i]
      const weekMatch = h.match(/^(?:Week\s*|W(?:k)?\s*)(\d+)$/i) || h.match(/^(\d+)$/)
      if (weekMatch) {
        weekColumns.push({ colIndex: i, weekNumber: parseInt(weekMatch[1]) })
      }
    }
    weekNumberRowIdx = 0
  }

  if (weekColumns.length === 0) {
    return { models: [] }
  }

  const skipPatterns = [
    'week number', 'week of', 'working day', 'daily rate', 'constraint',
    'large slab', 'small slab', 'category', 'model', 'sku', 'part',
    'weekly rate', 'avg per day', 'week #', 'week#', 'rate', 'total',
    'average', 'sum', 'header', 'date', 'period', 'forecast'
  ]

  const models: ForecastData['models'] = []
  const firstWeekColIdx = weekColumns.length > 0 ? Math.min(...weekColumns.map(w => w.colIndex)) : 1

  const startRow = weekNumberRowIdx >= 0 ? weekNumberRowIdx + 1 : 1
  for (let r = startRow; r < rows.length; r++) {
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
      max_tokens: 16384,
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
              text: `Extract forecast data from this PDF. Extract ALL models/machine types you find in the document. 

IMPORTANT: Look carefully for these specific models that are commonly missed:
- Z80 (forklift counterweight model)
- Z62 (forklift counterweight model)  
- Z45XC (forklift counterweight model)
- T60 / T80 (may appear as "S60J & S80J" aliases)

Each model typically has:
- A "Week #" row showing week numbers (e.g., 15, 16, 17...)
- A "Weekly Rate" row showing quantities per week

For each model found, extract:
- The model name exactly as shown
- Week numbers from the "Week #" row
- Weekly rate values from the "Weekly Rate" row

Scan the ENTIRE document thoroughly. Models may appear in different sections or pages.

Return ONLY valid JSON in this exact format, no other text:
{"models":[{"modelName":"Z80","weeklyData":[{"weekNumber":15,"weeklyRate":10}]}]}`,
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
  let jsonStr = rawText.trim()
  
  // Try markdown code block first (greedy to capture the full block)
  const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }
  
  // If still not starting with {, find the first { to last }
  if (!jsonStr.startsWith('{')) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1)
    }
  }

  // Clean up common issues: trailing commas, etc.
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')

  // Handle truncated JSON: if it doesn't end with }, try to close it
  if (!jsonStr.endsWith('}')) {
    // Count open brackets to close them
    let openBraces = 0
    let openBrackets = 0
    for (const ch of jsonStr) {
      if (ch === '{') openBraces++
      else if (ch === '}') openBraces--
      else if (ch === '[') openBrackets++
      else if (ch === ']') openBrackets--
    }
    // Remove any trailing incomplete object/entry
    jsonStr = jsonStr.replace(/,?\s*\{[^}]*$/, '')
    // Close all open brackets
    while (openBrackets > 0) { jsonStr += ']'; openBrackets-- }
    while (openBraces > 0) { jsonStr += '}'; openBraces-- }
    // Re-clean trailing commas
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1')
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (!parsed.models || !Array.isArray(parsed.models)) {
      throw new Error('Missing models array')
    }
    return parsed
  } catch (parseErr) {
    console.error('[v0] Failed to parse Claude response as JSON. Raw text:', rawText.slice(0, 500))
    throw new Error(`Could not parse forecast data from PDF. AI returned invalid format. Preview: ${rawText.slice(0, 200)}`)
  }
}

export async function POST(request: Request) {
  try {
    const { fileId } = await request.json()

    const supabase = await createClient()
    
    // Load forecast multipliers from database
    const FORECAST_MULTIPLIERS = await loadForecastMultipliers(supabase)
    console.log(`[v0] Loaded ${Object.keys(FORECAST_MULTIPLIERS).length} forecast multipliers from config`)

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
    console.log(`[v0] Downloading file: ${targetFile.file_path} from bucket ${BUCKET_NAME}`)
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from(BUCKET_NAME)
      .download(targetFile.file_path)

    if (downloadError || !fileBlob) {
      console.error(`[v0] Download error:`, downloadError)
      return NextResponse.json({
        error: `Failed to download forecast file from storage: ${downloadError?.message || 'Unknown error'}`
      }, { status: 500 })
    }
    
    console.log(`[v0] File downloaded successfully, size: ${fileBlob.size} bytes`)

    // Determine file type and extract forecast data
    const fileName = targetFile.file_name.toLowerCase()
    console.log(`[v0] Processing file: ${fileName}`)
    let output: ForecastData

    if (fileName.endsWith('.csv')) {
      // Parse CSV
      const text = await fileBlob.text()
      const rows = parseCSV(text)
      output = extractForecastFromRows(rows)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.xlsm')) {
      // Parse Excel
      const arrayBuffer = await fileBlob.arrayBuffer()
      const uint8 = new Uint8Array(arrayBuffer)
      const workbook = XLSX.read(uint8, { type: 'array' })
      
      console.log(`[v0] Excel parsing: ${workbook.SheetNames.length} sheets found: ${workbook.SheetNames.join(', ')}`)
      
      // Try all sheets, not just the first one
      let bestOutput: ForecastData = { models: [] }
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName]
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        
        console.log(`[v0] Sheet "${sheetName}": ${rows.length} rows`)
        // Log first 10 rows for debugging
        for (let i = 0; i < Math.min(10, rows.length); i++) {
          const rowPreview = rows[i].slice(0, 8).map(c => String(c).substring(0, 15)).join(' | ')
          console.log(`[v0] Row ${i}: ${rowPreview}`)
        }
        
        const sheetOutput = extractForecastFromRows(rows)
        console.log(`[v0] Sheet "${sheetName}" extracted ${sheetOutput.models.length} models`)
        if (sheetOutput.models.length > 0) {
          console.log(`[v0] Models found: ${sheetOutput.models.map(m => m.modelName).join(', ')}`)
        }
        
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
    // Note: Need to fetch part_model (which is sku_code) to match with forecast data
    // Supabase default limit is 1000, so we need to fetch all records
    let allExistingData: { sku_id: string; week_number: number; part_model: string }[] = []
    let offset = 0
    const batchSize = 1000
    
    while (true) {
      const { data: batchData, error: batchError } = await supabase
        .from('inventory_data')
        .select('sku_id, week_number, part_model')
        .range(offset, offset + batchSize - 1)
      
      if (batchError) {
        return NextResponse.json({
          error: 'Failed to fetch existing inventory data'
        }, { status: 500 })
      }
      
      if (!batchData || batchData.length === 0) {
        break
      }
      
      allExistingData = allExistingData.concat(batchData)
      
      if (batchData.length < batchSize) {
        break // Last batch
      }
      
      offset += batchSize
    }
    
    console.log(`[v0] Fetched ${allExistingData.length} existing inventory_data records`)

    // Create a lookup map: sku_code + week_number -> sku_id (for database updates)
    // And a Set for quick existence checks using sku_code
    const skuCodeToId = new Map<string, string>()
    const existingCombinations = new Set<string>()
    for (const d of allExistingData) {
      const key = `${d.part_model}_${d.week_number}`
      existingCombinations.add(key)
      skuCodeToId.set(key, d.sku_id)
    }

    // Update database with extracted forecast data
    const updates: { skuId: string; weekNumber: number; value: number }[] = []
    const skippedWeeks: number[] = []
    const matchedModels: string[] = []

    const unmatchedModels: string[] = []

    for (const model of output.models) {
      let matchingSkus: string[] | undefined

      if (model.modelName.startsWith('SKU:')) {
        // Direct SKU code match (from Excel/CSV SKU-based format)
        const skuCode = model.modelName.replace('SKU:', '')
        matchingSkus = [skuCode]
      } else {
        // Dynamic DB lookup: find SKUs whose part_model matches the forecast model name
        matchingSkus = await findMatchingSkuCodes(supabase, model.modelName)
      }

      if (!matchingSkus || matchingSkus.length === 0) {
        unmatchedModels.push(model.modelName)
        continue
      }
      
      console.log(`[v0] Model "${model.modelName}" matched to SKUs: ${matchingSkus.join(', ')}`)
      if (model.weeklyData.length > 0) {
        const sampleWeek = model.weeklyData[0].weekNumber
        const sampleKeys = matchingSkus.map(sku => `${sku}_${sampleWeek}`)
        console.log(`[v0] Sample keys for week ${sampleWeek}: ${sampleKeys.join(', ')}`)
        console.log(`[v0] Keys exist in DB: ${sampleKeys.map(k => existingCombinations.has(k)).join(', ')}`)
      }

      let modelHasUpdates = false
      for (const weekData of model.weeklyData) {
        let weekFoundForAnySku = false
        for (const skuCode of matchingSkus) {
          const key = `${skuCode}_${weekData.weekNumber}`
          if (existingCombinations.has(key)) {
            // Get actual sku_id from the lookup map
            const skuId = skuCodeToId.get(key)
            if (!skuId) continue
            
            // SKU-specific forecast multipliers (keyed by sku_code)
            const multiplier = FORECAST_MULTIPLIERS[skuCode] || 1
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
        extractedModels: output.models.map(m => m.modelName),
        modelsUpdated: matchedModels,
        unmatchedModels,
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
