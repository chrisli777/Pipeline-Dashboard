import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BUCKET_NAME = 'forecast-files'

// Model mapping: PDF model names -> database SKU IDs
const MODEL_TO_SKUS: Record<string, string[]> = {
  'S60J & S80J': ['1272762', '1272913'], // T80 and T60
  'S60J': ['1272762', '1272913'],
  'S80J': ['1272762', '1272913'],
  'Z80': ['61415'],
  'Z62': ['824433'],
}

interface ForecastData {
  models: {
    modelName: string
    weeklyData: { weekNumber: number; weeklyRate: number }[]
  }[]
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
        error: 'No forecast file found. Please upload a forecast PDF first.' 
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

    // Convert blob to base64
    const arrayBuffer = await fileBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binaryString = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binaryString += String.fromCharCode(uint8Array[i])
    }
    const base64Data = btoa(binaryString)

    // Call Claude API directly to extract forecast data from PDF
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
                  media_type: targetFile.mime_type || 'application/pdf',
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
      return NextResponse.json({ 
        error: `Claude API error: ${claudeResponse.status}` 
      }, { status: 500 })
    }

    const claudeData = await claudeResponse.json()
    const rawText = claudeData.content?.[0]?.text || ''
    
    // Extract JSON from Claude's response (may be wrapped in markdown code blocks)
    let jsonStr = rawText
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    } else {
      // Try to find raw JSON object
      const objMatch = rawText.match(/\{[\s\S]*\}/)
      if (objMatch) {
        jsonStr = objMatch[0]
      }
    }

    let output: ForecastData
    try {
      output = JSON.parse(jsonStr)
    } catch {
      console.error('[v0] Failed to parse Claude response as JSON:', rawText)
      return NextResponse.json({ 
        error: 'Could not parse forecast data from PDF. AI returned invalid format.' 
      }, { status: 400 })
    }
    
    if (!output || !output.models || output.models.length === 0) {
      return NextResponse.json({ 
        error: 'Could not extract forecast data from PDF. Please ensure the PDF contains forecast tables.' 
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

    // Update database with extracted forecast data (only for existing weeks and known models)
    const updates: { skuId: string; weekNumber: number; value: number }[] = []
    const skippedWeeks: number[] = []
    const matchedModels: string[] = []

    for (const model of output.models) {
      // Find matching SKU IDs for this model (only known models)
      const matchingSkus = MODEL_TO_SKUS[model.modelName]
      
      if (!matchingSkus) {
        // Skip unknown models (not in our database)
        continue
      }

      let modelHasUpdates = false
      for (const weekData of model.weeklyData) {
        for (const skuId of matchingSkus) {
          // Only add if this sku_id + week_number exists in database
          if (existingCombinations.has(`${skuId}_${weekData.weekNumber}`)) {
            updates.push({
              skuId,
              weekNumber: weekData.weekNumber,
              value: weekData.weeklyRate,
            })
            modelHasUpdates = true
          } else if (!skippedWeeks.includes(weekData.weekNumber)) {
            skippedWeeks.push(weekData.weekNumber)
          }
        }
      }
      
      // Only add to matchedModels if we actually updated something for this model
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
