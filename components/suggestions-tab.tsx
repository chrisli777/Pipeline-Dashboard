'use client'

import { useState, useMemo } from 'react'
import { AlertCircle, AlertTriangle, ShoppingCart, DollarSign, Truck, Eye, Package, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReplenishmentSuggestion, ProjectionSummary, ConsolidatedPO } from '@/lib/types'

const URGENCY_STYLES = {
  CRITICAL: { bg: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
  WARNING: { bg: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  OK: { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
}

interface SuggestionsTabProps {
  suggestions: ReplenishmentSuggestion[]
  summary: ProjectionSummary
  currentWeek: number
}

export function SuggestionsTab({ suggestions, summary, currentWeek }: SuggestionsTabProps) {
  const [viewMode, setViewMode] = useState<'consolidated' | 'detail'>('consolidated')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'CRITICAL' | 'WARNING'>('all')
  const [expandedPO, setExpandedPO] = useState<string | null>(null)

  const suppliers = useMemo(() =>
    [...new Set(suggestions.map(s => s.supplierCode).filter(Boolean))].sort() as string[],
    [suggestions]
  )

  const filtered = useMemo(() => {
    let data = suggestions
    if (supplierFilter !== 'all') data = data.filter(s => s.supplierCode === supplierFilter)
    if (urgencyFilter !== 'all') data = data.filter(s => s.urgency === urgencyFilter)
    return data
  }, [suggestions, supplierFilter, urgencyFilter])

  const filteredPOs = useMemo(() => {
    let pos = summary.consolidatedPOs || []
    if (supplierFilter !== 'all') pos = pos.filter(p => p.supplierCode === supplierFilter)
    return pos
  }, [summary.consolidatedPOs, supplierFilter])

  const filteredTotal = filtered.reduce((sum, s) => sum + (s.estimatedCost || 0), 0)
  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

  // Format in-transit schedule
  const fmtTransit = (schedule: Array<{ weekNumber: number; qty: number }>) => {
    if (!schedule || schedule.length === 0) return '-'
    const total = schedule.reduce((s, e) => s + e.qty, 0)
    const detail = schedule.map(e => `W${e.weekNumber}:${Math.round(e.qty)}`).join(', ')
    return `${Math.round(total)} (${detail})`
  }

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-5 w-5 text-indigo-600" />
            <span className="text-xs font-medium text-slate-500 uppercase">Suggested Orders</span>
          </div>
          <div className="text-2xl font-bold">{summary.totalSuggestedOrders}</div>
          <div className="text-xs text-slate-500">{summary.criticalCount} critical</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            <span className="text-xs font-medium text-slate-500 uppercase">Est. Total Cost</span>
          </div>
          <div className="text-2xl font-bold">{fmt(summary.totalSuggestedValue)}</div>
          <div className="text-xs text-slate-500">all suggested orders</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Package className="h-5 w-5 text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase">Consolidated POs</span>
          </div>
          <div className="text-2xl font-bold">{(summary.consolidatedPOs || []).length}</div>
          <div className="text-xs text-slate-500">
            {(summary.consolidatedPOs || []).map(p => p.supplierCode).join(', ')}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-5 w-5 text-amber-600" />
            <span className="text-xs font-medium text-slate-500 uppercase">Manual Review</span>
          </div>
          <div className="text-2xl font-bold">
            {suggestions.filter(s => s.replenishmentMethod !== 'auto').length}
          </div>
          <div className="text-xs text-slate-500">require human approval</div>
        </div>
      </div>

      {/* View Toggle + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('consolidated')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              viewMode === 'consolidated' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
            )}
          >
            Consolidated PO
          </button>
          <button
            onClick={() => setViewMode('detail')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-all',
              viewMode === 'detail' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'
            )}
          >
            Per-SKU Detail
          </button>
        </div>

        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {viewMode === 'detail' && (
          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value as typeof urgencyFilter)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">All Urgency</option>
            <option value="CRITICAL">Critical Only</option>
            <option value="WARNING">Warning Only</option>
          </select>
        )}
        <span className="text-xs text-slate-500 ml-auto">
          {viewMode === 'consolidated'
            ? `${filteredPOs.length} POs`
            : `${filtered.length} orders`
          } &bull; {fmt(filteredTotal)}
        </span>
      </div>

      {/* Consolidated PO View */}
      {viewMode === 'consolidated' && (
        <div className="space-y-3">
          {filteredPOs.map(po => {
            const isExpanded = expandedPO === po.supplierCode
            return (
              <div key={po.supplierCode} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                {/* PO Header */}
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
                  onClick={() => setExpandedPO(isExpanded ? null : po.supplierCode)}
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-slate-400" />
                      : <ChevronRight className="h-4 w-4 text-slate-400" />
                    }
                    <div>
                      <h3 className="font-semibold text-slate-800">{po.supplierCode} Consolidated PO</h3>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {po.skuCount} SKUs &bull; Arrival W{po.expectedArrivalWeek} ({po.expectedArrivalDate})
                        {po.criticalCount > 0 && (
                          <span className="ml-2 text-red-600 font-medium">{po.criticalCount} critical</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="font-bold text-slate-900">{fmt(po.totalCost)}</div>
                      <div className="text-xs text-slate-500">{po.totalQty.toLocaleString()} units</div>
                    </div>
                    {po.totalWeight != null && (
                      <div className="text-right">
                        <div className="font-medium text-slate-700">{po.totalWeight.toLocaleString()} lbs</div>
                        <div className="text-xs text-slate-500">
                          {po.estimatedContainers != null ? `~${po.estimatedContainers} ctr` : 'weight'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* PO Items Table (expanded) */}
                {isExpanded && (
                  <div className="border-t border-slate-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-2 text-left">SKU</th>
                          <th className="px-3 py-2 text-left">Part/Model</th>
                          <th className="px-2 py-2 text-center">Class</th>
                          <th className="px-3 py-2 text-center">Urgency</th>
                          <th className="px-3 py-2 text-right">Order Qty</th>
                          <th className="px-3 py-2 text-right">Est. Cost</th>
                          <th className="px-3 py-2 text-right">Cover</th>
                          <th className="px-3 py-2 text-center">Containers</th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.items.map(item => {
                          const urgStyle = URGENCY_STYLES[item.urgency]
                          return (
                            <tr key={item.skuCode} className="border-b border-slate-100">
                              <td className="px-4 py-2 font-mono font-medium">{item.skuCode}</td>
                              <td className="px-3 py-2 text-slate-600 truncate max-w-[200px]">{item.partModel || '-'}</td>
                              <td className="px-2 py-2 text-center font-semibold text-slate-600">{item.matrixCell}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={cn('px-2 py-0.5 rounded text-[10px] font-semibold border', urgStyle.bg)}>
                                  {item.urgency}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-semibold">{item.suggestedOrderQty.toLocaleString()}</td>
                              <td className="px-3 py-2 text-right font-mono">{item.estimatedCost != null ? fmt(item.estimatedCost) : '-'}</td>
                              <td className="px-3 py-2 text-right">{item.weeksOfCover} wks</td>
                              <td className="px-3 py-2 text-center text-slate-500">{item.containerHint || '-'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
          {filteredPOs.length === 0 && (
            <div className="text-center py-12 text-sm text-slate-400">
              {suggestions.length === 0
                ? 'No replenishment suggestions \u2014 all SKUs have adequate stock levels'
                : 'No POs match the current filters'}
            </div>
          )}
        </div>
      )}

      {/* Per-SKU Detail View */}
      {viewMode === 'detail' && (
        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-3 py-2 text-left">Urgency</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Supplier</th>
                <th className="px-3 py-2 text-right">Order Qty</th>
                <th className="px-3 py-2 text-center">Arrival</th>
                <th className="px-3 py-2 text-right">On-Hand</th>
                <th className="px-3 py-2 text-right">In-Transit</th>
                <th className="px-3 py-2 text-right">Inv. Pos.</th>
                <th className="px-3 py-2 text-right">Days of Supply</th>
                <th className="px-3 py-2 text-right">@ Arrival</th>
                <th className="px-3 py-2 text-center">Stockout</th>
                <th className="px-3 py-2 text-right">Cover</th>
                <th className="px-3 py-2 text-right">Est. Cost</th>
                <th className="px-3 py-2 text-center">Method</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sug => {
                const urgStyle = URGENCY_STYLES[sug.urgency]
                const isManual = sug.replenishmentMethod !== 'auto'

                return (
                  <tr key={sug.skuCode} className={cn('border-b border-slate-100 hover:bg-slate-50', isManual && 'bg-amber-50/30')}>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border', urgStyle.bg)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', urgStyle.dot)}></span>
                        {sug.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{sug.skuCode}</td>
                    <td className="px-3 py-2 text-xs">{sug.supplierCode || '-'}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {sug.suggestedOrderQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      <div>W{sug.expectedArrivalWeek}</div>
                      <div className="text-[10px] text-slate-400">{sug.expectedArrivalDate}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {Math.round(sug.currentInventory).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-blue-600">
                      {sug.totalInTransit > 0 ? Math.round(sug.totalInTransit).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {Math.round(sug.inventoryPosition).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={sug.daysOfSupply < 30 ? 'text-red-600 font-semibold' : ''}>
                        {sug.daysOfSupply} days
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      <span className={sug.projectedAtArrival < 0 ? 'text-red-600 font-semibold' : ''}>
                        {sug.projectedAtArrival.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {sug.stockoutWeek ? (
                        <span className="text-red-600 font-semibold">W{sug.stockoutWeek}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{sug.weeksOfCover} wks</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {sug.estimatedCost != null ? fmt(sug.estimatedCost) : '-'}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {isManual ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                          <Eye className="h-2.5 w-2.5" />
                          Review
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Auto</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-sm text-slate-400">
                    {suggestions.length === 0
                      ? 'No replenishment suggestions \u2014 all SKUs have adequate stock levels'
                      : 'No suggestions match the current filters'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
