'use client'

import { useState, useMemo } from 'react'
import { AlertCircle, AlertTriangle, ShoppingCart, DollarSign, Truck, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReplenishmentSuggestion, ProjectionSummary } from '@/lib/types'

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
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'CRITICAL' | 'WARNING'>('all')

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

  const filteredTotal = filtered.reduce((sum, s) => sum + (s.estimatedCost || 0), 0)

  const fmt = (n: number) => '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 })

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
            <Truck className="h-5 w-5 text-blue-600" />
            <span className="text-xs font-medium text-slate-500 uppercase">Suppliers</span>
          </div>
          <div className="text-2xl font-bold">{Object.keys(summary.bySupplier).length}</div>
          <div className="text-xs text-slate-500">
            {Object.entries(summary.bySupplier)
              .filter(([, v]) => v.suggestedValue > 0)
              .sort(([, a], [, b]) => b.suggestedValue - a.suggestedValue)
              .map(([k]) => k)
              .join(', ')}
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

      {/* Supplier Breakdown */}
      {Object.entries(summary.bySupplier)
        .filter(([, v]) => v.suggestedValue > 0)
        .sort(([, a], [, b]) => b.suggestedValue - a.suggestedValue)
        .length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">By Supplier</h3>
          <div className="flex gap-3 flex-wrap">
            {Object.entries(summary.bySupplier)
              .filter(([, v]) => v.suggestedValue > 0)
              .sort(([, a], [, b]) => b.suggestedValue - a.suggestedValue)
              .map(([supplier, data]) => (
                <div key={supplier} className="bg-slate-50 rounded-lg px-3 py-2 text-xs">
                  <div className="font-semibold text-slate-700">{supplier}</div>
                  <div className="text-slate-500">{fmt(data.suggestedValue)} &bull; {data.criticalCount} critical</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={supplierFilter}
          onChange={e => setSupplierFilter(e.target.value)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Suppliers</option>
          {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={urgencyFilter}
          onChange={e => setUrgencyFilter(e.target.value as typeof urgencyFilter)}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          <option value="all">All Urgency</option>
          <option value="CRITICAL">Critical Only</option>
          <option value="WARNING">Warning Only</option>
        </select>
        <span className="text-xs text-slate-500 ml-auto">
          {filtered.length} orders &bull; {fmt(filteredTotal)}
        </span>
      </div>

      {/* Suggestions Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-3 py-2 text-left">Urgency</th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Supplier</th>
              <th className="px-3 py-2 text-right">Order Qty</th>
              <th className="px-3 py-2 text-center">MOQ</th>
              <th className="px-3 py-2 text-center">Order Date</th>
              <th className="px-3 py-2 text-center">Arrival</th>
              <th className="px-3 py-2 text-right">Current Inv.</th>
              <th className="px-3 py-2 text-right">@ Arrival</th>
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
                  <td className="px-3 py-2 text-center text-xs text-slate-500">{sug.moq > 1 ? sug.moq : '-'}</td>
                  <td className="px-3 py-2 text-center text-xs">{sug.orderDate}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    <div>W{sug.expectedArrivalWeek}</div>
                    <div className="text-[10px] text-slate-400">{sug.expectedArrivalDate}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {Math.round(sug.currentInventory).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    <span className={sug.projectedAtArrival < 0 ? 'text-red-600 font-semibold' : ''}>
                      {sug.projectedAtArrival.toLocaleString()}
                    </span>
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
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">
                  {suggestions.length === 0
                    ? 'No replenishment suggestions — all SKUs have adequate stock levels'
                    : 'No suggestions match the current filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
