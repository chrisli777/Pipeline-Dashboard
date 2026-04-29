const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

// Agent configuration
const AGENT_ID = 'agent_011CaYomWFdBAQjuMAgbmaw2'
const ENVIRONMENT_ID = 'env_016qaDFym3wS7GkuBof5xNZZ'

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

    // Step 1: Create a new session with the agent via HTTP
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
      console.error('Session creation failed:', errorText)
      throw new Error(`Session creation failed: ${errorText}`)
    }

    const session = await sessionResponse.json()
    console.log('[v0] Session created:', session.id)

    // Step 2: Send inventory data via events
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
      console.error('Events send failed:', errorText)
      throw new Error(`Events send failed: ${errorText}`)
    }

    // Read streamed response
    let suggestionText = ''
    const reader = eventsResponse.body?.getReader()
    const decoder = new TextDecoder()

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        const chunk = decoder.decode(value, { stream: true })
        // Parse SSE events
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'agent.message' && event.content) {
                suggestionText += event.content
              }
            } catch (e) {
              // Ignore parse errors for incomplete JSON
            }
          }
        }
      }
    }

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
    console.error('AI suggestion error:', error)
    return Response.json(
      { error: 'Failed to generate AI suggestion' },
      { status: 500 }
    )
  }
}
