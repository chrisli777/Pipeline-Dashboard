
import { NextResponse } from 'next/server'

// GET: Fetch replenishment suggestions
// This is a convenience endpoint that returns only the suggestions portion
// of the projection response. The full computation happens in /api/replenishment/projection.
export async function GET(request: Request) {
  try {
    // Forward to projection endpoint and extract suggestions
    const baseUrl = new URL(request.url).origin
    const response = await fetch(`${baseUrl}/api/replenishment/projection`, {
      headers: request.headers,
    })

    if (!response.ok) {
      const errorData = await response.json()
      return NextResponse.json(errorData, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      suggestions: data.suggestions,
      summary: data.summary,
      currentWeek: data.currentWeek,
      dataAsOf: data.dataAsOf,
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch suggestions', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
