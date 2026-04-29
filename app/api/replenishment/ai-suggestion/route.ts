import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// System prompt for "库存早期预警分析师" agent
const SYSTEM_PROMPT = `你是库存早期预警分析师，专门分析供应链库存数据并提供补货建议。

你的职责：
1. 分析库存数据，识别即将缺货的SKU
2. 根据紧急程度(CRITICAL/WARNING/OK)给出优先级建议
3. 提供具体的补货数量和时间建议
4. 用简洁的中文回复，重点突出关键行动项

回复格式：
- 先给出总体概况（几个紧急、几个预警、几个正常）
- 然后列出需要立即关注的SKU及建议
- 最后给出整体建议

保持回复简洁，不超过300字。`

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

    // Call Claude messages API with the system prompt
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `请分析以下库存数据并给出补货建议：\n\n${JSON.stringify(inventorySnapshot, null, 2)}`,
        },
      ],
    })

    // Extract the text response
    let suggestionText = ''
    for (const block of response.content) {
      if (block.type === 'text') {
        suggestionText += block.text
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
