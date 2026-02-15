import { NextResponse } from 'next/server'
import { fetchAndComputeProjections } from '@/lib/replenishment-data'
import { generateMockProjections } from '@/lib/mock-replenishment-data'

// GET: Compute 20-week inventory projection for all classified SKUs
// Uses customer forecast as preferred demand source (falls back to historical avg)
// Falls back to mock data if DB classification data is unavailable
export async function GET() {
  try {
    const result = await fetchAndComputeProjections()

    // ★ If DB returned no projections, fall back to mock data
    if (!result.projections || result.projections.length === 0) {
      console.log('[projection] No projections from DB, using mock data')
      const mockResult = generateMockProjections()
      return NextResponse.json(mockResult)
    }

    return NextResponse.json(result)
  } catch (error) {
    // ★ Fallback to mock data on any error (e.g., missing v_sku_classification view)
    console.log('[projection] Error, falling back to mock data:', error instanceof Error ? error.message : 'Unknown')
    try {
      const mockResult = generateMockProjections()
      return NextResponse.json(mockResult)
    } catch (mockError) {
      return NextResponse.json(
        { error: 'Failed to compute projections', details: mockError instanceof Error ? mockError.message : 'Unknown error' },
        { status: 500 }
      )
    }
  }
}
