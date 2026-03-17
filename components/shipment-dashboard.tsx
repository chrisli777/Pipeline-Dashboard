'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Ship, Truck, CalendarClock, AlertTriangle, CheckCircle2,
  DollarSign, RefreshCw, Search, ChevronDown, ChevronRight,
  Package, Globe, Anchor, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ShipmentStatusTimeline } from '@/components/shipment-status-timeline'

// Types
interface ShipmentContainer {
  id: string
  shipment_id: string
  container_number: string
  container_type: string
  sku: string
  sku_description: string | null
  po_number: string
  quantity: number
  unit_price: string
  total_amount: string
  gross_weight: string
}

interface ShipmentTracking {
  id: string
  shipment_id: string
  status: string
  shipped_date: string | null
  departed_date: string | null
  arrived_port_date: string | null
  cleared_date: string | null
  picked_up_date: string | null
  scheduled_date: string | null
  delivered_date: string | null
  closed_date: string | null
  duty_amount: string | null
  entry_number: string | null
  status_history: string | null
}

interface Shipment {
  id: string
  supplier: string
  invoice_number: string
  bol_number: string
  etd: string
  eta: string
  container_count: number
  sku_count: number
  total_value: string
  total_weight: string
  po_numbers: string[]
  status: string
  lfd: string | null
  lfd_extended: string | null
  cleared_date: string | null
  delivered_date: string | null
  duty_amount: string | null
  days_since_eta: number
  days_to_lfd: number | null
  lfd_status: string
  tracking: ShipmentTracking | null
  containers: ShipmentContainer[]
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'ARRIVED', label: 'Arrived at Port' },
  { key: 'CLEARED', label: 'Customs Cleared' },
  { key: 'PICKED_UP', label: 'Picked Up' },
  { key: 'DELIVERY_SCHEDULED', label: 'Delivery Scheduled' },
  { key: 'DELIVERED', label: 'Delivered' },
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(val: string | number | null): string {
  if (val === null || val === undefined) return '-'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

function formatWeight(val: string | number | null): string {
  if (val === null || val === undefined) return '-'
  const num = typeof val === 'string' ? parseFloat(val) : val
  if (isNaN(num)) return '-'
  return new Intl.NumberFormat('en-US').format(Math.round(num)) + ' lbs'
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'IN_TRANSIT': return 'bg-blue-100 text-blue-800'
    case 'ARRIVED': return 'bg-amber-100 text-amber-800'
    case 'CLEARED': return 'bg-emerald-100 text-emerald-800'
    case 'PICKED_UP': return 'bg-cyan-100 text-cyan-800'
    case 'DELIVERY_SCHEDULED': return 'bg-indigo-100 text-indigo-800'
    case 'DELIVERED': return 'bg-green-100 text-green-800'
    default: return 'bg-slate-100 text-slate-800'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'IN_TRANSIT': return 'In Transit'
    case 'ARRIVED': return 'Arrived at Port'
    case 'CLEARED': return 'Customs Cleared'
    case 'PICKED_UP': return 'Picked Up'
    case 'DELIVERY_SCHEDULED': return 'Delivery Scheduled'
    case 'DELIVERED': return 'Delivered'
    default: return status
  }
}

export function ShipmentDashboard() {
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async (retryCount = 0): Promise<void> => {
    if (retryCount === 0) {
      setLoading(true)
      setError(null)
    }
    try {
      const res = await fetch('/api/shipments')
      if (res.status >= 429 && retryCount < 5) {
        await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
        return fetchData(retryCount + 1)
      }
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setShipments(data.shipments || [])
      setLoading(false)
    } catch (err) {
      if (retryCount < 5) {
        await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
        return fetchData(retryCount + 1)
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch shipments')
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Summary stats
  const stats = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)

    const inTransit = shipments.filter(s => s.status === 'IN_TRANSIT')
    const arrived = shipments.filter(s => s.status === 'ARRIVED')
    const cleared = shipments.filter(s => s.status === 'CLEARED')
    const arrivingThisWeek = shipments.filter(s => {
      if (!s.eta) return false
      const eta = new Date(s.eta + 'T00:00:00')
      return eta >= weekStart && eta < weekEnd
    })
    const lfdCritical = shipments.filter(s =>
      s.lfd_status === 'critical' || s.lfd_status === 'warning'
    )
    const delivered = shipments.filter(s => s.status === 'DELIVERED' || s.delivered_date)
    const valueInTransit = inTransit.reduce((sum, s) => sum + parseFloat(s.total_value || '0'), 0)

    return {
      total: shipments.length,
      inTransit: inTransit.length,
      arrived: arrived.length,
      cleared: cleared.length,
      arrivingThisWeek: arrivingThisWeek.length,
      lfdCritical: lfdCritical.length,
      delivered: delivered.length,
      valueInTransit,
    }
  }, [shipments])

  // Status tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: shipments.length }
    for (const s of shipments) {
      counts[s.status] = (counts[s.status] || 0) + 1
    }
    return counts
  }, [shipments])

  // Filtered shipments
  const filtered = useMemo(() => {
    let list = shipments
    if (activeTab !== 'all') {
      list = list.filter(s => s.status === activeTab)
    }
    if (selectedSupplier !== 'all') {
      list = list.filter(s => s.supplier === selectedSupplier)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(s =>
        s.invoice_number?.toLowerCase().includes(q) ||
        s.bol_number?.toLowerCase().includes(q)
      )
    }
    return list
  }, [shipments, activeTab, selectedSupplier, searchQuery])

  // Unique suppliers
  const suppliers = useMemo(() => {
    return [...new Set(shipments.map(s => s.supplier).filter(Boolean))].sort()
  }, [shipments])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
<Loader2 className="h-12 w-12 animate-spin text-blue-700 mx-auto mb-4" />
<p className="text-muted-foreground">Loading shipments...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-3">
          <p className="text-red-500 font-medium">Error: {error}</p>
          <Button onClick={() => fetchData()} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shipment Tracking</h1>
        <p className="text-sm text-muted-foreground">Track shipments from origin to warehouse delivery</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/50">
          <div className="flex items-center gap-2 mb-1">
            <Ship className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-blue-700">{stats.total}</div>
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">Active Shipments</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-indigo-500 bg-indigo-50/50">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-indigo-700">{stats.inTransit}</div>
          <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide">In Transit</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-teal-500 bg-teal-50/50">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="h-4 w-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold text-teal-700">{stats.arrivingThisWeek}</div>
          <div className="text-xs font-medium text-teal-600 uppercase tracking-wide">Arriving This Week</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700">{stats.lfdCritical}</div>
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">LFD Critical</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50/50">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">{stats.delivered}</div>
          <div className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Delivered</div>
        </Card>
        <Card className="p-4 border-l-4 border-l-rose-500 bg-rose-50/50">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-4 w-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold text-rose-700">
            {stats.valueInTransit >= 1000000
              ? `$${(stats.valueInTransit / 1000000).toFixed(1)}M`
              : `$${(stats.valueInTransit / 1000).toFixed(0)}K`}
          </div>
          <div className="text-xs font-medium text-rose-600 uppercase tracking-wide">Value In Transit</div>
        </Card>
      </div>

      {/* Status Tabs + Filters */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-2">
          {STATUS_TABS.map(tab => {
            const count = tabCounts[tab.key] || 0
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  activeTab === tab.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span className={cn(
                    'ml-1.5 text-xs',
                    activeTab === tab.key ? 'text-background/70' : 'text-muted-foreground'
                  )}>
                    ({count})
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-4">
          <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Suppliers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Suppliers</SelectItem>
              {suppliers.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search invoice or BOL..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </div>

      {/* Shipment Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_0.8fr_0.8fr_1.2fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 px-4 py-3 bg-muted/50 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <div>Invoice / BOL</div>
          <div>Supplier</div>
          <div className="text-center">Containers</div>
          <div>Status</div>
          <div>ETD</div>
          <div>ETA</div>
          <div className="text-right">Value</div>
          <div className="text-right">Weight</div>
          <div className="text-center">POs</div>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-muted-foreground">
            No shipments found matching your filters.
          </div>
        ) : (
          filtered.map((shipment) => {
            const isExpanded = expandedRows.has(shipment.id)
            return (
              <div key={shipment.id} className="border-t border-border">
                {/* Summary row */}
                <button
                  type="button"
                  onClick={() => toggleRow(shipment.id)}
                  className="w-full grid grid-cols-[2fr_0.8fr_0.8fr_1.2fr_1fr_1fr_1fr_1fr_0.8fr] gap-2 px-4 py-3 items-center text-left hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div>
                      <div className="font-semibold text-sm text-foreground">{shipment.invoice_number}</div>
                      <div className="text-xs text-muted-foreground font-mono">{shipment.bol_number}</div>
                    </div>
                  </div>
                  <div>
                    <span className={cn(
                      'text-xs font-bold px-2 py-0.5 rounded',
                      shipment.supplier === 'AMC' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                    )}>
                      {shipment.supplier}
                    </span>
                  </div>
                  <div className="text-center text-sm text-foreground">{shipment.container_count}</div>
                  <div>
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full', getStatusColor(shipment.status))}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {getStatusLabel(shipment.status)}
                    </span>
                  </div>
                  <div className="text-sm text-foreground">{formatDate(shipment.etd)}</div>
                  <div className="text-sm text-foreground">{formatDate(shipment.eta)}</div>
                  <div className="text-sm text-foreground text-right font-mono">{formatCurrency(shipment.total_value)}</div>
                  <div className="text-sm text-foreground text-right font-mono">{formatWeight(shipment.total_weight)}</div>
                  <div className="text-center text-sm text-foreground">
                    {shipment.po_numbers?.length > 0 ? shipment.po_numbers.join(', ') : '-'}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-6 pb-5 pt-2 bg-muted/20 border-t border-border space-y-6">
                    {/* Status Timeline */}
                    <ShipmentStatusTimeline tracking={shipment.tracking} />

                    {/* Tracking Details */}
                    {shipment.tracking && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Tracking Details</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <Ship className="h-3.5 w-3.5" /> Shipped
                            </div>
                            <div className="text-sm font-medium text-foreground">{formatDate(shipment.tracking.shipped_date)}</div>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                              <DollarSign className="h-3.5 w-3.5" /> Cleared
                            </div>
                            <div className="text-sm font-medium text-foreground">{formatDate(shipment.tracking.cleared_date)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Duty</div>
                            <div className="text-sm font-medium text-foreground">{formatCurrency(shipment.tracking.duty_amount)}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">Entry #</div>
                            <div className="text-sm font-medium font-mono text-foreground">{shipment.tracking.entry_number || '-'}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Containers & SKUs */}
                    {shipment.containers.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          Containers & SKUs ({shipment.containers.length} items)
                        </h4>
                        {/* Group containers by container_number */}
                        {Object.entries(
                          shipment.containers.reduce<Record<string, { type: string; items: ShipmentContainer[] }>>((acc, c) => {
                            const key = c.container_number
                            if (!acc[key]) acc[key] = { type: c.container_type, items: [] }
                            acc[key].items.push(c)
                            return acc
                          }, {})
                        ).map(([containerNum, { type, items }]) => (
                          <div key={containerNum} className="mb-4 last:mb-0">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                <span className="text-sm font-semibold text-foreground">{containerNum}</span>
                                <span className="text-xs text-muted-foreground">({type})</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{items.length} SKU{items.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="rounded-md border border-border overflow-hidden">
                              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_1fr_1fr_1fr] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium uppercase text-muted-foreground">
                                <div>SKU</div>
                                <div>PO</div>
                                <div className="text-right">Qty</div>
                                <div className="text-right">Unit Price</div>
                                <div className="text-right">Total</div>
                                <div className="text-right">Weight</div>
                              </div>
                              {items.map((item) => (
                                <div key={item.id} className="grid grid-cols-[1fr_0.8fr_0.8fr_1fr_1fr_1fr] gap-2 px-3 py-2 border-t border-border text-sm">
                                  <div className="font-mono text-foreground">{item.sku}</div>
                                  <div className="text-foreground">{item.po_number || '-'}</div>
                                  <div className="text-right font-mono text-foreground">{item.quantity}</div>
                                  <div className="text-right font-mono text-foreground">{formatCurrency(item.unit_price)}</div>
                                  <div className="text-right font-mono font-medium text-foreground">{formatCurrency(item.total_amount)}</div>
                                  <div className="text-right font-mono text-foreground">{formatWeight(item.gross_weight)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
