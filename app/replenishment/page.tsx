'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Package, TrendingUp, Loader2, RefreshCw, AlertTriangle, ShoppingCart, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ClassificationMatrix } from '@/components/classification-matrix'
import { ClassificationTable } from '@/components/classification-table'
import { ProjectionTab } from '@/components/projection-tab'
import { SuggestionsTab } from '@/components/suggestions-tab'
import { RiskAnalysisTab } from '@/components/risk-analysis-tab'
import type {
  SKUClassification,
  ClassificationPolicy,
  ClassificationSummary,
  SKUProjection,
  ReplenishmentSuggestion,
  ProjectionSummary,
} from '@/lib/types'

export default function ReplenishmentPage() {
  const [activeTab, setActiveTab] = useState('projection')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Classification data
  const [skus, setSkus] = useState<SKUClassification[]>([])
  const [policies, setPolicies] = useState<ClassificationPolicy[]>([])
  const [clsSummary, setClsSummary] = useState<ClassificationSummary | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  // Projection data
  const [projLoading, setProjLoading] = useState(false)
  const [projections, setProjections] = useState<SKUProjection[]>([])
  const [suggestions, setSuggestions] = useState<ReplenishmentSuggestion[]>([])
  const [projSummary, setProjSummary] = useState<ProjectionSummary | null>(null)
  const [currentWeek, setCurrentWeek] = useState(0)

  const fetchClassification = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/replenishment/classification')
      if (!res.ok) throw new Error('Failed to fetch classification data')
      const data = await res.json()
      setSkus(data.skus || [])
      setPolicies(data.policies || [])
      setClsSummary(data.summary || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjection = async () => {
    setProjLoading(true)
    try {
      const res = await fetch('/api/replenishment/projection')
      if (!res.ok) throw new Error('Failed to fetch projection data')
      const data = await res.json()
      setProjections(data.projections || [])
      setSuggestions(data.suggestions || [])
      setProjSummary(data.summary || null)
      setCurrentWeek(data.currentWeek || 0)
    } catch (err) {
      console.error('Projection fetch error:', err)
    } finally {
      setProjLoading(false)
    }
  }

  useEffect(() => {
    fetchClassification()
    fetchProjection()
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
            Make sure migrations 014 and 015 have been executed on Supabase.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchClassification}>
            <RefreshCw className="h-4 w-4 mr-1" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Replenishment Engine
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {'ABC/XYZ Classification \u2022 Inventory Projection \u2022 Risk Analysis \u2022 Suggestions'}
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="classification" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Classification
          </TabsTrigger>
          <TabsTrigger value="projection" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Projection
            {projSummary && projSummary.criticalCount > 0 && (
              <span className="ml-1 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {projSummary.criticalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="risk" className="gap-1.5">
            <Shield className="h-4 w-4" />
            Risk Analysis
            {projSummary && (projSummary.criticalCount + projSummary.warningCount) > 0 && (
              <span className={`ml-1 text-white text-[10px] px-1.5 py-0.5 rounded-full ${projSummary.criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
                {projSummary.criticalCount + projSummary.warningCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-1.5">
            <ShoppingCart className="h-4 w-4" />
            Suggestions
            {projSummary && projSummary.totalSuggestedOrders > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {projSummary.totalSuggestedOrders}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Classification */}
        <TabsContent value="classification" className="space-y-6">
          {/* Summary Cards */}
          {clsSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <SummaryCard
                icon={<Package className="h-5 w-5 text-indigo-600" />}
                label="Total SKUs"
                value={clsSummary.totalSkus.toString()}
                detail={`A:${clsSummary.abcCounts.A} B:${clsSummary.abcCounts.B} C:${clsSummary.abcCounts.C}`}
              />
              <SummaryCard
                icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
                label="Annual Value"
                value={`$${(clsSummary.totalAnnualValue / 1000000).toFixed(1)}M`}
                detail={`${clsSummary.abcCounts.A} SKUs = 80% value`}
              />
              <SummaryCard
                icon={<BarChart3 className="h-5 w-5 text-blue-600" />}
                label="Demand Stability"
                value={`X:${clsSummary.xyzCounts.X} Y:${clsSummary.xyzCounts.Y} Z:${clsSummary.xyzCounts.Z}`}
                detail="CV < 0.5 / 0.5-1.0 / > 1.0"
              />
              <SummaryCard
                icon={<Package className="h-5 w-5 text-amber-600" />}
                label="Suppliers"
                value={clsSummary.suppliers.length.toString()}
                detail={clsSummary.suppliers.join(', ')}
              />
            </div>
          )}

          {/* Supplier Filter */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700">Filter by Supplier:</label>
            <select
              value={selectedSupplier}
              onChange={(e) => { setSelectedSupplier(e.target.value); setSelectedCell(null) }}
              className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Suppliers</option>
              {clsSummary?.suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {selectedCell && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedCell(null)} className="text-xs">
                Clear cell filter: {selectedCell}
              </Button>
            )}
          </div>

          {/* 9-Grid Matrix */}
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800 mb-3">ABC/XYZ Classification Matrix</h2>
            <p className="text-xs text-slate-500 mb-4">
              Click a cell to filter the table below. ABC = Annual Consumption Value. XYZ = Demand Variability.
            </p>
            {clsSummary && (
              <ClassificationMatrix
                skus={skus}
                policies={policies}
                summary={clsSummary}
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
        </TabsContent>

        {/* Tab 2: Projection */}
        <TabsContent value="projection">
          {projLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <span className="ml-3 text-slate-500">Computing projections...</span>
            </div>
          ) : projSummary ? (
            <ProjectionTab
              projections={projections}
              summary={projSummary}
              currentWeek={currentWeek}
            />
          ) : (
            <div className="text-center py-12 text-slate-400">
              No projection data available. Make sure migration 015 has been executed.
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Risk Analysis */}
        <TabsContent value="risk">
          {projLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <span className="ml-3 text-slate-500">Analyzing risk...</span>
            </div>
          ) : projSummary ? (
            <RiskAnalysisTab
              projections={projections}
              suggestions={suggestions}
              summary={projSummary}
              currentWeek={currentWeek}
            />
          ) : (
            <div className="text-center py-12 text-slate-400">
              No data available. Make sure migration 015 has been executed.
            </div>
          )}
        </TabsContent>

        {/* Tab 4: Suggestions */}
        <TabsContent value="suggestions">
          {projLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              <span className="ml-3 text-slate-500">Generating suggestions...</span>
            </div>
          ) : projSummary ? (
            <SuggestionsTab
              suggestions={suggestions}
              summary={projSummary}
              currentWeek={currentWeek}
            />
          ) : (
            <div className="text-center py-12 text-slate-400">
              No suggestion data available. Make sure migration 015 has been executed.
            </div>
          )}
        </TabsContent>
      </Tabs>
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
