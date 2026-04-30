const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Agent configuration
const AGENT_ID = 'agent_011CaYomWFdBAQjuMAgbmaw2'
const ENVIRONMENT_ID = 'env_016qaDFym3wS7GkuBof5xNZZ'

// Helper to wait
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export async function POST(req: Request) {
  try {
    const { projections, suggestions, currentWeek } = await req.json()

    // Prepare context data for AI
    const skuSummaries = projections.slice(0, 10).map((p: any) => ({
      sku: p.skuCode,
      currentInventory: Math.round(p.currentInventory),
      avgWeeklyDemand: p.avgWeeklyDemand.toFixed(1),
      safetyStock: Math.round(p.safetyStock),
      urgency: p.urgency,
      stockoutWeek: p.stockoutWeek,
      weeksOfCover: p.weeks?.length > 0 
        ? (p.currentInventory / p.avgWeeklyDemand).toFixed(1) 
        : 'N/A',
    }))

    const suggestionSummaries = suggestions.slice(0, 10).map((s: any) => ({
      sku: s.skuCode,
      suggestedQty: s.suggestedOrderQty,
      urgency: s.urgency,
      estimatedCost: s.estimatedCost,
      etdWeeks: s.suggestedETDWeeks?.map((e: any) => `W${e.week}: ${e.qty}`).join(', ') || 'N/A',
    }))

    const criticalCount = projections.filter((p: any) => p.urgency === 'CRITICAL').length
    const warningCount = projections.filter((p: any) => p.urgency === 'WARNING').length
    const okCount = projections.filter((p: any) => p.urgency === 'OK').length

    // Prepare inventory snapshot JSON
    const inventorySnapshot = JSON.stringify({
      currentWeek,
      summary: { criticalCount, warningCount, okCount },
      skuDetails: skuSummaries,
      replenishmentSuggestions: suggestionSummaries,
    }, null, 2)

    // Step 1: Create a new session with the agent
    console.log('[v0] Creating session...')
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
        title: `库存预警分析-${new Date().toISOString().slice(0, 10)}`,
      }),
    })

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text()
      console.error('[v0] Session creation failed:', errorText)
      throw new Error(`Session creation failed: ${errorText}`)
    }

    const session = await sessionResponse.json()
    console.log('[v0] Session created:', session.id)

    // Step 2: Send inventory data via events
    console.log('[v0] Sending inventory data...')
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
            content: [{ type: 'text', text: inventorySnapshot }],
          },
        ],
      }),
    })

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text()
      console.error('[v0] Events send failed:', errorText)
      throw new Error(`Events send failed: ${errorText}`)
    }

    console.log('[v0] Inventory data sent, polling for agent response...')

    // Step 3: Poll for agent response - wait for idle, then get events
    let suggestionText = ''
    const maxAttempts = 30 // Poll for up to 2.5 minutes (30 * 5 seconds)
    
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
      
      // When session is idle (agent finished), fetch events to get the response
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
          console.log('[v0] Events data (first 2000 chars):', JSON.stringify(eventsData).slice(0, 2000))
          
          // Based on the screenshot: event.type == "agent.message", content: event.content[0].text
          const events = eventsData.data || eventsData.events || eventsData
          if (Array.isArray(events)) {
            console.log('[v0] Found', events.length, 'events')
            for (const event of events) {
              console.log('[v0] Event type:', event.type)
              if (event.type === 'agent.message') {
                console.log('[v0] Found agent.message event!')
                // Get text from content[0].text
                if (event.content && Array.isArray(event.content) && event.content[0]) {
                  suggestionText = event.content[0].text || ''
                  console.log('[v0] Agent response length:', suggestionText.length)
                  break
                }
              }
            }
          }
        } else {
          const errorText = await eventsGetResponse.text()
          console.log('[v0] Events fetch failed:', eventsGetResponse.status, errorText)
        }
        
        // Session is idle, exit polling regardless of result
        break
      }
    }

    console.log('[v0] Final suggestion length:', suggestionText.length)

    return Response.json({ 
      suggestion: suggestionText || 'No suggestion generated',
      metadata: {
        criticalCount,
        warningCount,
        okCount,
        analyzedSkus: skuSummaries.length,
        sessionId: session.id,
      }
    })
  } catch (error) {
    console.error('[v0] AI suggestion error:', error)
    return Response.json(
      { error: 'Failed to generate AI suggestion' },
      { status: 500 }
    )
  }
}
