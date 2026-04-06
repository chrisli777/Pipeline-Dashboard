'use client'

import { useState, useMemo, useEffect } from 'react'
import { AlertCircle, AlertTriangle, ShoppingCart, DollarSign, Truck, Eye, Package, ChevronDown, ChevronRight, Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { ReplenishmentSuggestion, ProjectionSummary, ConsolidatedPO, SKUProjection } from '@/lib/types'

const URGENCY_STYLES = {
  CRITICAL: { bg: 'bg-red-100 text-red-800 border-red-200', dot: 'bg-red-500' },
  WARNING: { bg: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  OK: { bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' },
}

interface SuggestionsTabProps {
  suggestions: ReplenishmentSuggestion[]
  projections: SKUProjection[]
  summary: ProjectionSummary
  currentWeek: number
}

export function SuggestionsTab({ suggestions, projections, summary, currentWeek }: SuggestionsTabProps) {
  const [viewMode, setViewMode] = useState<'consolidated' | 'detail'>('consolidated')
  const [supplierFilter, setSupplierFilter] = useState('HX')  // Default to HX
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'CRITICAL' | 'WARNING' | 'OK'>('all')
  const [expandedPO, setExpandedPO] = useState<string | null>(null)
  
  // AI Suggestion state
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  
  const fetchAiSuggestion = async () => {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/replenishment/ai-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projections, suggestions, currentWeek }),
      })
      if (!res.ok) throw new Error('Failed to get AI suggestion')
      const data = await res.json()
      setAiSuggestion(data.suggestion)
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setAiLoading(false)
    }
  }
  
  // Fetch AI suggestion on mount
  useEffect(() => {
    if (projections.length > 0) {
      fetchAiSuggestion()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const fmtTransit = (schedule: Array<{ weekNumber: number; qty: number }>) => {
    if (!schedule || schedule.length === 0) return '-'
    const total = schedule.reduce((s, e) => s + e.qty, 0)
    const detail = schedule.map(e => `W${e.weekNumber}:${Math.round(e.qty)}`).join(', ')
    return `${Math.round(total)} (${detail})`
  }

  return (
    <div className="space-y-4">
      {/* AI Suggestion Panel */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h3 className="font-semibold text-indigo-900">AI Replenishment Advisor</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchAiSuggestion}
            disabled={aiLoading}
            className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100"
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
        
        {aiLoading ? (
          <div className="flex items-center gap-2 text-indigo-600 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Analyzing inventory data...</span>
          </div>
        ) : aiError ? (
          <div className="text-red-600 text-sm py-2">
            {aiError}
            <Button variant="link" size="sm" onClick={fetchAiSuggestion} className="ml-2 text-red-600">
              Retry
            </Button>
          </div>
        ) : aiSuggestion ? (
          <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {aiSuggestion}
          </div>
        ) : (
          <div className="text-sm text-slate-500 py-2">
            Click refresh to get AI-powered replenishment recommendations.
          </div>
        )}
      </div>

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

        <span className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 border border-blue-200 rounded-md font-medium">
          HX
        </span>
        {viewMode === 'detail' && (
          <select
            value={urgencyFilter}
            onChange={e => setUrgencyFilter(e.target.value as typeof urgencyFilter)}
            className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">All Status</option>
            <option value="CRITICAL">Critical Only</option>
            <option value="WARNING">Warning Only</option>
            <option value="OK">OK Only</option>
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
                <th className="px-3 py-2 text-left">ETD Suggestion</th>
                <th className="px-3 py-2 text-right">Total Qty</th>
                <th className="px-3 py-2 text-right">On-Hand</th>
                <th className="px-3 py-2 text-right">Days of Supply</th>
                <th className="px-3 py-2 text-center">Stockout</th>
                <th className="px-3 py-2 text-right">Cover</th>
                <th className="px-3 py-2 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(sug => {
                const urgStyle = URGENCY_STYLES[sug.urgency]

                return (
                  <tr key={sug.skuCode} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold border', urgStyle.bg)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', urgStyle.dot)}></span>
                        {sug.urgency}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{sug.skuCode}</td>
                    <td className="px-3 py-2 text-xs">{sug.supplierCode || '-'}</td>
                    <td className="px-3 py-2 text-xs">
                      {sug.suggestedETDWeeks && sug.suggestedETDWeeks.length > 0 ? (
                        <div className="space-y-0.5">
                          {sug.suggestedETDWeeks.map((etd, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                                W{etd.week}
                              </span>
                              <span className="font-mono">{etd.qty} units</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-emerald-600 text-[10px] font-medium">No action needed</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-semibold">
                      {sug.suggestedOrderQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {Math.round(sug.currentInventory).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">
                      <span className={sug.daysOfSupply < 30 ? 'text-red-600 font-semibold' : ''}>
                        {sug.daysOfSupply} days
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
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-400">
                    No SKUs match the current filters
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
