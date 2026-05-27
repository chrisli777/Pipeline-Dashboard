const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Agent configuration - Forecast Supply Analyst
const AGENT_ID = 'agent_01GGr1fPWFvJYh2hng8ayHHV'
const ENVIRONMENT_ID = 'env_016qaDFym3wS7GkuBof5xNZZ'

// Increase max duration for long-running agent calls (5 minutes)
export const maxDuration = 300

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(req: Request) {
  try {
    const { selectedFiles, accuracyData, currentMonth } = await req.json()

    // Check if files are provided
    if (!selectedFiles || selectedFiles.length === 0) {
      return Response.json(
        { error: 'No forecast files selected for analysis' },
        { status: 400 }
      )
    }

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
    // The agent expects Kent forecast Excel files to be described
    const fileNames = selectedFiles.map((f: { fileName: string }) => f.fileName).join(', ')
    const analysisPrompt = `请分析以下 Kent (Redmond) forecast 文件的变化趋势：

选中的文件：${fileNames}

当前月份：${currentMonth}

Forecast Accuracy 数据摘要：
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

输出格式：请使用中文，提供结构化的分析报告。`

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
