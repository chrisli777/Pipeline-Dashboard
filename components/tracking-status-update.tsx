'use client'

import { useState, useEffect } from 'react'
import {
  type ShipmentStatus,
  type ShipmentWithTracking,
  type ContainerTracking,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TRANSITIONS,
} from '@/lib/types'
import { ShipmentStatusBadge } from './shipment-status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ArrowRight, Loader2, Package, AlertCircle } from 'lucide-react'

const STATUS_FIELDS: Record<ShipmentStatus, string[]> = {
  ON_WATER: [],
  CLEARED: ['cleared_date', 'duty_amount', 'entry_number', 'broker', 'lfd'],
  DELIVERING: ['carrier', 'picked_up_date', 'warehouse', 'scheduled_delivery_date'],
  DELIVERED: ['delivered_date', 'wms_receipt_number', 'wms_received_qty'],
  CLOSED: [],
}

const FIELD_LABELS: Record<string, { label: string; type: string; placeholder: string }> = {
  cleared_date: { label: 'Clearance Date', type: 'date', placeholder: '' },
  duty_amount: { label: 'Duty Amount ($)', type: 'number', placeholder: '0.00' },
  entry_number: { label: 'Entry Number', type: 'text', placeholder: 'e.g., T81-9181606-5' },
  broker: { label: 'Customs Broker', type: 'text', placeholder: 'e.g., Air Tiger' },
  lfd: { label: 'Last Free Day (LFD)', type: 'date', placeholder: '' },
  carrier: { label: 'Trucking Carrier', type: 'text', placeholder: 'e.g., ABC Trucking' },
  picked_up_date: { label: 'Pickup Date', type: 'date', placeholder: '' },
  warehouse: { label: 'Destination Warehouse', type: 'text', placeholder: 'Kent / Moses Lake' },
  scheduled_delivery_date: { label: 'Scheduled Delivery Date', type: 'date', placeholder: '' },
  delivered_date: { label: 'Delivery Date', type: 'date', placeholder: '' },
  wms_receipt_number: { label: 'WMS Receipt #', type: 'text', placeholder: '' },
  wms_received_qty: { label: 'WMS Received Qty', type: 'number', placeholder: '0' },
}

interface TrackingStatusUpdateProps {
  shipment: ShipmentWithTracking
  open: boolean
  onOpenChange: (open: boolean) => void
  onStatusUpdated: () => void
}

export function TrackingStatusUpdate({
  shipment,
  open,
  onOpenChange,
  onStatusUpdated,
}: TrackingStatusUpdateProps) {
  const currentStatus = (shipment.tracking?.status || 'ON_WATER') as ShipmentStatus
  const allowedTransitions = SHIPMENT_TRANSITIONS[currentStatus] || []
  const nextStatus = allowedTransitions.length > 0 ? allowedTransitions[0] : null

  const isContainerLevel = nextStatus === 'DELIVERING' || nextStatus === 'DELIVERED'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [containerList, setContainerList] = useState<ContainerTracking[]>([])
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set())
  const [loadingContainers, setLoadingContainers] = useState(false)

  useEffect(() => {
    if (open && isContainerLevel) {
      setLoadingContainers(true)
      fetch(`/api/shipments/${shipment.id}/containers/tracking`)
        .then(res => res.json())
        .then(data => {
          if (data.containers) {
            const eligible = (data.containers as ContainerTracking[]).filter(ct => {
              if (nextStatus === 'DELIVERING') return ct.status === 'CLEARED'
              if (nextStatus === 'DELIVERED') return ct.status === 'DELIVERING'
              return false
            })
            setContainerList(eligible)
            setSelectedContainers(new Set(eligible.map(ct => ct.container_number)))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingContainers(false))
    }
  }, [open, isContainerLevel, shipment.id, nextStatus])

  useEffect(() => {
    if (open) {
      setFormData({})
      setNotes('')
      setError(null)
    }
  }, [open])

  if (!nextStatus) {
    return null
  }

  const fields = STATUS_FIELDS[nextStatus] || []

  const toggleContainer = (cn: string) => {
    setSelectedContainers(prev => {
      const next = new Set(prev)
      if (next.has(cn)) next.delete(cn)
      else next.add(cn)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedContainers.size === containerList.length) {
      setSelectedContainers(new Set())
    } else {
      setSelectedContainers(new Set(containerList.map(ct => ct.container_number)))
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)

    try {
      if (isContainerLevel) {
        if (selectedContainers.size === 0) {
          setError('Please select at least one container')
          setLoading(false)
          return
        }

        const updates: Record<string, unknown> = {
          status: nextStatus,
        }
        for (const field of fields) {
          const value = formData[field]
          if (value) {
            const fieldConfig = FIELD_LABELS[field]
            if (fieldConfig?.type === 'number') {
              updates[field] = parseFloat(value)
            } else {
              updates[field] = value
            }
          }
        }
        if (notes) updates.notes = notes

        const response = await fetch(`/api/shipments/${shipment.id}/containers/batch-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            container_numbers: Array.from(selectedContainers),
            updates,
          }),
        })

        const result = await response.json()

        if (!response.ok) {
          setError(result.error || 'Failed to update containers')
          return
        }

        const msg = result.message || `Updated ${result.updatedCount} containers`
        if (result.errors?.length) {
          setError(`${msg}. Some skipped: ${result.errors.join('; ')}`)
          setTimeout(() => {
            onOpenChange(false)
            onStatusUpdated()
          }, 2000)
          return
        }
      } else {
        const payload: Record<string, unknown> = {
          status: nextStatus,
          notes: notes || undefined,
        }

        for (const field of fields) {
          const value = formData[field]
          if (value) {
            const fieldConfig = FIELD_LABELS[field]
            if (fieldConfig?.type === 'number') {
              payload[field] = parseFloat(value)
            } else {
              payload[field] = value
            }
          }
        }

        const response = await fetch(`/api/shipments/${shipment.id}/tracking`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const result = await response.json()

        if (!response.ok) {
          setError(result.error || 'Failed to update status')
          return
        }
      }

      onOpenChange(false)
      setFormData({})
      setNotes('')
      setSelectedContainers(new Set())
      onStatusUpdated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            {isContainerLevel ? 'Update Container Status' : 'Update Shipment Status'}
          </DialogTitle>
          <DialogDescription>
            <span className="flex items-center gap-2 mt-2">
              <span className="font-medium text-slate-700">{shipment.invoice_number}</span>
              <span className="text-slate-400">|</span>
              <span className="text-slate-600">{shipment.supplier}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-3 bg-slate-50 rounded-lg">
          <ShipmentStatusBadge status={currentStatus} size="md" />
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <ShipmentStatusBadge status={nextStatus} size="md" />
        </div>

        {isContainerLevel && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Select Containers
                {nextStatus === 'DELIVERING' && (
                  <span className="text-slate-400 font-normal ml-1">{'(CLEARED \u2192 DELIVERING)'}</span>
                )}
                {nextStatus === 'DELIVERED' && (
                  <span className="text-slate-400 font-normal ml-1">{'(DELIVERING \u2192 DELIVERED)'}</span>
                )}
              </Label>
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={toggleAll}>
                {selectedContainers.size === containerList.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            {loadingContainers ? (
              <div className="flex items-center justify-center py-4 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading containers...
              </div>
            ) : containerList.length === 0 ? (
              <div className="flex items-center gap-2 py-3 px-3 bg-amber-50 text-amber-700 rounded-md text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                No containers eligible for this transition
              </div>
            ) : (
              <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                {containerList.map((ct) => (
                  <label
                    key={ct.container_number}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedContainers.has(ct.container_number)}
                      onCheckedChange={() => toggleContainer(ct.container_number)}
                    />
                    <Package className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">{ct.container_number}</span>
                    <span className="text-xs text-slate-400">{ct.container_type || ''}</span>
                    <ShipmentStatusBadge status={ct.status} size="sm" />
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4 mt-2">
          {fields.map((field) => {
            const config = FIELD_LABELS[field]
            if (!config) return null

            return (
              <div key={field} className="space-y-1.5">
                <Label htmlFor={field} className="text-sm">
                  {config.label}
                </Label>
                <Input
                  id={field}
                  type={config.type}
                  placeholder={config.placeholder}
                  value={formData[field] || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, [field]: e.target.value }))}
                  step={config.type === 'number' ? '0.01' : undefined}
                />
              </div>
            )
          })}

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-sm">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any relevant notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading || (isContainerLevel && selectedContainers.size === 0)}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isContainerLevel
              ? `Update ${selectedContainers.size} Container${selectedContainers.size !== 1 ? 's' : ''}`
              : `Update to ${SHIPMENT_STATUS_LABELS[nextStatus]}`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
