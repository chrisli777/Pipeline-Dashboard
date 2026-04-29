import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

    // Prepare inventory snapshot JSON for the agent
    const inventorySnapshot = {
      currentWeek,
      summary: {
        criticalCount,
        warningCount,
        okCount,
      },
      skuDetails: skuSummaries,
      replenishmentSuggestions: suggestionSummaries,
    }

    // Call Anthropic Agent API directly
    const response = await client.beta.agents.run({
      agent_id: 'agent_011CaYomWFdBAQjuMAgbmaw2',
      input: JSON.stringify(inventorySnapshot),
    })

    // Extract the text response from the agent
    let suggestionText = ''
    if (response.output && Array.isArray(response.output)) {
      for (const block of response.output) {
        if (block.type === 'text') {
          suggestionText += block.text
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
