const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Agent configuration - Forecast Supply Analyst
const AGENT_ID = 'agent_01GGr1fPWFvJYh2hng8ayHHV'
const ENVIRONMENT_ID = 'env_016qaDFym3wS7GkuBof5xNZZ'

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(req: Request) {
  try {
    const { forecastData, accuracyData, currentMonth } = await req.json()

    // Prepare forecast summary for AI analysis
    const forecastSummary = {
      currentMonth: currentMonth || new Date().toISOString().slice(0, 7),
      totalSkus: forecastData?.length || 0,
      bySupplier: {} as Record<string, { totalForecast: number; skuCount: number }>,
      byModel: {} as Record<string, { totalForecast: number; weeks: Record<number, number> }>,
    }

    // Aggregate forecast data
    if (forecastData && Array.isArray(forecastData)) {
      for (const item of forecastData) {
        // By supplier
        if (!forecastSummary.bySupplier[item.supplierCode]) {
          forecastSummary.bySupplier[item.supplierCode] = { totalForecast: 0, skuCount: 0 }
        }
        forecastSummary.bySupplier[item.supplierCode].totalForecast += item.totalForecast || 0
        forecastSummary.bySupplier[item.supplierCode].skuCount++

        // By model (from description or part_model)
        const model = item.partModel || item.description?.match(/([A-Z]{2,}-?\d+)/)?.[1] || 'Unknown'
        if (!forecastSummary.byModel[model]) {
          forecastSummary.byModel[model] = { totalForecast: 0, weeks: {} }
        }
        forecastSummary.byModel[model].totalForecast += item.totalForecast || 0
      }
    }

    // Prepare accuracy summary
    const accuracySummary = {
      totalRecords: accuracyData?.length || 0,
      totalForecast: 0,
      totalActual: 0,
      overallVariance: 0,
      mape: 0,
      bySupplier: {} as Record<string, { forecast: number; actual: number; variance: number }>,
    }

    if (accuracyData && Array.isArray(accuracyData)) {
      let totalAbsVariancePercent = 0
      let validCount = 0

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

        if (item.customerForecast > 0) {
          totalAbsVariancePercent += Math.abs(item.variancePercent || 0)
          validCount++
        }
      }

      accuracySummary.overallVariance = accuracySummary.totalActual - accuracySummary.totalForecast
      accuracySummary.mape = validCount > 0 ? totalAbsVariancePercent / validCount : 0
    }

    // Prepare the analysis context
    const analysisContext = JSON.stringify({
      analysisDate: new Date().toISOString(),
      forecastSummary,
      accuracySummary,
      requestType: 'monthly_forecast_analysis',
    }, null, 2)

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
    console.log('[v0] Sending forecast data...')
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
            content: [{ type: 'text', text: analysisContext }],
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
    const maxAttempts = 30 // Poll for up to 2.5 minutes
    
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
        forecastSummary,
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
