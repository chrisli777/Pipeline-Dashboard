'use client'

import { useState, useEffect } from 'react'
import { type ShipmentWithTracking, type ShipmentContainer, type ContainerTracking, SHIPMENT_STATUS_ORDER, SHIPMENT_STATUS_LABELS } from '@/lib/types'
import { ShipmentStatusBadge } from './shipment-status-badge'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Package, MapPin, DollarSign, Truck, Clock } from 'lucide-react'

interface ShipmentDetailPanelProps {
  shipment: ShipmentWithTracking
}

export function ShipmentDetailPanel({ shipment }: ShipmentDetailPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [containerTracking, setContainerTracking] = useState<ContainerTracking[]>([])
  const tracking = shipment.tracking
  const containers = shipment.containers || []
  const currentStatus = tracking?.status || 'ON_WATER'

  // Group containers by container_number
  const containerGroups = containers.reduce<Record<string, ShipmentContainer[]>>((acc, c) => {
    const key = c.container_number || 'Unknown'
    if (!acc[key]) acc[key] = []
    acc[key].push(c)
    return acc
  }, {})

  // Fetch container-level tracking when expanded
  useEffect(() => {
    if (expanded && containerTracking.length === 0) {
      fetch(`/api/shipments/${shipment.id}/containers/tracking`)
        .then(res => res.json())
        .then(data => {
          if (data.containers) {
            setContainerTracking(data.containers)
          }
        })
        .catch(console.error)
    }
  }, [expanded, shipment.id, containerTracking.length])

  // Container status summary
  const ctSummary = containerTracking.length > 0
    ? containerTracking.reduce<Record<string, number>>((acc, ct) => {
        acc[ct.status] = (acc[ct.status] || 0) + 1
        return acc
      }, {})
    : null

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {/* Header row — clickable to expand */}
      <div
        className="grid grid-cols-[auto_1fr_80px_80px_130px_90px_90px_85px_75px_50px] gap-2 items-center px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors text-sm"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-5">
          {expanded
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />
          }
        </div>
        <div>
          <div className="font-medium text-slate-900">{shipment.invoice_number}</div>
          <div className="text-xs text-slate-500">{shipment.bol_number || '-'}</div>
        </div>
        <div>
          <span className={cn(
            'text-xs font-medium px-2 py-0.5 rounded',
            shipment.supplier === 'AMC' && 'bg-blue-50 text-blue-700',
            shipment.supplier === 'HX' && 'bg-green-50 text-green-700',
            shipment.supplier === 'TJJSH' && 'bg-orange-50 text-orange-700',
            shipment.supplier?.includes('CLARK') && 'bg-purple-50 text-purple-700',
          )}>
            {shipment.supplier}
          </span>
        </div>
        <div className="text-center text-slate-600">{shipment.container_count}</div>
        <ShipmentStatusBadge status={currentStatus} size="sm" />
        <div className="text-slate-600 text-xs">{shipment.etd ? formatDate(shipment.etd) : '-'}</div>
        <div className="text-slate-600 text-xs">{shipment.eta ? formatDate(shipment.eta) : '-'}</div>
        <div className="text-right text-slate-700 font-medium text-xs">
          ${(shipment.total_value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
        </div>
        <div className="text-right text-slate-600 text-xs">
          {(shipment.total_weight || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs
        </div>
        <div className="text-right text-xs text-slate-500">
          {shipment.po_numbers?.length || 0} PO{(shipment.po_numbers?.length || 0) !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50">
          {/* Status timeline — 5 stages */}
          <div className="px-6 py-4 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Status Timeline</h4>
            <div className="flex items-center gap-1">
              {SHIPMENT_STATUS_ORDER.map((s, i) => {
                const statusIdx = SHIPMENT_STATUS_ORDER.indexOf(currentStatus)
                const isCompleted = i < statusIdx
                const isCurrent = s === currentStatus
                const isFuture = i > statusIdx

                return (
                  <div key={s} className="flex items-center gap-1 flex-1">
                    <div className={cn(
                      'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0',
                      isCompleted && 'bg-green-500 text-white',
                      isCurrent && 'bg-blue-500 text-white ring-2 ring-blue-200',
                      isFuture && 'bg-slate-200 text-slate-400',
                    )}>
                      {isCompleted ? '\u2713' : i + 1}
                    </div>
                    <div className={cn(
                      'text-[10px] leading-tight hidden xl:block',
                      isCompleted && 'text-green-700 font-medium',
                      isCurrent && 'text-blue-700 font-semibold',
                      isFuture && 'text-slate-400',
                    )}>
                      {SHIPMENT_STATUS_LABELS[s]}
                    </div>
                    {i < SHIPMENT_STATUS_ORDER.length - 1 && (
                      <div className={cn(
                        'flex-1 h-0.5 mx-1',
                        i < statusIdx ? 'bg-green-400' : 'bg-slate-200',
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Container status summary */}
          {ctSummary && (
            <div className="px-6 py-3 border-b border-slate-200 bg-blue-50/50">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Container Status ({containerTracking.length} containers)
              </h4>
              <div className="flex gap-3">
                {Object.entries(ctSummary).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1.5">
                    <ShipmentStatusBadge status={status} size="sm" />
                    <span className="text-xs font-bold text-slate-700">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tracking details grid */}
          {tracking && (
            <div className="px-6 py-4 border-b border-slate-200">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Tracking Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                {tracking.cleared_date && (
                  <DetailItem icon={DollarSign} label="Cleared" value={formatDate(tracking.cleared_date)} />
                )}
                {tracking.delivered_date && (
                  <DetailItem icon={Truck} label="Delivered" value={formatDate(tracking.delivered_date)} />
                )}
                {tracking.estimated_warehouse_date && (
                  <DetailItem icon={Clock} label="Est. Warehouse" value={formatDate(tracking.estimated_warehouse_date)} />
                )}
                {tracking.lfd && (
                  <DetailItem label="LFD" value={formatDate(tracking.lfd)} highlight={true} />
                )}
                {tracking.duty_amount !== null && tracking.duty_amount !== undefined && (
                  <DetailItem label="Duty" value={`$${tracking.duty_amount.toLocaleString()}`} />
                )}
                {tracking.entry_number && (
                  <DetailItem label="Entry #" value={tracking.entry_number} />
                )}
                {tracking.carrier && (
                  <DetailItem label="Carrier" value={tracking.carrier} />
                )}
                {tracking.warehouse && (
                  <DetailItem label="Warehouse" value={tracking.warehouse} />
                )}
                {tracking.notes && (
                  <div className="col-span-full">
                    <DetailItem label="Notes" value={tracking.notes} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Container details with per-container status */}
          <div className="px-6 py-4">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              Containers & SKUs ({containers.length} items)
            </h4>
            <div className="space-y-3">
              {Object.entries(containerGroups).map(([containerNum, items]) => {
                // Find container-level tracking for this container
                const ctTrack = containerTracking.find(ct => ct.container_number === containerNum)

                return (
                  <div key={containerNum} className="bg-white rounded-md border border-slate-200 overflow-hidden">
                    <div className="bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      {containerNum}
                      <span className="text-slate-400">({items[0]?.container_type || '-'})</span>
                      {ctTrack && (
                        <ShipmentStatusBadge status={ctTrack.status} size="sm" />
                      )}
                      {ctTrack?.carrier && (
                        <span className="text-slate-500 ml-1">
                          <Truck className="h-3 w-3 inline mr-0.5" />{ctTrack.carrier}
                        </span>
                      )}
                      {ctTrack?.warehouse && (
                        <span className="text-slate-500 ml-1">
                          <MapPin className="h-3 w-3 inline mr-0.5" />{ctTrack.warehouse}
                        </span>
                      )}
                      <span className="ml-auto text-slate-500">{items.length} SKU{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Container-level delivery info */}
                    {ctTrack && (ctTrack.scheduled_delivery_date || ctTrack.delivered_date || ctTrack.picked_up_date) && (
                      <div className="px-3 py-1.5 bg-blue-50 text-xs flex gap-4 border-b border-slate-100">
                        {ctTrack.picked_up_date && (
                          <span className="text-slate-600">Picked up: {formatDate(ctTrack.picked_up_date)}</span>
                        )}
                        {ctTrack.scheduled_delivery_date && (
                          <span className="text-slate-600">Scheduled: {formatDate(ctTrack.scheduled_delivery_date)}</span>
                        )}
                        {ctTrack.delivered_date && (
                          <span className="text-green-700 font-medium">Delivered: {formatDate(ctTrack.delivered_date)}</span>
                        )}
                      </div>
                    )}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">SKU</th>
                          <th className="text-left px-3 py-1.5 text-slate-500 font-medium">PO</th>
                          <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Qty</th>
                          <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Unit Price</th>
                          <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Total</th>
                          <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                            <td className="px-3 py-1.5 font-medium text-slate-700">{item.sku}</td>
                            <td className="px-3 py-1.5 text-slate-600">{item.po_number || '-'}</td>
                            <td className="px-3 py-1.5 text-right text-slate-700">{item.quantity}</td>
                            <td className="px-3 py-1.5 text-right text-slate-600">
                              {item.unit_price ? `$${item.unit_price.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium text-slate-700">
                              {item.total_amount ? `$${item.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="px-3 py-1.5 text-right text-slate-600">
                              {item.gross_weight ? `${item.gross_weight.toLocaleString()} lbs` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Status history (audit trail) */}
          {tracking?.status_history && tracking.status_history.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-200">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                Status History
              </h4>
              <div className="space-y-2">
                {[...tracking.status_history].reverse().map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="font-medium text-slate-700">
                        {entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}
                      </span>
                      <span className="text-slate-400 ml-2">
                        {entry.changed_at ? formatDateTime(entry.changed_at) : ''}
                      </span>
                      {entry.changed_by && (
                        <span className="text-slate-400 ml-1">by {entry.changed_by}</span>
                      )}
                      {entry.notes && (
                        <div className="text-slate-500 mt-0.5">{entry.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Helper components
function DetailItem({ icon: Icon, label, value, highlight }: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      {Icon && <Icon className="h-4 w-4 text-slate-400 mt-0.5" />}
      <div>
        <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
        <div className={cn(
          'text-sm font-medium',
          highlight ? 'text-red-700' : 'text-slate-700'
        )}>
          {value}
        </div>
      </div>
    </div>
  )
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
