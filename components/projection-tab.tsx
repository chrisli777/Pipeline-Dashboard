'use client'

import { useState, useMemo, Fragment } from 'react'
import { AlertTriangle, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SKUProjection, ProjectionSummary } from '@/lib/types'
import { ProjectionSparkline } from './projection-sparkline'
import { ProjectionDetailChart } from './projection-detail-chart'

const URGENCY_STYLES = {
  CRITICAL: { bg: 'bg-red-100 text-red-800', icon: AlertCircle, label: 'Critical' },
  WARNING: { bg: 'bg-amber-100 text-amber-800', icon: AlertTriangle, label: 'Warning' },
  OK: { bg: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2, label: 'OK' },
}

interface ProjectionTabProps {
  projections: SKUProjection[]
  summary: ProjectionSummary
  currentWeek: number
}

export function ProjectionTab({ projections, summary, currentWeek }: ProjectionTabProps) {
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | 'CRITICAL' | 'WARNING'>('all')
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [sortField, setSortField] = useState<'urgency' | 'annual_value' | 'sku_code'>('urgency')

  const suppliers = useMemo(() =>
    [...new Set(projections.map(p => p.supplierCode).filter(Boolean))].sort() as string[],
    [projections]
  )

  const filtered = useMemo(() => {
    let data = projections

    if (selectedSupplier !== 'all') {
      data = data.filter(p => p.supplierCode === selectedSupplier)
    }
    if (urgencyFilter !== 'all') {
      data = data.filter(p => p.urgency === urgencyFilter)
    }

    return [...data].sort((a, b) => {
      if (sortField === 'urgency') {
        const ord = { CRITICAL: 0, WARNING: 1, OK: 2 }
        const diff = ord[a.urgency] - ord[b.urgency]
        if (diff !== 0) return diff
        return (b.unitCost || 0) * b.avgWeeklyDemand - (a.unitCost || 0) * a.avgWeeklyDemand
      }
      if (sortField === 'sku_code') return a.skuCode.localeCompare(b.skuCode)
      return 0
    })
  }, [projections, selectedSupplier, urgencyFilter, sortField])

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span className="text-sm font-medium text-red-800">Critical</span>
          </div>
          <div className="text-2xl font-bold text-red-900 mt-1">{summary.criticalCount}</div>
          <div className="text-xs text-red-600">Stockout within lead time</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">Warning</span>
          </div>
          <div className="text-2xl font-bold text-amber-900 mt-1">{summary.warningCount}</div>
          <div className="text-xs text-amber-600">Below reorder point</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-800">OK</span>
          </div>
          <div className="text-2xl font-bold text-emerald-900 mt-1">{summary.okCount}</div>
          <div className="text-xs text-emerald-600">Adequate stock levels</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedSupplier}
          onChange={e => setSelectedSupplier(e.target.value)}
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
          <option value="all">All Status</option>
          <option value="CRITICAL">Critical Only</option>
          <option value="WARNING">Warning Only</option>
        </select>

        <span className="text-xs text-slate-500 ml-auto">
          Week {currentWeek} &bull; {filtered.length} SKUs shown
        </span>
      </div>

      {/* Projection Table */}
      <div className="bg-white rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="w-8 px-2 py-2"></th>
              <th className="px-3 py-2 text-left">SKU</th>
              <th className="px-3 py-2 text-left">Supplier</th>
              <th className="px-2 py-2 text-center">Class</th>
              <th className="px-3 py-2 text-right">On-Hand</th>
              <th className="px-3 py-2 text-right">In-Transit</th>
              <th className="px-3 py-2 text-right">Inv. Position</th>
              <th className="px-3 py-2 text-right">Avg/Wk</th>
              <th className="px-3 py-2 text-right">SS</th>
              <th className="px-3 py-2 text-right">ROP</th>
              <th className="px-3 py-2 text-center" style={{ width: 280 }}>20-Week Projection</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(proj => {
              const isExpanded = expandedSku === proj.skuCode
              const urgStyle = URGENCY_STYLES[proj.urgency]
              const UrgIcon = urgStyle.icon

              return (
                <Fragment key={proj.skuCode}>
                  <tr
                    className={cn(
                      'border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors',
                      isExpanded && 'bg-slate-50'
                    )}
                    onClick={() => setExpandedSku(isExpanded ? null : proj.skuCode)}
                  >
                    <td className="px-2 py-2 text-slate-400">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium">{proj.skuCode}</td>
                    <td className="px-3 py-2 text-xs">{proj.supplierCode || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <span className="text-[10px] font-semibold text-slate-600">{proj.matrixCell}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {proj.currentInventory > 0 ? Math.round(proj.currentInventory).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-blue-600">
                      {proj.totalInTransit > 0 ? Math.round(proj.totalInTransit).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                      {proj.inventoryPosition > 0 ? Math.round(proj.inventoryPosition).toLocaleString() : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{proj.avgWeeklyDemand.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{Math.round(proj.safetyStock).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{proj.reorderPoint.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      <ProjectionSparkline weeks={proj.weeks} safetyStock={proj.safetyStock} />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold', urgStyle.bg)}>
                        <UrgIcon className="h-3 w-3" />
                        {urgStyle.label}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={12} className="px-4 py-4 bg-slate-50 border-b border-slate-200">
                        <ProjectionDetailChart projection={proj} currentWeek={currentWeek} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-slate-400">
                  No SKUs match the current filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
