/**
 * Phase 3F — Risk Report Generator
 *
 * Pure function module — no React, no Supabase, no side effects.
 * Transforms projection + suggestion data into a customer-facing RiskReport.
 * Also generates email HTML for weekly risk reports.
 */

import type {
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
  RiskItem,
  RiskReport,
  RiskType,
} from './types'
import { getWeekStartDate } from './replenishment-engine'

// ─── Risk Report Builder ────────────────────────────────────────────────────

export function buildRiskReport(
  projections: SKUProjection[],
  suggestions: ReplenishmentSuggestion[],
  summary: ProjectionSummary,
  currentWeek: number,
  aiSummary?: string | null,
  aiActionItems?: string | null,
  aiMeetingAgenda?: string | null,
): RiskReport {
  // Build suggestion lookup: skuCode → suggestion
  const suggestionMap = new Map<string, ReplenishmentSuggestion>()
  for (const sug of suggestions) {
    suggestionMap.set(sug.skuCode, sug)
  }

  const criticalItems: RiskItem[] = []
  const warningItems: RiskItem[] = []
  const okItems: RiskItem[] = []
  let totalPendingOrders = 0
  let totalOrderValue = 0
  let unmitigatedRiskCount = 0

  for (const proj of projections) {
    const sug = suggestionMap.get(proj.skuCode)
    const riskItem = buildRiskItem(proj, sug, currentWeek)

    if (sug) {
      totalPendingOrders++
      totalOrderValue += sug.estimatedCost || 0
    }

    if (riskItem.riskLevel === 'CRITICAL') {
      criticalItems.push(riskItem)
      if (!riskItem.hasPendingOrder) unmitigatedRiskCount++
    } else if (riskItem.riskLevel === 'WARNING') {
      warningItems.push(riskItem)
      if (!riskItem.hasPendingOrder) unmitigatedRiskCount++
    } else {
      okItems.push(riskItem)
    }
  }

  // Sort critical by stockout week (soonest first)
  criticalItems.sort((a, b) => (a.stockoutWeek ?? 999) - (b.stockoutWeek ?? 999))
  // Sort warning by weeks of cover (lowest first)
  warningItems.sort((a, b) => a.weeksOfCover - b.weeksOfCover)

  const weekStartDate = getWeekStartDate(currentWeek)
  const d = new Date(weekStartDate)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const reportWeekLabel = `Week ${currentWeek} (${monthNames[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()})`

  return {
    generatedAt: new Date().toISOString(),
    currentWeek,
    reportWeekLabel,
    totalSkus: projections.length,
    criticalCount: criticalItems.length,
    warningCount: warningItems.length,
    okCount: okItems.length,
    criticalItems,
    warningItems,
    okItems,
    totalPendingOrders,
    totalOrderValue: Math.round(totalOrderValue),
    unmitigatedRiskCount,
    aiSummary: aiSummary ?? null,
    aiActionItems: aiActionItems ?? null,
    aiMeetingAgenda: aiMeetingAgenda ?? null,
  }
}

// ─── Single SKU Risk Assessment ─────────────────────────────────────────────

function buildRiskItem(
  proj: SKUProjection,
  suggestion: ReplenishmentSuggestion | undefined,
  currentWeek: number
): RiskItem {
  const avgWk = proj.avgWeeklyDemand

  // Weeks of cover (on-hand only)
  const weeksOfCover = avgWk > 0 ? proj.currentInventory / avgWk : 999
  // Days of supply
  const daysOfSupply = avgWk > 0 ? Math.round(proj.currentInventory / (avgWk / 7)) : 9999

  // Determine risk type
  let riskType: RiskType = 'LOW_COVER'
  if (proj.stockoutWeek !== null) {
    riskType = 'STOCKOUT'
  } else if (proj.weeks.some(w => w.projectedInventory < proj.safetyStock)) {
    riskType = 'BELOW_SAFETY'
  } else if (proj.weeks.some(w => w.projectedInventory < proj.reorderPoint)) {
    riskType = 'BELOW_REORDER'
  } else if (weeksOfCover < 4) {
    riskType = 'LOW_COVER'
  }

  // Stockout date formatting
  let stockoutDate: string | null = null
  let weeksUntilStockout: number | null = null
  if (proj.stockoutWeek !== null) {
    const soDate = getWeekStartDate(proj.stockoutWeek)
    const d = new Date(soDate)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    stockoutDate = `Week ${proj.stockoutWeek} (${monthNames[d.getUTCMonth()]} ${d.getUTCDate()})`
    weeksUntilStockout = proj.stockoutWeek - currentWeek
  }

  // Mitigation status
  const hasPendingOrder = !!suggestion
  let mitigationStatus: RiskItem['mitigationStatus'] = 'NONE'
  let orderQty: number | null = null
  let orderArrivalWeek: number | null = null
  let orderArrivalDate: string | null = null
  let estimatedCost: number | null = null

  if (suggestion) {
    orderQty = suggestion.suggestedOrderQty
    orderArrivalWeek = suggestion.expectedArrivalWeek
    estimatedCost = suggestion.estimatedCost

    const arrDate = getWeekStartDate(suggestion.expectedArrivalWeek)
    const ad = new Date(arrDate)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    orderArrivalDate = `W${suggestion.expectedArrivalWeek} (${monthNames[ad.getUTCMonth()]} ${ad.getUTCDate()})`

    // Check if order covers the gap
    const projAtArrival = suggestion.projectedAtArrival
    const afterOrder = projAtArrival + suggestion.suggestedOrderQty
    if (afterOrder > proj.safetyStock) {
      mitigationStatus = 'COVERED'
    } else if (afterOrder > 0) {
      mitigationStatus = 'PARTIAL'
    } else {
      mitigationStatus = 'NONE'
    }
  }

  // Customer impact note
  let customerImpactNote = 'No impact — sufficient buffer'
  if (proj.urgency === 'CRITICAL') {
    if (proj.stockoutWeek !== null) {
      const model = proj.partModel?.split('/')[1]?.trim() || proj.skuCode
      customerImpactNote = `May affect ${model} production after ${stockoutDate}`
    } else {
      customerImpactNote = 'Below safety stock — risk of supply disruption'
    }
  } else if (proj.urgency === 'WARNING') {
    customerImpactNote = `Inventory below reorder point — monitoring (${Math.round(weeksOfCover * 10) / 10} wks cover)`
  }

  // Action note
  let actionNote = 'No action needed'
  if (suggestion) {
    actionNote = `Order ${suggestion.suggestedOrderQty} units placed, arriving ${orderArrivalDate}`
    if (estimatedCost) {
      actionNote += ` (~$${estimatedCost.toLocaleString()})`
    }
  } else if (proj.urgency !== 'OK') {
    actionNote = 'No order placed — needs review'
  }

  return {
    skuCode: proj.skuCode,
    partModel: proj.partModel,
    supplierCode: proj.supplierCode,
    matrixCell: proj.matrixCell,
    riskLevel: proj.urgency,
    riskType,
    currentInventory: proj.currentInventory,
    totalInTransit: proj.totalInTransit,
    inventoryPosition: proj.inventoryPosition,
    daysOfSupply,
    weeksOfCover: Math.round(weeksOfCover * 10) / 10,
    demandSource: proj.demandSource,
    avgWeeklyDemand: proj.avgWeeklyDemand,
    stockoutWeek: proj.stockoutWeek,
    stockoutDate,
    weeksUntilStockout,
    hasPendingOrder,
    orderQty,
    orderArrivalWeek,
    orderArrivalDate,
    estimatedCost,
    mitigationStatus,
    customerImpactNote,
    actionNote,
    weekProjections: proj.weeks,
    safetyStock: proj.safetyStock,
    reorderPoint: proj.reorderPoint,
    targetInventory: proj.targetInventory,
    leadTimeWeeks: proj.leadTimeWeeks,
  }
}

// ─── Meeting-Ready Text (for copy-to-clipboard) ────────────────────────────

export function generateMeetingText(report: RiskReport): string {
  const lines: string[] = []

  lines.push(`WHI Pipeline Risk Report - ${report.reportWeekLabel}`)
  lines.push(`${'='.repeat(50)}`)
  lines.push('')

  if (report.criticalCount > 0) {
    lines.push(`CRITICAL (${report.criticalCount}):`)
    for (const item of report.criticalItems) {
      const model = item.partModel?.split('/')[1]?.trim() || item.skuCode
      lines.push(`- ${item.skuCode} ${model}: ${item.stockoutDate ? `Stockout ${item.stockoutDate}` : 'Below safety stock'}. ${item.actionNote}`)
    }
    lines.push('')
  }

  if (report.warningCount > 0) {
    lines.push(`WARNING (${report.warningCount}):`)
    for (const item of report.warningItems) {
      const model = item.partModel?.split('/')[1]?.trim() || item.skuCode
      lines.push(`- ${item.skuCode} ${model}: Below ROP. ${item.weeksOfCover} wks cover on-hand. ${item.actionNote}`)
    }
    lines.push('')
  }

  if (report.criticalCount === 0 && report.warningCount === 0) {
    lines.push('STATUS: All SKUs healthy - no risk items this week.')
    lines.push('')
  }

  lines.push('Action Items:')
  if (report.criticalItems.some(i => i.hasPendingOrder)) {
    for (const item of report.criticalItems.filter(i => i.hasPendingOrder)) {
      lines.push(`- Confirm ${item.supplierCode} shipment arrival ${item.orderArrivalDate}`)
    }
  }
  if (report.unmitigatedRiskCount > 0) {
    lines.push(`- Review ${report.unmitigatedRiskCount} unmitigated risk SKU(s)`)
  }
  for (const item of report.criticalItems) {
    lines.push(`- Review ${item.skuCode} demand trend with Genie`)
  }
  if (report.criticalCount === 0 && report.warningCount === 0) {
    lines.push('- None — all items on track')
  }

  lines.push('')
  lines.push(`OK SKUs: ${report.okCount} | Total monitored: ${report.totalSkus}`)
  const forecastCount = [...report.criticalItems, ...report.warningItems, ...report.okItems]
    .filter(i => i.demandSource === 'forecast').length
  if (forecastCount > 0) {
    lines.push(`Demand source: ${forecastCount} SKUs using Genie forecast, ${report.totalSkus - forecastCount} using historical average`)
  }

  return lines.join('\n')
}

// ─── Email HTML Generator ──────────────────────────────────────────────────

export function generateEmailSubject(report: RiskReport): string {
  const parts = []
  if (report.criticalCount > 0) parts.push(`${report.criticalCount} Critical`)
  if (report.warningCount > 0) parts.push(`${report.warningCount} Warning`)
  if (parts.length === 0) parts.push('All Clear')
  return `[WHI Pipeline] ${report.reportWeekLabel} Risk Report — ${parts.join(', ')}`
}

export function generateEmailHtml(report: RiskReport): string {
  const riskColor = report.criticalCount > 0 ? '#dc2626' : report.warningCount > 0 ? '#d97706' : '#059669'
  const riskBg = report.criticalCount > 0 ? '#fef2f2' : report.warningCount > 0 ? '#fffbeb' : '#ecfdf5'
  const riskText = report.criticalCount > 0
    ? `${report.criticalCount} CRITICAL, ${report.warningCount} WARNING`
    : report.warningCount > 0
      ? `${report.warningCount} WARNING`
      : 'All Clear'

  const forecastCount = [...report.criticalItems, ...report.warningItems, ...report.okItems]
    .filter(i => i.demandSource === 'forecast').length

  let html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;background:#fff;">
  <!-- Header -->
  <tr><td style="background:#1e293b;color:#fff;padding:24px 32px;">
    <div style="font-size:20px;font-weight:700;">WHI Pipeline Dashboard</div>
    <div style="font-size:14px;color:#94a3b8;margin-top:4px;">${report.reportWeekLabel} Risk Report</div>
  </td></tr>

  <!-- Risk Banner -->
  <tr><td style="background:${riskBg};padding:20px 32px;border-bottom:3px solid ${riskColor};">
    <div style="font-size:24px;font-weight:700;color:${riskColor};">${riskText}</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px;">${report.totalSkus} SKUs monitored`
  if (forecastCount > 0) {
    html += ` &bull; ${forecastCount} using Genie forecast`
  }
  html += `</div>
  </td></tr>`

  // AI Summary
  if (report.aiSummary) {
    html += `
  <tr><td style="padding:20px 32px;border-bottom:1px solid #e2e8f0;">
    <div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:8px;">Executive Summary</div>
    <div style="font-size:13px;color:#475569;line-height:1.6;">${report.aiSummary}</div>
  </td></tr>`
  }

  // Critical Items
  if (report.criticalItems.length > 0) {
    html += `
  <tr><td style="padding:20px 32px 8px;">
    <div style="font-size:14px;font-weight:700;color:#dc2626;">Critical (${report.criticalCount})</div>
  </td></tr>`
    for (const item of report.criticalItems) {
      const model = item.partModel?.split('/')[1]?.trim() || ''
      html += `
  <tr><td style="padding:4px 32px;">
    <table width="100%" style="border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:4px;margin-bottom:8px;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:12px 16px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;">${item.skuCode} ${model} <span style="color:#64748b;font-weight:400;">${item.supplierCode || ''}</span></div>
        <div style="font-size:12px;color:#dc2626;margin-top:4px;">${item.stockoutDate ? `Stockout ${item.stockoutDate}` : 'Below safety stock'}</div>
        <div style="font-size:12px;color:#475569;margin-top:4px;">On-Hand: ${Math.round(item.currentInventory)} &bull; In-Transit: ${Math.round(item.totalInTransit)} &bull; ${item.weeksOfCover} wks cover</div>
        <div style="font-size:12px;margin-top:4px;color:${item.hasPendingOrder ? '#059669' : '#dc2626'};font-weight:600;">${item.actionNote}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${item.customerImpactNote}</div>
      </td></tr>
    </table>
  </td></tr>`
    }
  }

  // Warning Items
  if (report.warningItems.length > 0) {
    html += `
  <tr><td style="padding:20px 32px 8px;">
    <div style="font-size:14px;font-weight:700;color:#d97706;">Warning (${report.warningCount})</div>
  </td></tr>`
    for (const item of report.warningItems) {
      const model = item.partModel?.split('/')[1]?.trim() || ''
      html += `
  <tr><td style="padding:4px 32px;">
    <table width="100%" style="border:1px solid #fde68a;border-left:4px solid #d97706;border-radius:4px;margin-bottom:8px;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:12px 16px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;">${item.skuCode} ${model} <span style="color:#64748b;font-weight:400;">${item.supplierCode || ''}</span></div>
        <div style="font-size:12px;color:#475569;margin-top:4px;">On-Hand: ${Math.round(item.currentInventory)} &bull; In-Transit: ${Math.round(item.totalInTransit)} &bull; ${item.weeksOfCover} wks cover</div>
        <div style="font-size:12px;margin-top:4px;color:${item.hasPendingOrder ? '#059669' : '#d97706'};font-weight:600;">${item.actionNote}</div>
      </td></tr>
    </table>
  </td></tr>`
    }
  }

  // AI Action Items
  if (report.aiActionItems) {
    html += `
  <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;">
    <div style="font-size:14px;font-weight:600;color:#334155;margin-bottom:8px;">Action Items</div>
    <div style="font-size:13px;color:#475569;line-height:1.6;">${report.aiActionItems}</div>
  </td></tr>`
  }

  // OK summary
  if (report.okCount > 0) {
    html += `
  <tr><td style="padding:20px 32px;border-top:1px solid #e2e8f0;">
    <div style="font-size:14px;font-weight:600;color:#059669;margin-bottom:8px;">OK (${report.okCount} SKUs)</div>
    <table width="100%" style="font-size:12px;border-collapse:collapse;">
      <tr style="background:#f8fafc;">
        <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0;">SKU</th>
        <th style="padding:6px 8px;text-align:left;border-bottom:1px solid #e2e8f0;">Supplier</th>
        <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e2e8f0;">On-Hand</th>
        <th style="padding:6px 8px;text-align:right;border-bottom:1px solid #e2e8f0;">Wks Cover</th>
      </tr>`
    for (const item of report.okItems.slice(0, 20)) {
      html += `
      <tr>
        <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;font-family:monospace;">${item.skuCode}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f1f5f9;">${item.supplierCode || '-'}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f1f5f9;">${Math.round(item.currentInventory)}</td>
        <td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f1f5f9;">${item.weeksOfCover}</td>
      </tr>`
    }
    html += `</table>
  </td></tr>`
  }

  // Footer
  html += `
  <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
    <div style="font-size:11px;color:#94a3b8;">Generated by WHI Pipeline Dashboard &bull; ${new Date().toISOString().split('T')[0]}</div>
    <div style="font-size:11px;color:#94a3b8;margin-top:2px;">This is an automated report. Reply to discuss risk items.</div>
  </td></tr>
</table>
</body></html>`

  return html
}
