import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET: Fetch all SKU classifications + policies for 9-grid matrix
export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch classified SKUs from view
    const { data: skus, error: skuError } = await supabase
      .from('v_sku_classification')
      .select('*')

    if (skuError) {
      return NextResponse.json({ error: skuError.message }, { status: 500 })
    }

    // Fetch classification policies (9-grid settings)
    const { data: policies, error: policyError } = await supabase
      .from('classification_policies')
      .select('*')
      .order('matrix_cell')

    if (policyError) {
      return NextResponse.json({ error: policyError.message }, { status: 500 })
    }

    // Build summary statistics
    const totalSkus = skus?.length || 0
    const abcCounts = { A: 0, B: 0, C: 0 }
    const xyzCounts = { X: 0, Y: 0, Z: 0 }
    const matrixCounts: Record<string, number> = {}
    const matrixValues: Record<string, number> = {}
    let totalAnnualValue = 0

    for (const sku of skus || []) {
      if (sku.abc_class) abcCounts[sku.abc_class as keyof typeof abcCounts]++
      if (sku.xyz_class) xyzCounts[sku.xyz_class as keyof typeof xyzCounts]++

      const cell = (sku.abc_class || '') + (sku.xyz_class || '')
      if (cell) {
        matrixCounts[cell] = (matrixCounts[cell] || 0) + 1
        matrixValues[cell] = (matrixValues[cell] || 0) + (sku.annual_consumption_value || 0)
      }
      totalAnnualValue += sku.annual_consumption_value || 0
    }

    // Get unique suppliers for filter dropdown
    const suppliers = [...new Set((skus || []).map((s: { supplier_code: string }) => s.supplier_code).filter(Boolean))].sort()

    return NextResponse.json({
      skus: skus || [],
      policies: policies || [],
      summary: {
        totalSkus,
        abcCounts,
        xyzCounts,
        matrixCounts,
        matrixValues,
        totalAnnualValue,
        suppliers,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch classification data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
