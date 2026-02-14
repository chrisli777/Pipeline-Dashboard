'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Package, TrendingUp, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ClassificationMatrix } from '@/components/classification-matrix'
import { ClassificationTable } from '@/components/classification-table'
import type { SKUClassification, ClassificationPolicy, ClassificationSummary } from '@/lib/types'

export default function ReplenishmentPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [skus, setSkus] = useState<SKUClassification[]>([])
  const [policies, setPolicies] = useState<ClassificationPolicy[]>([])
  const [summary, setSummary] = useState<ClassificationSummary | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/replenishment/classification')
      if (!res.ok) throw new Error('Failed to fetch classification data')
      const data = await res.json()
      setSkus(data.skus || [])
      setPolicies(data.policies || [])
      setSummary(data.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleCellClick = (cell: string) => {
    setSelectedCell(prev => prev === cell ? null : cell)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <span className="ml-3 text-slate-500">Loading classification data...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-medium">Error loading data</h3>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <p className="text-red-500 text-xs mt-2">
            Make sure migration 014 has been executed on Supabase.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Replenishment Engine
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ABC/XYZ Classification &bull; Netstock Methodology
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            icon={<Package className="h-5 w-5 text-indigo-600" />}
            label="Total SKUs"
            value={summary.totalSkus.toString()}
            detail={`A:${summary.abcCounts.A} B:${summary.abcCounts.B} C:${summary.abcCounts.C}`}
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
            label="Annual Value"
            value={`$${(summary.totalAnnualValue / 1000000).toFixed(1)}M`}
            detail={`${summary.abcCounts.A} SKUs = 80% value`}
          />
          <SummaryCard
            icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
            label="Demand Stability"
            value={`X:${summary.xyzCounts.X} Y:${summary.xyzCounts.Y} Z:${summary.xyzCounts.Z}`}
            detail="CV < 0.5 / 0.5-1.0 / > 1.0"
          />
          <SummaryCard
            icon={<Package className="h-5 w-5 text-amber-600" />}
            label="Suppliers"
            value={summary.suppliers.length.toString()}
            detail={summary.suppliers.join(', ')}
          />
        </div>
      )}

      {/* Supplier Filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-slate-700">Filter by Supplier:</label>
        <select
          value={selectedSupplier}
          onChange={(e) => {
            setSelectedSupplier(e.target.value)
            setSelectedCell(null)
          }}
          className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Suppliers</option>
          {summary?.suppliers.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {selectedCell && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedCell(null)}
            className="text-xs"
          >
            Clear cell filter: {selectedCell}
          </Button>
        )}
      </div>

      {/* 9-Grid Matrix */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          ABC/XYZ Classification Matrix
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Click a cell to filter the table below. ABC = Annual Consumption Value (Pareto 80/96/100%). XYZ = Demand Variability (CV).
        </p>
        {summary && (
          <ClassificationMatrix
            skus={skus}
            policies={policies}
            summary={summary}
            selectedSupplier={selectedSupplier}
            onCellClick={handleCellClick}
            selectedCell={selectedCell}
          />
        )}
      </div>

      {/* SKU Detail Table */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <ClassificationTable
          skus={skus}
          selectedSupplier={selectedSupplier}
          selectedCell={selectedCell}
        />
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-0.5">{detail}</div>
    </div>
  )
}
