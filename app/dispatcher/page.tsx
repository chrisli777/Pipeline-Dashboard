'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  type ContainerDispatchView,
  type ShipmentStatus,
  SHIPMENT_STATUS_LABELS,
} from '@/lib/types'
import { ShipmentStatusBadge } from '@/components/shipment-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  Package, Truck, MapPin, RefreshCw, Loader2,
  ChevronDown, ChevronRight, ArrowUpRight,
  CheckCircle2, AlertTriangle, Clock, Calendar,
} from 'lucide-react'

type StatusTab = 'ALL' | 'CLEARED' | 'DELIVERING' | 'DELIVERED'

interface DispatchSummary {
  total: number
  by_status: Record<string, number>
  by_warehouse: Record<string, number>
}

// ═══════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════

export default function DispatcherDashboardPage() {
  const [containers, setContainers] = useState<ContainerDispatchView[]>([])
  const [summary, setSummary] = useState<DispatchSummary | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusTab, setStatusTab] = useState<StatusTab>('CLEARED')
  const [supplierFilter, setSupplierFilter] = useState('ALL')
  const [warehouseFilter, setWarehouseFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('lfd_asc')
  const [searchQuery, setSearchQuery] = useState('')

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Dialogs
  const [editContainer, setEditContainer] = useState<ContainerDispatchView | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [batchAction, setBatchAction] = useState<'DELIVERING' | 'DELIVERED' | null>(null)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const fetchContainers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusTab !== 'ALL') params.set('status', statusTab)
      if (supplierFilter !== 'ALL') params.set('supplier', supplierFilter)
      if (warehouseFilter !== 'ALL') params.set('warehouse', warehouseFilter)
      params.set('sort', sortBy)

      const res = await fetch(`/api/dispatcher/containers?${params}`)
      const data = await res.json()

      let containersList = data.containers || []

      // Client-side search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        containersList = containersList.filter((c: ContainerDispatchView) =>
          c.container_number.toLowerCase().includes(q) ||
          c.invoice_number.toLowerCase().includes(q) ||
          (c.carrier || '').toLowerCase().includes(q) ||
          (c.bol_number || '').toLowerCase().includes(q) ||
          (c.sku_summary || []).some(s => s.sku.toLowerCase().includes(q))
        )
      }

      setContainers(containersList)
      setSummary(data.summary || null)
    } catch (error) {
      console.error('Failed to fetch containers:', error)
    } finally {
      setLoading(false)
    }
  }, [statusTab, supplierFilter, warehouseFilter, sortBy, searchQuery])

  useEffect(() => {
    fetchContainers()
  }, [fetchContainers])

  // Reset selection when filters change
  useEffect(() => {
    setSelected(new Set())
  }, [statusTab, supplierFilter, warehouseFilter])

  // ── Selection helpers ──
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === containers.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(containers.map(c => c.id)))
    }
  }

  const selectedContainers = containers.filter(c => selected.has(c.id))

  // ── Batch action: which containers can transition ──
  const canBatchDeliver = selectedContainers.some(c => c.status === 'CLEARED')
  const canBatchDelivered = selectedContainers.some(c => c.status === 'DELIVERING')

  const toggleExpanded = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-5 max-w-[1600px] mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dispatcher Dashboard</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage container pickup, delivery scheduling, and warehouse routing
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchContainers()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <SummaryCard
              label="Total Containers"
              value={summary.total}
              icon={Package}
              color="blue"
            />
            <SummaryCard
              label="Cleared (Awaiting)"
              value={summary.by_status.CLEARED || 0}
              icon={CheckCircle2}
              color="teal"
            />
            <SummaryCard
              label="Delivering"
              value={summary.by_status.DELIVERING || 0}
              icon={Truck}
              color="orange"
            />
            <SummaryCard
              label="Delivered"
              value={summary.by_status.DELIVERED || 0}
              icon={MapPin}
              color="green"
            />
            <SummaryCard
              label="Kent WH"
              value={summary.by_warehouse.Kent || 0}
              icon={MapPin}
              color="indigo"
            />
            <SummaryCard
              label="Moses Lake"
              value={summary.by_warehouse['Moses Lake'] || 0}
              icon={MapPin}
              color="purple"
            />
          </div>
        )}

        {/* Filters Row */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          {/* Status tabs */}
          <Tabs
            value={statusTab}
            onValueChange={(v) => setStatusTab(v as StatusTab)}
          >
            <TabsList className="h-9">
              <TabsTrigger value="ALL" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="CLEARED" className="text-xs">
                Cleared {summary ? `(${summary.by_status.CLEARED || 0})` : ''}
              </TabsTrigger>
              <TabsTrigger value="DELIVERING" className="text-xs">
                Delivering {summary ? `(${summary.by_status.DELIVERING || 0})` : ''}
              </TabsTrigger>
              <TabsTrigger value="DELIVERED" className="text-xs">
                Delivered {summary ? `(${summary.by_status.DELIVERED || 0})` : ''}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-[130px] h-9">
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

          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue placeholder="Warehouse" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Warehouses</SelectItem>
              <SelectItem value="Kent">Kent</SelectItem>
              <SelectItem value="Moses Lake">Moses Lake</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lfd_asc">LFD (earliest)</SelectItem>
              <SelectItem value="delivery_date_asc">Delivery date</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
            </SelectContent>
          </Select>

          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder="Search container, invoice, SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-3"
            />
          </div>
        </div>

        {/* Batch Action Bar (shows when items selected) */}
        {selected.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
            <span className="text-sm font-medium text-blue-800">
              {selected.size} container{selected.size !== 1 ? 's' : ''} selected
            </span>
            <div className="flex-1" />
            {canBatchDeliver && (
              <Button
                size="sm"
                variant="outline"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => { setBatchAction('DELIVERING'); setBatchDialogOpen(true) }}
              >
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Mark Picked Up
              </Button>
            )}
            {canBatchDelivered && (
              <Button
                size="sm"
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={() => { setBatchAction('DELIVERED'); setBatchDialogOpen(true) }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Mark Delivered
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              className="text-slate-500"
            >
              Clear
            </Button>
          </div>
        )}

        {/* Container Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          {/* Table Header */}
          <div className="grid grid-cols-[40px_1fr_130px_80px_90px_80px_90px_80px_60px_80px_50px] gap-1 items-center px-3 py-2.5 bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <div className="flex justify-center">
              <Checkbox
                checked={containers.length > 0 && selected.size === containers.length}
                onCheckedChange={toggleAll}
              />
            </div>
            <div>Container / Invoice</div>
            <div>Status</div>
            <div>Supplier</div>
            <div>LFD</div>
            <div>Pickup</div>
            <div>Scheduled</div>
            <div>Carrier</div>
            <div>WH</div>
            <div>SKUs</div>
            <div className="text-center">Action</div>
          </div>

          {/* Table Body */}
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading containers...
            </div>
          ) : containers.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No containers found</p>
              <p className="text-xs mt-1">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {containers.map((container) => (
                <ContainerRow
                  key={container.id}
                  container={container}
                  isSelected={selected.has(container.id)}
                  isExpanded={expandedRows.has(container.id)}
                  onToggleSelect={() => toggleSelect(container.id)}
                  onToggleExpand={() => toggleExpanded(container.id)}
                  onEdit={() => { setEditContainer(container); setEditDialogOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Edit Container Dialog */}
        {editContainer && (
          <ContainerEditDialog
            container={editContainer}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            onUpdated={() => { setEditDialogOpen(false); fetchContainers() }}
          />
        )}

        {/* Batch Action Dialog */}
        {batchAction && (
          <BatchActionDialog
            action={batchAction}
            containers={selectedContainers}
            open={batchDialogOpen}
            onOpenChange={setBatchDialogOpen}
            onCompleted={() => {
              setBatchDialogOpen(false)
              setSelected(new Set())
              fetchContainers()
            }}
          />
        )}
      </div>
    </TooltipProvider>
  )
}

// ═══════════════════════════════════════════
// Container Row
// ═══════════════════════════════════════════

function ContainerRow({
  container,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onEdit,
}: {
  container: ContainerDispatchView
  isSelected: boolean
  isExpanded: boolean
  onToggleSelect: () => void
  onToggleExpand: () => void
  onEdit: () => void
}) {
  const skus = container.sku_summary || []
  const skuLabel = skus.length > 0
    ? skus.map(s => `${s.sku}(${s.quantity})`).join(', ')
    : '-'

  return (
    <>
      <div
        className={cn(
          'grid grid-cols-[40px_1fr_130px_80px_90px_80px_90px_80px_60px_80px_50px] gap-1 items-center px-3 py-2 text-sm hover:bg-slate-50 transition-colors',
          isSelected && 'bg-blue-50/50',
        )}
      >
        {/* Checkbox */}
        <div className="flex justify-center">
          <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />
        </div>

        {/* Container / Invoice */}
        <div
          className="cursor-pointer flex items-center gap-1.5 min-w-0"
          onClick={onToggleExpand}
        >
          {isExpanded
            ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          }
          <div className="min-w-0">
            <div className="font-medium text-slate-800 truncate">{container.container_number}</div>
            <div className="text-[11px] text-slate-400 truncate">{container.invoice_number} · {container.container_type || '-'}</div>
          </div>
        </div>

        {/* Status */}
        <div>
          <ShipmentStatusBadge status={container.status} size="sm" />
        </div>

        {/* Supplier */}
        <div>
          <SupplierBadge supplier={container.supplier} />
        </div>

        {/* LFD */}
        <div>
          <LfdCell lfd={container.lfd} status={container.status} />
        </div>

        {/* Pickup Date */}
        <div className="text-xs text-slate-600">
          {container.picked_up_date ? formatDateShort(container.picked_up_date) : '-'}
        </div>

        {/* Scheduled Delivery */}
        <div className="text-xs text-slate-600">
          {container.scheduled_delivery_date ? formatDateShort(container.scheduled_delivery_date) : '-'}
        </div>

        {/* Carrier */}
        <div className="text-xs text-slate-600 truncate">
          {container.carrier || '-'}
        </div>

        {/* Warehouse */}
        <div className="text-xs">
          {container.warehouse ? (
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-medium',
              container.warehouse === 'Kent' && 'bg-indigo-50 text-indigo-700',
              container.warehouse === 'Moses Lake' && 'bg-purple-50 text-purple-700',
            )}>
              {container.warehouse === 'Moses Lake' ? 'ML' : container.warehouse}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </div>

        {/* SKU summary */}
        <div className="text-xs text-slate-600">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default truncate block">
                  {container.total_quantity > 0
                    ? `${skus.length} SKU · ${container.total_quantity}`
                    : '-'
                  }
                </span>
              </TooltipTrigger>
              {skus.length > 0 && (
                <TooltipContent side="left" className="max-w-[250px]">
                  <div className="text-xs space-y-1">
                    {skus.map((s, i) => (
                      <div key={i} className="flex justify-between gap-3">
                        <span className="font-medium">{s.sku}</span>
                        <span>{s.quantity} pcs</span>
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Action */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-slate-400 hover:text-slate-700"
            onClick={onEdit}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded: SKU details + status history */}
      {isExpanded && (
        <div className="bg-slate-50 border-t border-slate-100 px-4 py-3">
          <div className="grid grid-cols-2 gap-6">
            {/* SKU Details */}
            <div>
              <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">SKU Details</h5>
              {skus.length > 0 ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400">
                      <th className="text-left py-1">SKU</th>
                      <th className="text-left py-1">PO</th>
                      <th className="text-right py-1">Qty</th>
                      <th className="text-right py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    {skus.map((s, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1 font-medium text-slate-700">{s.sku}</td>
                        <td className="py-1">{s.po_number || '-'}</td>
                        <td className="py-1 text-right">{s.quantity}</td>
                        <td className="py-1 text-right">
                          {s.total_amount ? `$${s.total_amount.toLocaleString()}` : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-400">No SKU data</p>
              )}
            </div>

            {/* Status History */}
            <div>
              <h5 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Status History</h5>
              {container.status_history && container.status_history.length > 0 ? (
                <div className="space-y-1.5">
                  {[...container.status_history].reverse().slice(0, 5).map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                      <div>
                        <span className="font-medium text-slate-700">
                          {entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}
                        </span>
                        {entry.changed_at && (
                          <span className="text-slate-400 ml-1.5">
                            {formatDateTime(entry.changed_at)}
                          </span>
                        )}
                        {entry.notes && (
                          <div className="text-slate-500 mt-0.5">{entry.notes}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No history</p>
              )}

              {/* Shipment info */}
              <div className="mt-3 pt-2 border-t border-slate-200 text-xs text-slate-500 space-y-1">
                {container.etd && <div>ETD: {formatDateShort(container.etd)}</div>}
                {container.eta && <div>ETA: {formatDateShort(container.eta)}</div>}
                {container.cleared_date && <div>Cleared: {formatDateShort(container.cleared_date)}</div>}
                {container.delivered_date && <div>Delivered: {formatDateShort(container.delivered_date)}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════
// Container Edit Dialog
// ═══════════════════════════════════════════

function ContainerEditDialog({
  container,
  open,
  onOpenChange,
  onUpdated,
}: {
  container: ContainerDispatchView
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    carrier: container.carrier || '',
    warehouse: container.warehouse || '',
    picked_up_date: container.picked_up_date || '',
    scheduled_delivery_date: container.scheduled_delivery_date || '',
    delivered_date: container.delivered_date || '',
    delivery_reference: container.delivery_reference || '',
    notes: container.notes || '',
  })

  // Determine next status option
  const nextStatusOptions: { value: ShipmentStatus; label: string }[] = []
  if (container.status === 'CLEARED') {
    nextStatusOptions.push({ value: 'DELIVERING', label: 'Mark as Delivering' })
  } else if (container.status === 'DELIVERING') {
    nextStatusOptions.push({ value: 'DELIVERED', label: 'Mark as Delivered' })
    nextStatusOptions.push({ value: 'CLEARED', label: 'Revert to Cleared' })
  } else if (container.status === 'DELIVERED') {
    nextStatusOptions.push({ value: 'DELIVERING', label: 'Revert to Delivering' })
  }

  const [selectedStatus, setSelectedStatus] = useState<string>('')

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const updates: Record<string, unknown> = {}

      // Status change
      if (selectedStatus) {
        updates.status = selectedStatus
      }

      // Field updates
      if (formData.carrier !== (container.carrier || '')) updates.carrier = formData.carrier || null
      if (formData.warehouse !== (container.warehouse || '')) updates.warehouse = formData.warehouse || null
      if (formData.picked_up_date !== (container.picked_up_date || '')) updates.picked_up_date = formData.picked_up_date || null
      if (formData.scheduled_delivery_date !== (container.scheduled_delivery_date || '')) updates.scheduled_delivery_date = formData.scheduled_delivery_date || null
      if (formData.delivered_date !== (container.delivered_date || '')) updates.delivered_date = formData.delivered_date || null
      if (formData.delivery_reference !== (container.delivery_reference || '')) updates.delivery_reference = formData.delivery_reference || null
      if (formData.notes !== (container.notes || '')) updates.notes = formData.notes || null

      if (Object.keys(updates).length === 0) {
        setError('No changes to save')
        setLoading(false)
        return
      }

      const res = await fetch(
        `/api/shipments/${container.shipment_id}/containers/${encodeURIComponent(container.container_number)}/tracking`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        }
      )

      const result = await res.json()
      if (!res.ok) {
        setError(result.error || 'Failed to update')
        return
      }

      onUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-slate-500" />
            {container.container_number}
          </DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 mt-1">
              <span className="text-slate-600">{container.invoice_number}</span>
              <span className="text-slate-400">·</span>
              <SupplierBadge supplier={container.supplier} />
              <span className="text-slate-400">·</span>
              <ShipmentStatusBadge status={container.status} size="sm" />
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status change */}
          {nextStatusOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Change Status</Label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep current status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__keep__">Keep current status</SelectItem>
                  {nextStatusOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="carrier" className="text-xs">Carrier</Label>
              <Input
                id="carrier"
                value={formData.carrier}
                onChange={e => setFormData(p => ({ ...p, carrier: e.target.value }))}
                placeholder="e.g., ABC Trucking"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="warehouse" className="text-xs">Warehouse</Label>
              <Select
                value={formData.warehouse || '__none__'}
                onValueChange={v => setFormData(p => ({ ...p, warehouse: v === '__none__' ? '' : v }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select warehouse" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  <SelectItem value="Kent">Kent</SelectItem>
                  <SelectItem value="Moses Lake">Moses Lake</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="picked_up_date" className="text-xs">Pickup Date</Label>
              <Input
                id="picked_up_date"
                type="date"
                value={formData.picked_up_date}
                onChange={e => setFormData(p => ({ ...p, picked_up_date: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_delivery_date" className="text-xs">Scheduled Delivery</Label>
              <Input
                id="scheduled_delivery_date"
                type="date"
                value={formData.scheduled_delivery_date}
                onChange={e => setFormData(p => ({ ...p, scheduled_delivery_date: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="delivered_date" className="text-xs">Delivered Date</Label>
              <Input
                id="delivered_date"
                type="date"
                value={formData.delivered_date}
                onChange={e => setFormData(p => ({ ...p, delivered_date: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivery_reference" className="text-xs">Delivery Reference</Label>
              <Input
                id="delivery_reference"
                value={formData.delivery_reference}
                onChange={e => setFormData(p => ({ ...p, delivery_reference: e.target.value }))}
                placeholder="e.g., DEL-001"
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-notes" className="text-xs">Notes</Label>
            <Textarea
              id="edit-notes"
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              placeholder="Add notes..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════
// Batch Action Dialog
// ═══════════════════════════════════════════

function BatchActionDialog({
  action,
  containers,
  open,
  onOpenChange,
  onCompleted,
}: {
  action: 'DELIVERING' | 'DELIVERED'
  containers: ContainerDispatchView[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    carrier: '',
    warehouse: '',
    picked_up_date: '',
    scheduled_delivery_date: '',
    delivered_date: '',
    notes: '',
  })

  // Group containers by shipment_id for batch API calls
  const eligible = containers.filter(c => {
    if (action === 'DELIVERING') return c.status === 'CLEARED'
    if (action === 'DELIVERED') return c.status === 'DELIVERING'
    return false
  })

  const grouped = eligible.reduce<Record<string, ContainerDispatchView[]>>((acc, c) => {
    if (!acc[c.shipment_id]) acc[c.shipment_id] = []
    acc[c.shipment_id].push(c)
    return acc
  }, {})

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      const updates: Record<string, unknown> = { status: action }

      if (action === 'DELIVERING') {
        if (formData.carrier) updates.carrier = formData.carrier
        if (formData.warehouse) updates.warehouse = formData.warehouse
        if (formData.picked_up_date) updates.picked_up_date = formData.picked_up_date
        if (formData.scheduled_delivery_date) updates.scheduled_delivery_date = formData.scheduled_delivery_date
      } else if (action === 'DELIVERED') {
        if (formData.delivered_date) updates.delivered_date = formData.delivered_date
      }
      if (formData.notes) updates.notes = formData.notes

      // Execute batch updates per shipment
      const results = await Promise.all(
        Object.entries(grouped).map(([shipmentId, ctrs]) =>
          fetch(`/api/shipments/${shipmentId}/containers/batch-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              container_numbers: ctrs.map(c => c.container_number),
              updates,
            }),
          }).then(r => r.json())
        )
      )

      const totalUpdated = results.reduce((sum, r) => sum + (r.updatedCount || 0), 0)
      const allErrors = results.flatMap(r => r.errors || [])

      if (totalUpdated === 0 && allErrors.length > 0) {
        setError(`Failed: ${allErrors.join('; ')}`)
        return
      }

      onCompleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {action === 'DELIVERING' ? 'Mark Containers as Delivering' : 'Mark Containers as Delivered'}
          </DialogTitle>
          <DialogDescription>
            {eligible.length} container{eligible.length !== 1 ? 's' : ''} will be updated
          </DialogDescription>
        </DialogHeader>

        {/* Container list preview */}
        <div className="max-h-[120px] overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
          {eligible.map(c => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
              <Package className="h-3 w-3 text-slate-400" />
              <span className="font-medium text-slate-700">{c.container_number}</span>
              <span className="text-slate-400">{c.invoice_number}</span>
              <ShipmentStatusBadge status={c.status} size="sm" />
            </div>
          ))}
        </div>

        {/* Fields based on action */}
        <div className="space-y-3">
          {action === 'DELIVERING' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Carrier</Label>
                  <Input
                    value={formData.carrier}
                    onChange={e => setFormData(p => ({ ...p, carrier: e.target.value }))}
                    placeholder="e.g., ABC Trucking"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Warehouse</Label>
                  <Select
                    value={formData.warehouse || '__none__'}
                    onValueChange={v => setFormData(p => ({ ...p, warehouse: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">-</SelectItem>
                      <SelectItem value="Kent">Kent</SelectItem>
                      <SelectItem value="Moses Lake">Moses Lake</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pickup Date</Label>
                  <Input
                    type="date"
                    value={formData.picked_up_date}
                    onChange={e => setFormData(p => ({ ...p, picked_up_date: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Scheduled Delivery</Label>
                  <Input
                    type="date"
                    value={formData.scheduled_delivery_date}
                    onChange={e => setFormData(p => ({ ...p, scheduled_delivery_date: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </>
          )}

          {action === 'DELIVERED' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Delivered Date</Label>
              <Input
                type="date"
                value={formData.delivered_date}
                onChange={e => setFormData(p => ({ ...p, delivered_date: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
              placeholder="Add notes..."
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading || eligible.length === 0}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Update {eligible.length} Container{eligible.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ═══════════════════════════════════════════
// Helper Components
// ═══════════════════════════════════════════

function SummaryCard({
  label, value, icon: Icon, color,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  color: string
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  const iconMap: Record<string, string> = {
    blue: 'text-blue-500',
    teal: 'text-teal-500',
    orange: 'text-orange-500',
    green: 'text-green-500',
    indigo: 'text-indigo-500',
    purple: 'text-purple-500',
  }

  return (
    <div className={cn('rounded-lg border px-3 py-2.5 flex items-center gap-2.5', colorMap[color])}>
      <Icon className={cn('h-5 w-5 flex-shrink-0', iconMap[color])} />
      <div>
        <div className="text-xl font-bold leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider opacity-70 mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function SupplierBadge({ supplier }: { supplier: string }) {
  const colors: Record<string, string> = {
    AMC: 'bg-blue-50 text-blue-700',
    HX: 'bg-green-50 text-green-700',
    TJJSH: 'bg-orange-50 text-orange-700',
    CLARK: 'bg-purple-50 text-purple-700',
  }
  return (
    <span className={cn('text-[11px] font-medium px-1.5 py-0.5 rounded', colors[supplier] || 'bg-slate-50 text-slate-600')}>
      {supplier}
    </span>
  )
}

function LfdCell({ lfd, status }: { lfd: string | null; status: string }) {
  if (!lfd) return <span className="text-xs text-slate-300">-</span>

  if (['DELIVERED', 'CLOSED'].includes(status)) {
    return <span className="text-[11px] text-slate-400">Done</span>
  }

  const lfdDate = new Date(lfd)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysToLfd = Math.ceil((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let colorClass = 'text-green-700 bg-green-50'
  let label = `${daysToLfd}d`

  if (daysToLfd < 0) {
    colorClass = 'text-red-700 bg-red-100 font-bold animate-pulse'
    label = `${Math.abs(daysToLfd)}d over!`
  } else if (daysToLfd <= 3) {
    colorClass = 'text-red-700 bg-red-50 font-semibold'
    label = `${daysToLfd}d left`
  } else if (daysToLfd <= 7) {
    colorClass = 'text-amber-700 bg-amber-50'
    label = `${daysToLfd}d left`
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('text-[11px] px-1.5 py-0.5 rounded inline-block', colorClass)}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <span className="text-xs">LFD: {formatDateShort(lfd)}</span>
      </TooltipContent>
    </Tooltip>
  )
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return dateStr
  }
}
