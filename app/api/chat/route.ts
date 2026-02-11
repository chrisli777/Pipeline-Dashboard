import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const maxDuration = 30

// Get inventory data for context
async function getInventoryContext() {
  const supabase = await createClient()
  
  // Get SKU info from 'skus' table
  const { data: skuData } = await supabase
    .from('skus')
    .select('*')
  
  // Get recent inventory data (display weeks 1-10)
  const { data: inventoryData } = await supabase
    .from('inventory_data')
    .select('*')
    .gte('week_number', 1)
    .lte('week_number', 10)
    .order('sku_id')
    .order('week_number')
  
  return { skuData, inventoryData }
}

export async function POST(req: Request) {
  const { messages } = await req.json()
  
  // Get inventory context
  const { skuData, inventoryData } = await getInventoryContext()
  
  // Build system prompt with inventory context
  const systemPrompt = `You are an intelligent inventory analysis assistant for a supply chain management system. 
You help users analyze inventory data, identify potential stockout risks, and provide recommendations.

Current SKU Information:
${JSON.stringify(skuData, null, 2)}

Recent Inventory Data (Weeks 1-10):
${JSON.stringify(inventoryData, null, 2)}

Key metrics explanation:
- actual_inventory: Current inventory level
- customer_forecast: Expected customer demand
- actual_consumption: Actual units consumed
- eta (ATA): Arrivals/shipments to add
- defect: Defective units to subtract
- weeks_on_hand: Inventory / Average consumption (13-week rolling average)

When analyzing:
1. Identify SKUs with low weeks_on_hand (< 4 weeks is concerning, < 2 weeks is critical)
2. Look for trends in consumption vs inventory
3. Flag any SKUs that may face stockout risk
4. Provide actionable recommendations

Respond in the same language the user uses. Be concise and specific.`

  // Convert messages to Anthropic format
  const anthropicMessages = messages.map((msg: { role: string; parts?: Array<{ type: string; text?: string }>; content?: string }) => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.parts 
      ? msg.parts.filter((p: { type: string }) => p.type === 'text').map((p: { text?: string }) => p.text).join('') 
      : msg.content || ''
  }))

  // Call Anthropic API directly with streaming
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: anthropicMessages,
      stream: true,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    return NextResponse.json({ error }, { status: response.status })
  }

  // Create a streaming response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const reader = response.body?.getReader()
      if (!reader) {
        controller.close()
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                // Send as SSE format compatible with useChat
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'text-delta', 
                  delta: parsed.delta.text 
                })}\n\n`))
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
      
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
