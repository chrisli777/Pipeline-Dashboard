import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

    // Step 1: Create a new session with the agent
    const session = await (client.beta as any).sessions.create({
      agent: AGENT_ID,
      environment_id: ENVIRONMENT_ID,
      title: `库存预警分析-${new Date().toISOString().slice(0, 10)}`,
    })

    // Step 2: Send inventory data and collect response
    let suggestionText = ''
    
    const stream = await (client.beta as any).sessions.events.stream(session.id, {
      event: {
        type: 'user',
        content: inventorySnapshot,
      },
    })

    for await (const event of stream) {
      if (event.type === 'agent.message' && event.content) {
        suggestionText += event.content
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
