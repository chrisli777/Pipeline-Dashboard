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
    <div className="border-b last:border-b-0">
      {/* Header row - clickable to expand */}
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="shrink-0 text-muted-foreground">
          {expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />
          }
        </div>
        <div className="flex-1 grid grid-cols-[1.5fr_1fr_0.5fr_0.5fr_0.5fr_0.8fr_0.8fr_0.8fr_1fr] gap-2 items-center text-sm">
          <div>
            <span className="font-semibold">{shipment.invoice_number}</span>
            <span className="text-muted-foreground ml-2 text-xs">{shipment.bol_number || '-'}</span>
          </div>
          <div>
            <ShipmentStatusBadge status={currentStatus} size="sm" />
          </div>
          <div className="text-muted-foreground">
            {shipment.supplier}
          </div>
          <div className="text-center">{shipment.container_count}</div>
          <div className="text-center">
            {shipment.etd ? formatDate(shipment.etd) : '-'}
          </div>
          <div className="text-center">{shipment.eta ? formatDate(shipment.eta) : '-'}</div>
          <div className="text-right">
            ${(shipment.total_value || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-right">
            {(shipment.total_weight || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} lbs
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {shipment.po_numbers?.length || 0} PO{(shipment.po_numbers?.length || 0) !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-8 pb-6 space-y-4 bg-muted/10">
          {/* Status timeline - 5 stages */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Status Timeline</h4>
            <div className="flex items-center gap-2">
              {SHIPMENT_STATUS_ORDER.map((s, i) => {
                const statusIdx = SHIPMENT_STATUS_ORDER.indexOf(currentStatus)
                const isCompleted = i < statusIdx
                const isCurrent = s === currentStatus
                const isFuture = i > statusIdx

                return (
                  <div key={s} className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                        isCompleted && 'bg-green-500 border-green-500 text-white',
                        isCurrent && 'bg-blue-500 border-blue-500 text-white',
                        isFuture && 'bg-muted border-border text-muted-foreground'
                      )}
                    >
                      {isCompleted ? '\u2713' : i + 1}
                    </div>
                    <span className={cn(
                      'text-xs',
                      isCurrent && 'font-bold',
                      isFuture && 'text-muted-foreground'
                    )}>
                      {SHIPMENT_STATUS_LABELS[s]}
                    </span>
                    {i < SHIPMENT_STATUS_ORDER.length - 1 && (
                      <div className={cn(
                        'w-8 h-0.5',
                        i < statusIdx ? 'bg-green-500' : 'bg-border'
                      )} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Container status summary */}
          {ctSummary && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-sm font-semibold">
                  Container Status ({containerTracking.length} containers)
                </h4>
              </div>
              <div className="flex gap-2">
                {Object.entries(ctSummary).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-1">
                    <ShipmentStatusBadge status={status} size="sm" />
                    <span className="text-xs font-medium">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tracking details grid */}
          {tracking && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Tracking Details</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {tracking.cleared_date && (
                  <DetailItem icon={Clock} label="Cleared Date" value={formatDate(tracking.cleared_date)} />
                )}
                {tracking.delivered_date && (
                  <DetailItem icon={Package} label="Delivered Date" value={formatDate(tracking.delivered_date)} />
                )}
                {tracking.estimated_warehouse_date && (
                  <DetailItem icon={MapPin} label="Est. Warehouse Date" value={formatDate(tracking.estimated_warehouse_date)} />
                )}
                {tracking.lfd && (
                  <DetailItem icon={Clock} label="Last Free Day" value={formatDate(tracking.lfd)} highlight />
                )}
                {tracking.duty_amount !== null && tracking.duty_amount !== undefined && (
                  <DetailItem icon={DollarSign} label="Duty Amount" value={`$${tracking.duty_amount.toLocaleString()}`} />
                )}
                {tracking.entry_number && (
                  <DetailItem label="Entry Number" value={tracking.entry_number} />
                )}
                {tracking.carrier && (
                  <DetailItem icon={Truck} label="Carrier" value={tracking.carrier} />
                )}
                {tracking.warehouse && (
                  <DetailItem icon={MapPin} label="Warehouse" value={tracking.warehouse} />
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
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Containers & SKUs ({containers.length} items)</h4>
            </div>
            <div className="space-y-3">
              {Object.entries(containerGroups).map(([containerNum, items]) => {
                // Find container-level tracking for this container
                const ctTrack = containerTracking.find(ct => ct.container_number === containerNum)

                return (
                  <div key={containerNum} className="border rounded-lg p-3 bg-background">
                    <div className="flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{containerNum}</span>
                      <span className="text-xs text-muted-foreground">({items[0]?.container_type || '-'})</span>
                      {ctTrack && (
                        <ShipmentStatusBadge status={ctTrack.status} size="sm" />
                      )}
                      {ctTrack?.carrier && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {ctTrack.carrier}
                        </span>
                      )}
                      {ctTrack?.warehouse && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {ctTrack.warehouse}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto">{items.length} SKU{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Container-level delivery info */}
                    {ctTrack && (ctTrack.scheduled_delivery_date || ctTrack.delivered_date || ctTrack.picked_up_date) && (
                      <div className="flex gap-4 mb-2 text-xs text-muted-foreground">
                        {ctTrack.picked_up_date && (
                          <span>Picked up: {formatDate(ctTrack.picked_up_date)}</span>
                        )}
                        {ctTrack.scheduled_delivery_date && (
                          <span>Scheduled: {formatDate(ctTrack.scheduled_delivery_date)}</span>
                        )}
                        {ctTrack.delivered_date && (
                          <span>Delivered: {formatDate(ctTrack.delivered_date)}</span>
                        )}
                      </div>
                    )}
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1 px-2">SKU</th>
                          <th className="text-left py-1 px-2">PO</th>
                          <th className="text-right py-1 px-2">Qty</th>
                          <th className="text-right py-1 px-2">Unit Price</th>
                          <th className="text-right py-1 px-2">Total</th>
                          <th className="text-right py-1 px-2">Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="py-1 px-2 font-medium">{item.sku}</td>
                            <td className="py-1 px-2">{item.po_number || '-'}</td>
                            <td className="py-1 px-2 text-right">{item.quantity}</td>
                            <td className="py-1 px-2 text-right">
                              {item.unit_price ? `$${item.unit_price.toFixed(2)}` : '-'}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {item.total_amount ? `$${item.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                            </td>
                            <td className="py-1 px-2 text-right">
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
            <div>
              <h4 className="text-sm font-semibold mb-2">
                Status History
              </h4>
              <div className="space-y-2">
                {[...tracking.status_history].reverse().map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                    <div>
                      <span className="font-medium">
                        {entry.from_status ? `${entry.from_status} → ${entry.to_status}` : entry.to_status}
                      </span>
                      <span className="text-muted-foreground ml-2">
                        {entry.changed_at ? formatDateTime(entry.changed_at) : ''}
                      </span>
                      {entry.changed_by && (
                        <span className="text-muted-foreground ml-1">by {entry.changed_by}</span>
                      )}
                      {entry.notes && (
                        <p className="text-muted-foreground mt-0.5">{entry.notes}</p>
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
    <div className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-medium', highlight && 'text-amber-600')}>
          {value}
        </p>
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
