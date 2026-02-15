/**
 * Phase 3F — Mock Data for Local Testing
 *
 * Provides realistic WHI SKU data for testing the replenishment engine,
 * Risk Analysis Tab, and projection views when the DB lacks classification data.
 *
 * Data is based on actual migration 014 classification values.
 * This file should ONLY be used in development (process.env.NODE_ENV !== 'production').
 */

import {
  computeProjection,
  generateSuggestions,
  computeProjectionSummary,
  getCurrentWeekNumber,
} from '@/lib/replenishment-engine'
import type {
  SKUClassificationExtended,
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
  ClassificationPolicy,
} from '@/lib/types'

// ─── Mock Classification Policies (9-grid) ──────────────────────────────────

export const MOCK_POLICIES: ClassificationPolicy[] = [
  { id: '1', matrix_cell: 'AX', service_level: 0.97, target_woh: 4, review_frequency: 'weekly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'High value + stable' },
  { id: '2', matrix_cell: 'AY', service_level: 0.95, target_woh: 5, review_frequency: 'weekly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'High value + moderate' },
  { id: '3', matrix_cell: 'AZ', service_level: 0.93, target_woh: 6, review_frequency: 'weekly', replenishment_method: 'manual_review', safety_stock_multiplier: 1.0, notes: 'High value + erratic' },
  { id: '4', matrix_cell: 'BX', service_level: 0.95, target_woh: 5, review_frequency: 'biweekly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'Medium value + stable' },
  { id: '5', matrix_cell: 'BY', service_level: 0.93, target_woh: 6, review_frequency: 'biweekly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'Medium value + moderate' },
  { id: '6', matrix_cell: 'BZ', service_level: 0.90, target_woh: 8, review_frequency: 'biweekly', replenishment_method: 'manual_review', safety_stock_multiplier: 1.0, notes: 'Medium value + erratic' },
  { id: '7', matrix_cell: 'CX', service_level: 0.92, target_woh: 6, review_frequency: 'monthly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'Low value + stable' },
  { id: '8', matrix_cell: 'CY', service_level: 0.90, target_woh: 8, review_frequency: 'monthly', replenishment_method: 'auto', safety_stock_multiplier: 1.0, notes: 'Low value + moderate' },
  { id: '9', matrix_cell: 'CZ', service_level: 0.85, target_woh: 10, review_frequency: 'monthly', replenishment_method: 'on_demand', safety_stock_multiplier: 1.0, notes: 'Low value + erratic' },
]

// ─── Mock SKU Master Data ────────────────────────────────────────────────────
// Based on actual migration 014 classification values (top 15 SKUs by annual value)

const MOCK_SKUS: SKUClassificationExtended[] = [
  {
    id: '1282199', sku_code: '1282199', part_model: '1282199GT / T80 Control Side CW',
    description: 'Counterweight T80 Control Side', supplier_code: 'HX',
    abc_class: 'A', xyz_class: 'X', matrix_cell: 'AX',
    unit_cost: 1303.68, annual_consumption_value: 972284.02,
    avg_weekly_demand: 14.34, cv_demand: 0.2979,
    lead_time_weeks: 11, moq: 24, safety_stock_weeks: 4, reorder_point: 180,
    unit_weight: 3999, qty_per_container: 24, dimensions_cbm: 1.367,
    length_in: 59, width_in: 28, height_in: 50.5,
    service_level: 0.97, target_woh: 4, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'weekly',
  },
  {
    id: '1277620', sku_code: '1277620', part_model: '1277620GT / T80 Linkset LH',
    description: 'Linkset Left Hand T80', supplier_code: 'ZhongXing',
    abc_class: 'A', xyz_class: 'Y', matrix_cell: 'AY',
    unit_cost: 1151.97, annual_consumption_value: 729086.29,
    avg_weekly_demand: 12.17, cv_demand: 0.9402,
    lead_time_weeks: 11, moq: 12, safety_stock_weeks: 5, reorder_point: 170,
    unit_weight: 2145, qty_per_container: 12, dimensions_cbm: 1.409,
    length_in: 86.61, width_in: 21, height_in: 47.28,
    service_level: 0.95, target_woh: 5, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'weekly',
  },
  {
    id: '61415', sku_code: '61415', part_model: '61415GT / T80 Rear CW',
    description: 'Counterweight T80 Rear', supplier_code: 'HX',
    abc_class: 'A', xyz_class: 'Z', matrix_cell: 'AZ',
    unit_cost: 2500.46, annual_consumption_value: 722738.71,
    avg_weekly_demand: 5.56, cv_demand: 1.4053,
    lead_time_weeks: 11, moq: 8, safety_stock_weeks: 6, reorder_point: 95,
    unit_weight: 7250, qty_per_container: 8, dimensions_cbm: 0.887,
    length_in: 88, width_in: 41, height_in: 15,
    service_level: 0.93, target_woh: 6, safety_stock_multiplier: 1.0,
    replenishment_method: 'manual_review', review_frequency: 'weekly',
  },
  {
    id: '1306776', sku_code: '1306776', part_model: '1306776GT / T80 Link Pin Set',
    description: 'Link Pin Set T80', supplier_code: 'ZhongXing',
    abc_class: 'A', xyz_class: 'Y', matrix_cell: 'AY',
    unit_cost: 245.80, annual_consumption_value: 588647.40,
    avg_weekly_demand: 46.05, cv_demand: 0.5465,
    lead_time_weeks: 11, moq: 48, safety_stock_weeks: 5, reorder_point: 570,
    unit_weight: 1758, qty_per_container: 48, dimensions_cbm: 7.605,
    length_in: 110, width_in: 123, height_in: 34.3,
    service_level: 0.95, target_woh: 5, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'weekly',
  },
  {
    id: '824433', sku_code: '824433', part_model: '824433GT / T80 Front CW',
    description: 'Counterweight T80 Front', supplier_code: 'HX',
    abc_class: 'A', xyz_class: 'Y', matrix_cell: 'AY',
    unit_cost: 2310.18, annual_consumption_value: 433980.08,
    avg_weekly_demand: 3.61, cv_demand: 0.8068,
    lead_time_weeks: 11, moq: 8, safety_stock_weeks: 5, reorder_point: 55,
    unit_weight: 7028, qty_per_container: 8, dimensions_cbm: 3.208,
    length_in: 101, width_in: 38, height_in: 51,
    service_level: 0.95, target_woh: 5, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'weekly',
  },
  {
    id: '1267365', sku_code: '1267365', part_model: '1267365GT / S80 Rear CW',
    description: 'Counterweight S80 Rear', supplier_code: 'ZhongXing',
    abc_class: 'B', xyz_class: 'Z', matrix_cell: 'BZ',
    unit_cost: 3192.80, annual_consumption_value: 364957.25,
    avg_weekly_demand: 2.20, cv_demand: 1.7710,
    lead_time_weeks: 11, moq: 4, safety_stock_weeks: 8, reorder_point: 42,
    unit_weight: 8309, qty_per_container: 4, dimensions_cbm: 2.240,
    length_in: 88.58, width_in: 31.5, height_in: 49,
    service_level: 0.90, target_woh: 8, safety_stock_multiplier: 1.0,
    replenishment_method: 'manual_review', review_frequency: 'biweekly',
  },
  {
    id: '1301444', sku_code: '1301444', part_model: '1301444GT / Link Pin Assembly',
    description: 'Link Pin Assembly', supplier_code: 'ZhongXing',
    abc_class: 'B', xyz_class: 'Y', matrix_cell: 'BY',
    unit_cost: 262.43, annual_consumption_value: 99825.92,
    avg_weekly_demand: 7.32, cv_demand: 0.5456,
    lead_time_weeks: 11, moq: 24, safety_stock_weeks: 6, reorder_point: 107,
    unit_weight: 4835, qty_per_container: 24, dimensions_cbm: 0.983,
    length_in: 53.15, width_in: 47.64, height_in: 23.7,
    service_level: 0.93, target_woh: 6, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'biweekly',
  },
  {
    id: '1278414', sku_code: '1278414', part_model: '1278414GT / Wear Pad LH',
    description: 'Wear Pad Left Hand', supplier_code: 'ZhongXing',
    abc_class: 'B', xyz_class: 'X', matrix_cell: 'BX',
    unit_cost: 371.79, annual_consumption_value: 48419.05,
    avg_weekly_demand: 2.50, cv_demand: 0.3186,
    lead_time_weeks: 11, moq: 12, safety_stock_weeks: 5, reorder_point: 33,
    unit_weight: 1025, qty_per_container: 12, dimensions_cbm: 0.149,
    length_in: 38, width_in: 12, height_in: 20,
    service_level: 0.95, target_woh: 5, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'biweekly',
  },
  {
    id: '1272762', sku_code: '1272762', part_model: '1272762GT / T80 CW (Control Side)',
    description: 'Counterweight T80 Control Side Small', supplier_code: 'HX',
    abc_class: 'B', xyz_class: 'Z', matrix_cell: 'BZ',
    unit_cost: 445.84, annual_consumption_value: 43652.10,
    avg_weekly_demand: 1.88, cv_demand: 1.5545,
    lead_time_weeks: 11, moq: 4, safety_stock_weeks: 8, reorder_point: 35,
    unit_weight: 1068, qty_per_container: 4, dimensions_cbm: 0.309,
    length_in: 31, width_in: 21, height_in: 29,
    service_level: 0.90, target_woh: 8, safety_stock_multiplier: 1.0,
    replenishment_method: 'manual_review', review_frequency: 'biweekly',
  },
  {
    id: '56174', sku_code: '56174', part_model: '56174GT / Hydraulic Cylinder',
    description: 'Hydraulic Cylinder', supplier_code: 'WINSCHEM',
    abc_class: 'C', xyz_class: 'X', matrix_cell: 'CX',
    unit_cost: 118.64, annual_consumption_value: 25788.82,
    avg_weekly_demand: 4.18, cv_demand: 0.3016,
    lead_time_weeks: 11, moq: 12, safety_stock_weeks: 6, reorder_point: 56,
    unit_weight: 762, qty_per_container: 12, dimensions_cbm: 0.671,
    length_in: 36.61, width_in: 29.92, height_in: 37.4,
    service_level: 0.92, target_woh: 6, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'monthly',
  },
  {
    id: '1277619', sku_code: '1277619', part_model: '1277619GT / T80 Linkset RH',
    description: 'Linkset Right Hand T80', supplier_code: 'ZhongXing',
    abc_class: 'C', xyz_class: 'Y', matrix_cell: 'CY',
    unit_cost: 607.21, annual_consumption_value: 26737.46,
    avg_weekly_demand: 0.85, cv_demand: 0.9009,
    lead_time_weeks: 11, moq: 4, safety_stock_weeks: 8, reorder_point: 16,
    unit_weight: 2145, qty_per_container: 4, dimensions_cbm: 1.476,
    length_in: 86.61, width_in: 22, height_in: 47.28,
    service_level: 0.90, target_woh: 8, safety_stock_multiplier: 1.0,
    replenishment_method: 'auto', review_frequency: 'monthly',
  },
  {
    id: '1304828', sku_code: '1304828', part_model: '1304828GT / Boom Bracket',
    description: 'Boom Bracket', supplier_code: 'TianJin',
    abc_class: 'C', xyz_class: 'Z', matrix_cell: 'CZ',
    unit_cost: 207.56, annual_consumption_value: 6126.19,
    avg_weekly_demand: 0.57, cv_demand: 1.2000,
    lead_time_weeks: 11, moq: 4, safety_stock_weeks: 10, reorder_point: 12,
    unit_weight: 6176, qty_per_container: 4, dimensions_cbm: 0.456,
    length_in: 45, width_in: 45, height_in: 13.75,
    service_level: 0.85, target_woh: 10, safety_stock_multiplier: 1.0,
    replenishment_method: 'on_demand', review_frequency: 'monthly',
  },
]

// ─── Mock Inventory (realistic scenario) ─────────────────────────────────────

const MOCK_INVENTORY: Record<string, number> = {
  '1282199': 45,    // AX: ~3 weeks cover — slightly low
  '1277620': 8,     // AY: < 1 week cover — CRITICAL
  '61415':   12,    // AZ: ~2 weeks cover — below SS
  '1306776': 150,   // AY: ~3 weeks cover
  '824433':  18,    // AY: ~5 weeks cover — OK
  '1267365': 3,     // BZ: ~1.4 weeks cover — WARNING
  '1301444': 30,    // BY: ~4 weeks cover
  '1278414': 15,    // BX: ~6 weeks cover — OK
  '1272762': 0,     // BZ: STOCKOUT!
  '56174':   35,    // CX: ~8 weeks cover — OK
  '1277619': 5,     // CY: ~6 weeks cover — OK
  '1304828': 2,     // CZ: ~3.5 weeks cover
}

// ─── Mock In-Transit ─────────────────────────────────────────────────────────

function getMockInTransit(currentWeek: number): Map<string, Map<number, number>> {
  const map = new Map<string, Map<number, number>>()

  // 1277620 (AY, CRITICAL) — order in transit arriving week+3
  const lt1 = new Map<number, number>()
  lt1.set(currentWeek + 3, 24)
  map.set('1277620', lt1)

  // 61415 (AZ) — order arriving week+5
  const lt2 = new Map<number, number>()
  lt2.set(currentWeek + 5, 16)
  map.set('61415', lt2)

  // 1282199 (AX) — order arriving week+2
  const lt3 = new Map<number, number>()
  lt3.set(currentWeek + 2, 48)
  map.set('1282199', lt3)

  // 1272762 (BZ, STOCKOUT) — order arriving week+7
  const lt4 = new Map<number, number>()
  lt4.set(currentWeek + 7, 8)
  map.set('1272762', lt4)

  return map
}

// ─── Mock Forecast (Genie customer forecast for top SKUs) ────────────────────

function getMockForecast(currentWeek: number): Map<string, Map<number, number>> {
  const map = new Map<string, Map<number, number>>()

  // Forecast for 1282199 (AX): higher than historical avg (14.34)
  const fc1 = new Map<number, number>()
  for (let w = 1; w <= 12; w++) {
    fc1.set(currentWeek + w, 16 + Math.round(Math.random() * 4))  // 16-20/wk forecast
  }
  map.set('1282199', fc1)

  // Forecast for 1277620 (AY): seasonal spike
  const fc2 = new Map<number, number>()
  for (let w = 1; w <= 12; w++) {
    fc2.set(currentWeek + w, w <= 4 ? 18 : 10)  // spike first 4 weeks, then normalize
  }
  map.set('1277620', fc2)

  // Forecast for 61415 (AZ): consistent with history
  const fc3 = new Map<number, number>()
  for (let w = 1; w <= 8; w++) {
    fc3.set(currentWeek + w, 5 + Math.round(Math.random() * 2))
  }
  map.set('61415', fc3)

  // Forecast for 1306776 (AY): ramping up
  const fc4 = new Map<number, number>()
  for (let w = 1; w <= 10; w++) {
    fc4.set(currentWeek + w, 40 + w * 3)  // 43 → 70/wk ramp
  }
  map.set('1306776', fc4)

  return map
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface MockProjectionResult {
  currentWeek: number
  projections: SKUProjection[]
  suggestions: ReplenishmentSuggestion[]
  summary: ProjectionSummary
  dataAsOf: string
}

/**
 * Generate mock projection data using the real engine with mock inputs.
 * This exercises all the Phase 3F engine changes (SS cap, forecast, frequency filter).
 */
export function generateMockProjections(): MockProjectionResult {
  const currentWeek = getCurrentWeekNumber()
  const inTransitMap = getMockInTransit(currentWeek)
  const forecastMap = getMockForecast(currentWeek)

  // Build SKU master map for suggestions
  const skuMap = new Map<string, SKUClassificationExtended>()
  for (const sku of MOCK_SKUS) {
    skuMap.set(sku.sku_code, sku)
  }

  // Compute projections using the REAL engine
  const projections = MOCK_SKUS.map(sku => {
    const currentInventory = MOCK_INVENTORY[sku.id] ?? 0
    const skuInTransit = inTransitMap.get(sku.sku_code) ?? new Map<number, number>()
    const skuForecast = forecastMap.get(sku.id) ?? undefined

    return computeProjection(sku, currentInventory, currentWeek, skuInTransit, 20, skuForecast)
  })

  // Generate suggestions using the REAL engine (with frequency/on_demand filtering)
  const suggestions = generateSuggestions(projections, currentWeek, skuMap)

  // Compute summary
  const summary = computeProjectionSummary(projections, suggestions)

  return {
    currentWeek,
    projections,
    suggestions,
    summary,
    dataAsOf: new Date().toISOString(),
  }
}

/**
 * Generate mock classification data for the Classification Tab.
 */
export function getMockClassificationData() {
  const skus = MOCK_SKUS.map(sku => ({
    ...sku,
    // Flatten for classification table compatibility
    id: sku.id,
    sku_code: sku.sku_code,
    part_model: sku.part_model,
    description: sku.description,
    supplier_code: sku.supplier_code,
    abc_class: sku.abc_class,
    xyz_class: sku.xyz_class,
    matrix_cell: sku.matrix_cell,
    unit_cost: sku.unit_cost,
    annual_consumption_value: sku.annual_consumption_value,
    avg_weekly_demand: sku.avg_weekly_demand,
    cv_demand: sku.cv_demand,
    safety_stock_weeks: sku.safety_stock_weeks,
    reorder_point: sku.reorder_point,
    moq: sku.moq,
    lead_time_weeks: sku.lead_time_weeks,
    unit_weight: sku.unit_weight,
    qty_per_container: sku.qty_per_container,
  }))

  // Build summary
  const abcCounts = { A: 0, B: 0, C: 0 }
  const xyzCounts = { X: 0, Y: 0, Z: 0 }
  const matrixCounts: Record<string, number> = {}
  const matrixValues: Record<string, number> = {}
  let totalAnnualValue = 0

  for (const sku of skus) {
    if (sku.abc_class) abcCounts[sku.abc_class as keyof typeof abcCounts]++
    if (sku.xyz_class) xyzCounts[sku.xyz_class as keyof typeof xyzCounts]++
    const cell = (sku.abc_class || '') + (sku.xyz_class || '')
    matrixCounts[cell] = (matrixCounts[cell] || 0) + 1
    matrixValues[cell] = (matrixValues[cell] || 0) + (sku.annual_consumption_value || 0)
    totalAnnualValue += sku.annual_consumption_value || 0
  }

  const suppliers = [...new Set(skus.map(s => s.supplier_code).filter(Boolean))].sort()

  return {
    skus,
    policies: MOCK_POLICIES,
    summary: {
      totalSkus: skus.length,
      abcCounts,
      xyzCounts,
      matrixCounts,
      matrixValues,
      totalAnnualValue,
      suppliers,
    },
  }
}
