/**
 * Phase 3B/3C/3D — Replenishment Computation Engine
 *
 * Pure computation module — no React, no Supabase, no side effects.
 * All functions are deterministic given their inputs.
 */

import type {
  ProjectionWeek,
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
  SKUClassificationExtended,
} from './types'

// ─── Z-Score Lookup ──────────────────────────────────────────────────────────

const Z_SCORE_TABLE: [number, number][] = [
  [0.99, 2.33],
  [0.98, 2.05],
  [0.97, 1.88],
  [0.96, 1.75],
  [0.95, 1.65],
  [0.94, 1.55],
  [0.93, 1.48],
  [0.92, 1.41],
  [0.91, 1.34],
  [0.90, 1.28],
  [0.85, 1.04],
  [0.80, 0.84],
]

export function getZScore(serviceLevel: number): number {
  for (const [sl, z] of Z_SCORE_TABLE) {
    if (serviceLevel >= sl) return z
  }
  return 0.67
}

// ─── Safety Stock & Inventory Targets ────────────────────────────────────────

/** Safety stock in UNITS */
export function computeSafetyStockUnits(
  avgWeeklyDemand: number,
  cvDemand: number,
  leadTimeWeeks: number,
  serviceLevel: number,
  multiplier: number = 1.0
): number {
  if (avgWeeklyDemand <= 0 || leadTimeWeeks <= 0) return 0
  const z = getZScore(serviceLevel)
  const sigmaDemand = avgWeeklyDemand * (cvDemand || 0.5)
  return z * sigmaDemand * Math.sqrt(leadTimeWeeks) * multiplier
}

/** Safety stock in WEEKS of demand */
export function computeSafetyStockWeeks(
  avgWeeklyDemand: number,
  cvDemand: number,
  leadTimeWeeks: number,
  serviceLevel: number,
  multiplier: number = 1.0
): number {
  if (avgWeeklyDemand <= 0) return 0
  const ssUnits = computeSafetyStockUnits(avgWeeklyDemand, cvDemand, leadTimeWeeks, serviceLevel, multiplier)
  return ssUnits / avgWeeklyDemand
}

/** Reorder point in UNITS = demand during lead time + safety stock */
export function computeReorderPoint(
  avgWeeklyDemand: number,
  leadTimeWeeks: number,
  safetyStockUnits: number
): number {
  if (avgWeeklyDemand <= 0 || leadTimeWeeks <= 0) return 0
  return avgWeeklyDemand * leadTimeWeeks + safetyStockUnits
}

/** Target inventory in UNITS = avg_weekly_demand × target_woh */
export function computeTargetInventory(
  avgWeeklyDemand: number,
  targetWoh: number
): number {
  return avgWeeklyDemand * targetWoh
}

// ─── Week Utilities ──────────────────────────────────────────────────────────

/** Week 1 of 2026 starts on 2025-12-29 (Monday) */
const WEEK1_START = new Date('2025-12-29T00:00:00Z')

export function getWeekStartDate(weekNumber: number): string {
  const d = new Date(WEEK1_START)
  d.setUTCDate(d.getUTCDate() + (weekNumber - 1) * 7)
  return d.toISOString().split('T')[0]
}

export function getCurrentWeekNumber(): number {
  const now = new Date()
  const diffMs = now.getTime() - WEEK1_START.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

// ─── 12-Week Inventory Projection ────────────────────────────────────────────

export function computeProjection(
  sku: SKUClassificationExtended,
  currentInventory: number,
  currentWeek: number,
  inTransitByWeek: Map<number, number>,  // weekNumber → qty arriving
  projectionHorizon: number = 12
): SKUProjection {
  const avgWk = sku.avg_weekly_demand || 0
  const cv = sku.cv_demand || 0.5
  const lt = sku.lead_time_weeks || 11
  const sl = sku.service_level || 0.90
  const multiplier = sku.safety_stock_multiplier || 1.0
  const targetWoh = sku.target_woh || 8

  const ssUnits = computeSafetyStockUnits(avgWk, cv, lt, sl, multiplier)
  const ssWeeks = avgWk > 0 ? ssUnits / avgWk : 0
  const rop = computeReorderPoint(avgWk, lt, ssUnits)
  const target = computeTargetInventory(avgWk, targetWoh)
  const moq = sku.moq || 1

  const weeks: ProjectionWeek[] = []
  let projected = currentInventory
  let stockoutWeek: number | null = null
  let reorderTriggerWeek: number | null = null

  for (let i = 0; i < projectionHorizon; i++) {
    const weekNum = currentWeek + i + 1
    const demand = avgWk
    const arriving = inTransitByWeek.get(weekNum) || 0

    projected = projected - demand + arriving

    const status: ProjectionWeek['status'] =
      projected <= 0 ? 'STOCKOUT'
        : projected < ssUnits ? 'CRITICAL'
          : projected < rop ? 'WARNING'
            : 'OK'

    if (projected <= 0 && stockoutWeek === null) stockoutWeek = weekNum
    if (projected < rop && reorderTriggerWeek === null) reorderTriggerWeek = weekNum

    weeks.push({
      weekNumber: weekNum,
      weekStartDate: getWeekStartDate(weekNum),
      projectedInventory: Math.round(projected * 10) / 10,
      demand: Math.round(demand * 10) / 10,
      inTransitArrival: Math.round(arriving * 10) / 10,
      safetyStock: Math.round(ssUnits * 10) / 10,
      reorderPoint: Math.round(rop * 10) / 10,
      targetInventory: Math.round(target * 10) / 10,
      status,
    })
  }

  // Urgency: CRITICAL if stockout within LT, WARNING if below ROP
  const urgency: SKUProjection['urgency'] =
    (stockoutWeek !== null && stockoutWeek <= currentWeek + lt) ? 'CRITICAL'
      : reorderTriggerWeek !== null ? 'WARNING'
        : 'OK'

  return {
    skuId: sku.id,
    skuCode: sku.sku_code,
    partModel: sku.part_model,
    supplierCode: sku.supplier_code,
    abcClass: sku.abc_class,
    xyzClass: sku.xyz_class,
    matrixCell: sku.matrix_cell,
    currentInventory: Math.round(currentInventory * 10) / 10,
    avgWeeklyDemand: avgWk,
    leadTimeWeeks: lt,
    safetyStock: Math.round(ssUnits * 10) / 10,
    safetyStockWeeks: Math.round(ssWeeks * 10) / 10,
    reorderPoint: Math.round(rop),
    targetInventory: Math.round(target),
    moq,
    unitCost: sku.unit_cost,
    replenishmentMethod: sku.replenishment_method || 'auto',
    weeks,
    stockoutWeek,
    reorderTriggerWeek,
    urgency,
  }
}

// ─── Replenishment Suggestions ───────────────────────────────────────────────

export function generateSuggestions(
  projections: SKUProjection[],
  currentWeek: number
): ReplenishmentSuggestion[] {
  const suggestions: ReplenishmentSuggestion[] = []

  for (const proj of projections) {
    // Skip zero-demand SKUs
    if (proj.avgWeeklyDemand <= 0) continue
    // Skip if no risk detected
    if (proj.urgency === 'OK') continue

    const arrivalWeek = currentWeek + proj.leadTimeWeeks
    // Find projected inventory at arrival
    const arrivalWeekData = proj.weeks.find(w => w.weekNumber === arrivalWeek)
    // If arrival is beyond projection window, use last projected value
    const projectedAtArrival = arrivalWeekData
      ? arrivalWeekData.projectedInventory
      : proj.weeks[proj.weeks.length - 1]?.projectedInventory ?? 0

    // Order qty = target - projected_at_arrival
    // Ensure at least safety stock maintained
    let orderQty = proj.targetInventory - projectedAtArrival
    if (orderQty <= 0) continue  // no order needed

    // Round up to MOQ
    const moq = proj.moq || 1
    if (moq > 1) {
      orderQty = Math.ceil(orderQty / moq) * moq
    } else {
      orderQty = Math.ceil(orderQty)
    }

    const weeksOfCover = proj.avgWeeklyDemand > 0 ? orderQty / proj.avgWeeklyDemand : 0

    suggestions.push({
      skuId: proj.skuId,
      skuCode: proj.skuCode,
      partModel: proj.partModel,
      supplierCode: proj.supplierCode,
      matrixCell: proj.matrixCell,
      urgency: proj.urgency,
      replenishmentMethod: proj.replenishmentMethod,
      suggestedOrderQty: orderQty,
      moq,
      orderDate: new Date().toISOString().split('T')[0],
      expectedArrivalWeek: arrivalWeek,
      expectedArrivalDate: getWeekStartDate(arrivalWeek),
      currentInventory: proj.currentInventory,
      projectedAtArrival: Math.round(projectedAtArrival),
      safetyStock: proj.safetyStock,
      targetInventory: proj.targetInventory,
      avgWeeklyDemand: proj.avgWeeklyDemand,
      leadTimeWeeks: proj.leadTimeWeeks,
      weeksOfCover: Math.round(weeksOfCover * 10) / 10,
      estimatedCost: proj.unitCost ? Math.round(orderQty * proj.unitCost) : null,
    })
  }

  // Sort: CRITICAL first, then WARNING, then by estimated cost desc
  return suggestions.sort((a, b) => {
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, OK: 2 }
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (diff !== 0) return diff
    return (b.estimatedCost || 0) - (a.estimatedCost || 0)
  })
}

// ─── Summary Generator ───────────────────────────────────────────────────────

export function computeProjectionSummary(
  projections: SKUProjection[],
  suggestions: ReplenishmentSuggestion[]
): ProjectionSummary {
  const bySupplier: ProjectionSummary['bySupplier'] = {}

  let criticalCount = 0
  let warningCount = 0
  let okCount = 0

  for (const proj of projections) {
    if (proj.urgency === 'CRITICAL') criticalCount++
    else if (proj.urgency === 'WARNING') warningCount++
    else okCount++

    const sup = proj.supplierCode || 'Unknown'
    if (!bySupplier[sup]) {
      bySupplier[sup] = { skuCount: 0, criticalCount: 0, suggestedValue: 0 }
    }
    bySupplier[sup].skuCount++
    if (proj.urgency === 'CRITICAL') bySupplier[sup].criticalCount++
  }

  let totalSuggestedValue = 0
  for (const sug of suggestions) {
    totalSuggestedValue += sug.estimatedCost || 0
    const sup = sug.supplierCode || 'Unknown'
    if (bySupplier[sup]) {
      bySupplier[sup].suggestedValue += sug.estimatedCost || 0
    }
  }

  return {
    totalSkus: projections.length,
    criticalCount,
    warningCount,
    okCount,
    totalSuggestedOrders: suggestions.length,
    totalSuggestedValue,
    bySupplier,
  }
}
