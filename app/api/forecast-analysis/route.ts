import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Agent configuration - Forecast Supply Analyst
const AGENT_ID = 'agent_01GGr1fPWFvJYh2hng8ayHHV'
const ENVIRONMENT_ID = 'env_016qaDFym3wS7GkuBof5xNZZ'

// Increase max duration for long-running agent calls (5 minutes)
export const maxDuration = 300

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper to extract VS SUMMARY data from Excel file
async function extractVsSummaryData(supabase: ReturnType<typeof createClient>, filePath: string): Promise<string | null> {
  try {
    const { data: fileData, error } = await supabase.storage
      .from('forecast-files')
      .download(filePath)
    
    if (error || !fileData) {
      console.error('[v0] Failed to download file:', filePath, error)
      return null
    }
    
    const arrayBuffer = await fileData.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    
    // Look for VS SUMMARY sheet
    const vsSummarySheet = workbook.SheetNames.find(name => 
      name.toLowerCase().includes('vs summary') || name.toLowerCase() === 'vs_summary'
    )
    
    if (!vsSummarySheet) {
      console.log('[v0] No VS SUMMARY sheet found in:', filePath)
      return null
    }
    
    const sheet = workbook.Sheets[vsSummarySheet]
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 })
    
    // Convert to readable format
    let result = `\n=== ${filePath} - ${vsSummarySheet} ===\n`
    for (const row of jsonData.slice(0, 50)) { // Limit to first 50 rows
      if (Array.isArray(row) && row.some(cell => cell !== null && cell !== undefined && cell !== '')) {
        result += (row as (string | number)[]).map(cell => cell ?? '').join('\t') + '\n'
      }
    }
    
    return result
  } catch (err) {
    console.error('[v0] Error extracting VS SUMMARY:', err)
    return null
  }
}

export async function POST(req: Request) {
  try {
    const { selectedFiles, accuracyData, currentMonth } = await req.json()
    const supabase = await createClient()

    // Check if files are provided
    if (!selectedFiles || selectedFiles.length === 0) {
      return Response.json(
        { error: 'No forecast files selected for analysis' },
        { status: 400 }
      )
    }

    // Download and extract VS SUMMARY data from selected files
    const vsSummaryDataParts: string[] = []
    for (const file of selectedFiles) {
      const storagePath = file.id // Assuming id is the storage path
      // Try to get file path from database
      const { data: fileRecord } = await supabase
        .from('forecast_files')
        .select('storage_path, file_name')
        .eq('id', file.id)
        .single()
      
      if (fileRecord?.storage_path) {
        const summaryData = await extractVsSummaryData(supabase, fileRecord.storage_path)
        if (summaryData) {
          vsSummaryDataParts.push(summaryData)
        }
      }
    }
    
    const hasVsSummaryData = vsSummaryDataParts.length > 0

    // Prepare accuracy summary for context
    const accuracySummary = {
      totalRecords: accuracyData?.length || 0,
      totalForecast: 0,
      totalActual: 0,
      overallVariance: 0,
      bySupplier: {} as Record<string, { forecast: number; actual: number; variance: number }>,
    }

    if (accuracyData && Array.isArray(accuracyData)) {
      for (const item of accuracyData) {
        accuracySummary.totalForecast += item.customerForecast || 0
        accuracySummary.totalActual += item.actualConsumption || 0
        
        // By supplier
        if (!accuracySummary.bySupplier[item.supplierCode]) {
          accuracySummary.bySupplier[item.supplierCode] = { forecast: 0, actual: 0, variance: 0 }
        }
        accuracySummary.bySupplier[item.supplierCode].forecast += item.customerForecast || 0
        accuracySummary.bySupplier[item.supplierCode].actual += item.actualConsumption || 0
        accuracySummary.bySupplier[item.supplierCode].variance += item.variance || 0
      }
      accuracySummary.overallVariance = accuracySummary.totalActual - accuracySummary.totalForecast
    }

    // Format the analysis request message for the agent
    // Include actual VS SUMMARY data if available
    const fileNames = selectedFiles.map((f: { fileName: string }) => f.fileName).join(', ')
    
    let analysisPrompt = `请分析以下 Kent (Redmond) forecast 文件的变化趋势：

选中的文件：${fileNames}
当前月份：${currentMonth}

`

    // Add VS SUMMARY data if extracted
    if (hasVsSummaryData) {
      analysisPrompt += `## VS SUMMARY 原始数据

以下是从 Excel 文件中提取的 VS SUMMARY sheet 数据：
${vsSummaryDataParts.join('\n')}

`
    } else {
      analysisPrompt += `注意：未能从文件中提取 VS SUMMARY 数据。请基于以下 Forecast Accuracy 汇总数据进行分析。

`
    }

    analysisPrompt += `## Forecast Accuracy 数据摘要
- 总记录数：${accuracySummary.totalRecords}
- 总预测量：${accuracySummary.totalForecast}
- 总实际量：${accuracySummary.totalActual}
- 总偏差：${accuracySummary.overallVariance}

按供应商分类：
${Object.entries(accuracySummary.bySupplier).map(([supplier, data]) => 
  `- ${supplier}: Forecast ${data.forecast}, Actual ${data.actual}, Variance ${data.variance}`
).join('\n')}

请提供：
1. Forecast Movement 分析 - 月度对比表和变化趋势
2. Replenishment Cycle 评估 - 基于85/95天lead time
3. Latest Notification Dates - 针对变化的通知截止日期
4. Current Situation & Actions - 当前窗口评估和建议措施

输出格式：请使用中文，提供结构化的分析报告，使用 Markdown 格式。`

    // Step 1: Create a new session with the agent
    console.log('[v0] Creating forecast analysis session...')
    const sessionResponse = await fetch('https://api.anthropic.com/v1/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
      body: JSON.stringify({
        agent: AGENT_ID,
        environment_id: ENVIRONMENT_ID,
        title: `Forecast分析-${new Date().toISOString().slice(0, 10)}`,
      }),
    })

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text()
      console.error('[v0] Session creation failed:', errorText)
      throw new Error(`Session creation failed: ${errorText}`)
    }

    const session = await sessionResponse.json()
    console.log('[v0] Session created:', session.id)

    // Step 2: Send forecast data via events
    console.log('[v0] Sending forecast analysis request...')
    const eventsResponse = await fetch(`https://api.anthropic.com/v1/sessions/${session.id}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'managed-agents-2026-04-01',
      },
      body: JSON.stringify({
        events: [
          {
            type: 'user.message',
            content: [{ type: 'text', text: analysisPrompt }],
          },
        ],
      }),
    })

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text()
      console.error('[v0] Events send failed:', errorText)
      throw new Error(`Events send failed: ${errorText}`)
    }

    console.log('[v0] Forecast data sent, polling for agent response...')

    // Step 3: Poll for agent response
    let analysisText = ''
    const maxAttempts = 60 // Poll for up to 5 minutes (60 * 5 seconds)
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await sleep(5000) // Wait 5 seconds between polls
      
      // Check session status
      const sessionStatusResponse = await fetch(`https://api.anthropic.com/v1/sessions/${session.id}`, {
        method: 'GET',
        headers: {
          'x-api-key': ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'managed-agents-2026-04-01',
        },
      })

      if (!sessionStatusResponse.ok) {
        console.log('[v0] Poll attempt', attempt + 1, 'session status check failed')
        continue
      }

      const sessionStatus = await sessionStatusResponse.json()
      console.log('[v0] Poll attempt', attempt + 1, 'session status:', sessionStatus.status)
      
      // When session is idle, fetch events to get the response
      if (sessionStatus.status === 'idle') {
        console.log('[v0] Session is idle! Fetching events...')
        
        const eventsGetResponse = await fetch(`https://api.anthropic.com/v1/sessions/${session.id}/events`, {
          method: 'GET',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'managed-agents-2026-04-01',
          },
        })
        
        if (eventsGetResponse.ok) {
          const eventsData = await eventsGetResponse.json()
          console.log('[v0] Events response keys:', Object.keys(eventsData))
          
          const events = eventsData.data || eventsData.events || eventsData
          if (Array.isArray(events)) {
            console.log('[v0] Found', events.length, 'events')
            for (const event of events) {
              if (event.type === 'agent.message') {
                if (event.content && Array.isArray(event.content) && event.content[0]) {
                  analysisText = event.content[0].text || ''
                  console.log('[v0] Agent response length:', analysisText.length)
                  break
                }
              }
            }
          }
        }
        
        break
      }
    }

    console.log('[v0] Final analysis length:', analysisText.length)

    return Response.json({ 
      analysis: analysisText || 'No analysis generated',
      metadata: {
        selectedFiles,
        accuracySummary,
        sessionId: session.id,
      }
    })
  } catch (error) {
    console.error('[v0] Forecast analysis error:', error)
    return Response.json(
      { error: 'Failed to generate forecast analysis' },
      { status: 500 }
    )
  }
}
