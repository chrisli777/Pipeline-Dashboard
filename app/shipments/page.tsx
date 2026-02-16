'use client'

import { useState, useEffect, useCallback } from 'react'
import { type ShipmentWithTracking, type ShipmentDashboardStats, type ShipmentStatus, SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_ORDER } from '@/lib/types'
import { ShipmentDetailPanel } from '@/components/shipment-detail-panel'
import { ShipmentStatusBadge, LfdStatusBadge } from '@/components/shipment-status-badge'
import { TrackingStatusUpdate } from '@/components/tracking-status-update'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Ship, Package, AlertTriangle, DollarSign,
  Truck, CheckCircle2, CalendarClock,
  Search, RefreshCw, ArrowUpRight, Loader2,
} from 'lucide-react'

type StatusFilter = 'ALL' | ShipmentStatus

// Fetch with exponential backoff retry (adopted from Chris's pattern)
async function fetchWithRetry(url: string, retryCount = 0): Promise<Response> {
  const res = await fetch(url)
  if ((res.status >= 429 || !res.ok) && retryCount < 3) {
    await new Promise(r => setTimeout(r, 2000 * (retryCount + 1)))
    return fetchWithRetry(url, retryCount + 1)
  }
  return res
}

export default function ShipmentTrackingPage() {
  const [shipments, setShipments] = useState<ShipmentWithTracking[]>([])
  const [stats, setStats] = useState<ShipmentDashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedShipment, setSelectedShipment] = useState<ShipmentWithTracking | null>(null)
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false)

  const fetchShipments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (supplierFilter !== 'ALL') params.set('supplier', supplierFilter)
      if (searchQuery) params.set('search', searchQuery)

      const [shipmentsRes, statsRes] = await Promise.all([
        fetchWithRetry(`/api/shipments?${params}`),
        fetchWithRetry('/api/shipments/dashboard'),
      ])

      const shipmentsData = await shipmentsRes.json()
      const statsData = await statsRes.json()

      setShipments(shipmentsData.shipments || [])
      setStats(statsData)
    } catch (error) {
      console.error('Failed to fetch shipments:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, supplierFilter, searchQuery])

  useEffect(() => {
    fetchShipments()
  }, [fetchShipments])

  const handleUpdateStatus = (shipment: ShipmentWithTracking) => {
    setSelectedShipment(shipment)
    setUpdateDialogOpen(true)
  }

  const handleStatusUpdated = () => {
    fetchShipments() // Refresh data
  }

  // Count shipments by status
  const statusCounts = shipments.reduce<Record<string, number>>((acc, s) => {
    const status = s.tracking?.status || 'ON_WATER'
    acc[status] = (acc[status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Shipment Tracking</h1>
        <p className="text-sm text-slate-500 mt-1">
          Track shipments from origin to warehouse delivery
        </p>
      </div>

      {/* Dashboard Stats Cards — 5-stage model */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatsCard
            title="Active Shipments"
            value={stats.active_shipments}
            icon={Ship}
            color="blue"
          />
          <StatsCard
            title="On Water"
            value={stats.on_water_count}
            icon={Ship}
            color="indigo"
          />
          <StatsCard
            title="Cleared"
            value={stats.cleared_count}
            icon={CheckCircle2}
            color="teal"
          />
          <StatsCard
            title="LFD Critical"
            value={stats.lfd_critical_count}
            icon={AlertTriangle}
            color={stats.lfd_critical_count > 0 ? 'red' : 'green'}
            pulse={stats.lfd_critical_count > 0}
          />
          <StatsCard
            title="Arriving This Week"
            value={stats.arriving_this_week}
            icon={CalendarClock}
            color="cyan"
          />
          <StatsCard
            title="Delivering"
            value={stats.delivering_count}
            subtitle={stats.containers_delivering > 0 ? `${stats.containers_delivering} ctrs` : undefined}
            icon={Truck}
            color="orange"
          />
          <StatsCard
            title="Value in Transit"
            value={`$${(stats.total_value_in_transit / 1000).toFixed(0)}K`}
            icon={DollarSign}
            color="amber"
            isText
          />
        </div>
      )}

      {/* LFD Alert Bar */}
      {stats && stats.lfd_critical_count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-red-800">
              {stats.lfd_critical_count} shipment{stats.lfd_critical_count !== 1 ? 's' : ''} with LFD expiring within 3 days!
            </span>
            <span className="text-sm text-red-600 ml-2">
              Action required to avoid demurrage charges.
            </span>
          </div>
        </div>
      )}

      {/* Filters — 5-stage tabs */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Status tabs */}
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          className="flex-1"
        >
          <TabsList className="h-9 flex-wrap">
            <TabsTrigger value="ALL" className="text-xs">
              All ({shipments.length})
            </TabsTrigger>
            {SHIPMENT_STATUS_ORDER.filter(s => s !== 'CLOSED').map((status) => (
              <TabsTrigger key={status} value={status} className="text-xs">
                {SHIPMENT_STATUS_LABELS[status]}
                {statusCounts[status] ? ` (${statusCounts[status]})` : ''}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Supplier filter */}
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="Supplier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Suppliers</SelectItem>
            <SelectItem value="AMC">AMC</SelectItem>
            <SelectItem value="HX">HX</SelectItem>
            <SelectItem value="TJJSH">TJJSH</SelectItem>
            <SelectItem value="CLARK">CLARK</SelectItem>
          </SelectContent>
        </Select>

        {/* Search */}
        <div className="relative w-[250px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search invoice, BOL, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[auto_1fr_80px_80px_130px_90px_90px_85px_75px_50px] gap-2 items-center px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200">
        <div className="w-5"></div>
        <div>Invoice / BOL</div>
        <div>Supplier</div>
        <div className="text-center">Containers</div>
        <div>Status</div>
        <div>ETD</div>
        <div>ETA</div>
        <div className="text-right">Value</div>
        <div className="text-right">Weight</div>
        <div className="text-right">POs</div>
      </div>

      {/* Shipment list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          Loading shipments...
        </div>
      ) : shipments.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-lg font-medium">No shipments found</p>
          <p className="text-sm mt-1">
            {statusFilter !== 'ALL'
              ? `No shipments with status "${SHIPMENT_STATUS_LABELS[statusFilter as ShipmentStatus]}"`
              : 'Run the Supabase sync to populate shipment data'
            }
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shipments.map((shipment) => (
            <div key={shipment.id} className="group relative">
              <ShipmentDetailPanel shipment={shipment} />

              {/* Quick action button — advance status */}
              {shipment.tracking?.status && !['DELIVERED', 'CLOSED'].includes(shipment.tracking.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-3 right-4 opacity-0 group-hover:opacity-100 transition-opacity text-xs h-7"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleUpdateStatus(shipment)
                  }}
                >
                  <ArrowUpRight className="h-3 w-3 mr-1" />
                  Advance
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Supplier Summary */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mt-4">
          <SupplierCard supplier="AMC" count={stats.amc_active} color="blue" />
          <SupplierCard supplier="HX" count={stats.hx_active} color="green" />
          <SupplierCard supplier="TJJSH" count={stats.tjjsh_active} color="orange" />
          <SupplierCard supplier="CLARK" count={stats.clark_active} color="purple" />
        </div>
      )}

      {/* Status Update Dialog */}
      {selectedShipment && (
        <TrackingStatusUpdate
          shipment={selectedShipment}
          open={updateDialogOpen}
          onOpenChange={setUpdateDialogOpen}
          onStatusUpdated={handleStatusUpdated}
        />
      )}
    </div>
  )
}

// ===================================================
// Sub-components
// ===================================================

function StatsCard({
  title, value, subtitle, icon: Icon, color, pulse, isText
}: {
  title: string
  value: number | string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  pulse?: boolean
  isText?: boolean
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  }

  const iconColorMap: Record<string, string> = {
    blue: 'text-blue-500',
    indigo: 'text-indigo-500',
    teal: 'text-teal-500',
    orange: 'text-orange-500',
    cyan: 'text-cyan-500',
    red: 'text-red-500',
    green: 'text-green-500',
    amber: 'text-amber-500',
  }

  return (
    <Card className={`${colorMap[color] || colorMap.blue} border ${pulse ? 'animate-pulse' : ''}`}>
      <CardContent className="p-3 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${iconColorMap[color] || 'text-blue-500'} flex-shrink-0`} />
        <div>
          <div className={`${isText ? 'text-lg' : 'text-xl'} font-bold leading-none`}>
            {value}
          </div>
          <div className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">
            {title}
          </div>
          {subtitle && (
            <div className="text-[10px] opacity-60">
              {subtitle}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SupplierCard({ supplier, count, color }: { supplier: string; count: number; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
    purple: 'bg-purple-50 border-purple-200',
  }

  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${colorMap[color] || colorMap.blue}`}>
      <div className="text-sm font-bold text-slate-700">{supplier}</div>
      <div className="text-xs text-slate-500">{count} active</div>
    </div>
  )
}
