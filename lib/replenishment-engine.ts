/**
 * Phase 3B/3C/3D/3E/3F — Replenishment Computation Engine
 *
 * Pure computation module — no React, no Supabase, no side effects.
 * All functions are deterministic given their inputs.
 *
 * Key design notes:
 * - target_woh = warehouse stock only (does NOT include in-transit)
 * - lead_time = production + shipping (11-16 weeks)
 * - Target < ROP is EXPECTED for long-LT supply chains
 * - Inventory Position = on-hand + in-transit (full pipeline view)
 * - Safety stock capped by target_woh (customer requires 4-6 wks max)
 * - Demand source: customer forecast preferred over historical average
 * - review_frequency: biweekly/monthly SKUs only reviewed on schedule
 * - on_demand (CZ class): no auto-suggestions unless CRITICAL
 */

import type {
  InTransitEntry,
  ProjectionWeek,
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
  ConsolidatedPO,
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

/** Safety stock in UNITS — capped by target_woh to meet customer requirements */
export function computeSafetyStockUnits(
  avgWeeklyDemand: number,
  cvDemand: number,
  leadTimeWeeks: number,
  serviceLevel: number,
  multiplier: number = 1.0,
  targetWoh?: number
): number {
  if (avgWeeklyDemand <= 0 || leadTimeWeeks <= 0) return 0
  const z = getZScore(serviceLevel)
  const sigmaDemand = avgWeeklyDemand * (cvDemand || 0.5)
  let ss = z * sigmaDemand * Math.sqrt(leadTimeWeeks) * multiplier

  // Cap safety stock: SS(weeks) must not exceed target_woh
  if (targetWoh && targetWoh > 0) {
    const maxSS = avgWeeklyDemand * targetWoh
    ss = Math.min(ss, maxSS)
  }

  return ss
}

/** Safety stock in WEEKS of demand */
export function computeSafetyStockWeeks(
  avgWeeklyDemand: number,
  cvDemand: number,
  leadTimeWeeks: number,
  serviceLevel: number,
  multiplier: number = 1.0,
  targetWoh?: number
): number {
  if (avgWeeklyDemand <= 0) return 0
  const ssUnits = computeSafetyStockUnits(avgWeeklyDemand, cvDemand, leadTimeWeeks, serviceLevel, multiplier, targetWoh)
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

/** Target inventory in UNITS = avg_weekly_demand x target_woh (warehouse only) */
export function computeTargetInventory(
  avgWeeklyDemand: number,
  targetWoh: number
): number {
  return avgWeeklyDemand * targetWoh
}

// ─── Inventory Position ─────────────────────────────────────────────────────

/** Compute inventory position = on-hand + total in-transit pipeline */
export function computeInventoryPosition(
  currentInventory: number,
  inTransitByWeek: Map<number, number>
): { inventoryPosition: number; totalInTransit: number; schedule: InTransitEntry[] } {
  let totalInTransit = 0
  const schedule: InTransitEntry[] = []
  for (const [weekNumber, qty] of inTransitByWeek.entries()) {
    if (qty > 0) {
      totalInTransit += qty
      schedule.push({ weekNumber, qty })
    }
  }
  schedule.sort((a, b) => a.weekNumber - b.weekNumber)
  return {
    inventoryPosition: currentInventory + totalInTransit,
    totalInTransit,
    schedule,
  }
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

// ─── Inventory Projection (default 20 weeks) ────────────────────────────────

export function computeProjection(
  sku: SKUClassificationExtended,
  currentInventory: number,
  currentWeek: number,
  inTransitByWeek: Map<number, number>,
  projectionHorizon: number = 20,
  weeklyForecast?: Map<number, number>
): SKUProjection {
  const historicalDemand = sku.avg_weekly_demand || 0
  const cv = sku.cv_demand || 0.5
  const lt = sku.lead_time_weeks || 11
  const sl = sku.service_level || 0.90
  const multiplier = sku.safety_stock_multiplier || 1.0
  const targetWoh = sku.target_woh || 8

  // Demand source: prefer customer forecast, fallback to historical average
  const hasForecast = weeklyForecast !== undefined && weeklyForecast.size > 0
  let effectiveDemand = historicalDemand
  if (hasForecast) {
    const forecastValues = [...weeklyForecast!.values()].filter(v => v > 0)
    if (forecastValues.length > 0) {
      effectiveDemand = forecastValues.reduce((a, b) => a + b, 0) / forecastValues.length
    }
  }
  const avgWk = effectiveDemand

  // Pass targetWoh to cap safety stock at customer-required levels
  const ssUnits = computeSafetyStockUnits(avgWk, cv, lt, sl, multiplier, targetWoh)
  const ssWeeks = avgWk > 0 ? ssUnits / avgWk : 0
  const rop = computeReorderPoint(avgWk, lt, ssUnits)
  const target = computeTargetInventory(avgWk, targetWoh)
  const moq = sku.moq || 1

  // Compute inventory position (on-hand + pipeline)
  const invPos = computeInventoryPosition(currentInventory, inTransitByWeek)

  const weeks: ProjectionWeek[] = []
  let projected = currentInventory
  let stockoutWeek: number | null = null
  let reorderTriggerWeek: number | null = null

  for (let i = 0; i < projectionHorizon; i++) {
    const weekNum = currentWeek + i + 1
    // Per-week demand: use forecast for that specific week if available
    const demand = weeklyForecast?.get(weekNum) ?? effectiveDemand
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

  // Urgency determination — uses review_frequency to set relevant horizon
  const reviewCycle = sku.review_frequency === 'monthly' ? 4
    : sku.review_frequency === 'biweekly' ? 2
      : 1
  const urgencyHorizon = currentWeek + reviewCycle + lt

  const urgency: SKUProjection['urgency'] =
    (stockoutWeek !== null && stockoutWeek <= currentWeek + lt) ? 'CRITICAL'
      : (reorderTriggerWeek !== null && reorderTriggerWeek <= urgencyHorizon) ? 'WARNING'
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
    inventoryPosition: Math.round(invPos.inventoryPosition * 10) / 10,
    totalInTransit: Math.round(invPos.totalInTransit * 10) / 10,
    inTransitSchedule: invPos.schedule,
    demandSource: hasForecast ? 'forecast' : 'historical',
    forecastDemand: hasForecast ? Math.round(effectiveDemand * 10) / 10 : null,
  }
}

// ─── Replenishment Suggestions (enriched) ────────────────────────────────────

export function generateSuggestions(
  projections: SKUProjection[],
  currentWeek: number,
  skuMap?: Map<string, SKUClassificationExtended>
): ReplenishmentSuggestion[] {
  const suggestions: ReplenishmentSuggestion[] = []

  for (const proj of projections) {
    if (proj.avgWeeklyDemand <= 0) continue
    if (proj.urgency === 'OK') continue

    // Skip on_demand SKUs (CZ class) unless CRITICAL
    if (proj.replenishmentMethod === 'on_demand' && proj.urgency !== 'CRITICAL') continue

    // Apply review_frequency filter (CRITICAL always bypasses)
    const skuMasterForFreq = skuMap?.get(proj.skuCode)
    if (skuMasterForFreq?.review_frequency && !shouldReviewThisWeek(currentWeek, skuMasterForFreq.review_frequency)) {
      if (proj.urgency !== 'CRITICAL') continue
    }

    const arrivalWeek = currentWeek + proj.leadTimeWeeks
    const arrivalWeekData = proj.weeks.find(w => w.weekNumber === arrivalWeek)
    const projectedAtArrival = arrivalWeekData
      ? arrivalWeekData.projectedInventory
      : proj.weeks[proj.weeks.length - 1]?.projectedInventory ?? 0

    let orderQty = proj.targetInventory - projectedAtArrival
    if (orderQty <= 0) continue

    const moq = proj.moq || 1
    if (moq > 1) {
      orderQty = Math.ceil(orderQty / moq) * moq
    } else {
      orderQty = Math.ceil(orderQty)
    }

    const weeksOfCover = proj.avgWeeklyDemand > 0 ? orderQty / proj.avgWeeklyDemand : 0

    const skuMaster = skuMap?.get(proj.skuCode)
    const qtyPerContainer = skuMaster?.qty_per_container ?? null
    const unitWeight = skuMaster?.unit_weight ?? null
    const annualValue = skuMaster?.annual_consumption_value ?? null

    const daysOfSupply = proj.avgWeeklyDemand > 0
      ? Math.round(proj.currentInventory / (proj.avgWeeklyDemand / 7))
      : 999

    const weeksUntilStockout = proj.stockoutWeek !== null
      ? proj.stockoutWeek - currentWeek
      : null

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
      inventoryPosition: proj.inventoryPosition,
      totalInTransit: proj.totalInTransit,
      inTransitSchedule: proj.inTransitSchedule,
      daysOfSupply,
      stockoutWeek: proj.stockoutWeek,
      weeksUntilStockout,
      qtyPerContainer,
      estimatedContainers: qtyPerContainer && qtyPerContainer > 0
        ? Math.round((orderQty / qtyPerContainer) * 10) / 10
        : null,
      annualConsumptionValue: annualValue,
      unitWeight,
      totalWeight: unitWeight ? Math.round(orderQty * unitWeight) : null,
      demandSource: proj.demandSource,
    })
  }

  return suggestions.sort((a, b) => {
    const urgencyOrder = { CRITICAL: 0, WARNING: 1, OK: 2 }
    const diff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency]
    if (diff !== 0) return diff
    return (b.estimatedCost || 0) - (a.estimatedCost || 0)
  })
}

// ─── Review Frequency Filter ────────────────────────────────────────────────

/** Check if this week is a review week based on ABC/XYZ frequency policy */
export function shouldReviewThisWeek(
  currentWeek: number,
  frequency: 'weekly' | 'biweekly' | 'monthly' | string
): boolean {
  if (frequency === 'weekly') return true
  if (frequency === 'biweekly') return currentWeek % 2 === 0
  if (frequency === 'monthly') return currentWeek % 4 === 0
  return true
}

// ─── Supplier Consolidation ─────────────────────────────────────────────────

export function consolidateBySupplier(
  suggestions: ReplenishmentSuggestion[]
): ConsolidatedPO[] {
  const groups = new Map<string, ReplenishmentSuggestion[]>()
  for (const sug of suggestions) {
    const sup = sug.supplierCode || 'Unknown'
    if (!groups.has(sup)) groups.set(sup, [])
    groups.get(sup)!.push(sug)
  }

  const pos: ConsolidatedPO[] = []
  for (const [supplierCode, items] of groups.entries()) {
    let totalQty = 0
    let totalCost = 0
    let totalWeight: number | null = 0
    let totalContainers = 0
    let hasContainerData = false
    let criticalCount = 0
    let maxArrivalWeek = 0

    const poItems: ConsolidatedPO['items'] = []
    for (const sug of items) {
      totalQty += sug.suggestedOrderQty
      totalCost += sug.estimatedCost || 0
      if (sug.totalWeight !== null && totalWeight !== null) {
        totalWeight += sug.totalWeight
      } else if (sug.totalWeight === null) {
        totalWeight = null
      }
      if (sug.urgency === 'CRITICAL') criticalCount++
      if (sug.expectedArrivalWeek > maxArrivalWeek) maxArrivalWeek = sug.expectedArrivalWeek

      let containerHint: string | null = null
      if (sug.qtyPerContainer && sug.qtyPerContainer > 0) {
        const ctrs = sug.suggestedOrderQty / sug.qtyPerContainer
        containerHint = `~${Math.round(ctrs * 10) / 10} ctr`
        totalContainers += ctrs
        hasContainerData = true
      }

      poItems.push({
        skuCode: sug.skuCode,
        partModel: sug.partModel,
        matrixCell: sug.matrixCell,
        urgency: sug.urgency,
        suggestedOrderQty: sug.suggestedOrderQty,
        estimatedCost: sug.estimatedCost,
        weeksOfCover: sug.weeksOfCover,
        containerHint,
      })
    }

    pos.push({
      supplierCode,
      orderDate: new Date().toISOString().split('T')[0],
      expectedArrivalWeek: maxArrivalWeek,
      expectedArrivalDate: getWeekStartDate(maxArrivalWeek),
      items: poItems,
      totalQty,
      totalCost: Math.round(totalCost),
      totalWeight: totalWeight !== null ? Math.round(totalWeight) : null,
      estimatedContainers: hasContainerData ? Math.ceil(totalContainers) : null,
      skuCount: items.length,
      criticalCount,
    })
  }

  return pos.sort((a, b) => b.totalCost - a.totalCost)
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

  const consolidatedPOs = consolidateBySupplier(suggestions)

  return {
    totalSkus: projections.length,
    criticalCount,
    warningCount,
    okCount,
    totalSuggestedOrders: suggestions.length,
    totalSuggestedValue,
    bySupplier,
    consolidatedPOs,
  }
}
