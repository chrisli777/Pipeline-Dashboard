import { generateText } from 'ai'

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

    const prompt = `You are an inventory management expert for HX supplier products. Analyze the following inventory data and provide actionable recommendations.

Current Week: ${currentWeek}

Inventory Status Summary:
- Critical SKUs: ${criticalCount}
- Warning SKUs: ${warningCount}
- OK SKUs: ${okCount}

Top SKU Details:
${JSON.stringify(skuSummaries, null, 2)}

Replenishment Suggestions:
${JSON.stringify(suggestionSummaries, null, 2)}

Please provide:
1. Overall inventory health assessment (1-2 sentences)
2. Top 3 priority actions with specific SKU recommendations
3. Any concerns about upcoming stockouts
4. Recommendations for optimizing order timing

Keep your response concise and actionable. Focus on specific SKUs and weeks when making recommendations.`

    const result = await generateText({
      model: 'anthropic/claude-sonnet-4-20250514',
      prompt,
      maxOutputTokens: 800,
    })

    return Response.json({ 
      suggestion: result.text,
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
