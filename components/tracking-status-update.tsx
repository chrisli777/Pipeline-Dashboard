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

// Fields to show for each target status
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

  // Container-level operations: CLEARED->DELIVERING or DELIVERING->DELIVERED
  const isContainerLevel = nextStatus === 'DELIVERING' || nextStatus === 'DELIVERED'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState('')
  const [containerList, setContainerList] = useState<ContainerTracking[]>([])
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set())
  const [loadingContainers, setLoadingContainers] = useState(false)

  // Fetch containers when dialog opens for container-level operations
  useEffect(() => {
    if (open && isContainerLevel) {
      setLoadingContainers(true)
      fetch(`/api/shipments/${shipment.id}/containers/tracking`)
        .then(res => res.json())
        .then(data => {
          if (data.containers) {
            // Only show containers that can transition
            const eligible = (data.containers as ContainerTracking[]).filter(ct => {
              if (nextStatus === 'DELIVERING') return ct.status === 'CLEARED'
              if (nextStatus === 'DELIVERED') return ct.status === 'DELIVERING'
              return false
            })
            setContainerList(eligible)
            // Select all by default
            setSelectedContainers(new Set(eligible.map(ct => ct.container_number)))
          }
        })
        .catch(console.error)
        .finally(() => setLoadingContainers(false))
    }
  }, [open, isContainerLevel, shipment.id, nextStatus])

  // Reset form when dialog opens/closes
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
        // Container-level: batch update selected containers
        if (selectedContainers.size === 0) {
          setError('Please select at least one container')
          setLoading(false)
          return
        }

        const updates: Record<string, any> = {
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

        // Show success info
        const msg = result.message || `Updated ${result.updatedCount} containers`
        if (result.errors?.length) {
          setError(`${msg}. Some skipped: ${result.errors.join('; ')}`)
          // Still close after a delay since partial success
          setTimeout(() => {
            onOpenChange(false)
            onStatusUpdated()
          }, 2000)
          return
        }
      } else {
        // Shipment-level: ON_WATER->CLEARED or DELIVERED->CLOSED
        const payload: Record<string, any> = {
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

      // Success
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
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isContainerLevel ? 'Update Container Status' : 'Update Shipment Status'}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium">{shipment.invoice_number}</span>
            {' | '}
            <span>{shipment.supplier}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Status transition indicator */}
        <div className="flex items-center justify-center gap-3 py-3">
          <ShipmentStatusBadge status={currentStatus} size="lg" />
          <ArrowRight className="h-5 w-5 text-muted-foreground" />
          <ShipmentStatusBadge status={nextStatus} size="lg" />
        </div>

        {/* Container selection for container-level operations */}
        {isContainerLevel && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">
                Select Containers
                {nextStatus === 'DELIVERING' && (
                  <span className="text-xs text-muted-foreground ml-1">(CLEARED → DELIVERING)</span>
                )}
                {nextStatus === 'DELIVERED' && (
                  <span className="text-xs text-muted-foreground ml-1">(DELIVERING → DELIVERED)</span>
                )}
              </Label>
              <Button variant="ghost" size="sm" onClick={toggleAll}>
                {selectedContainers.size === containerList.length ? 'Deselect All' : 'Select All'}
              </Button>
            </div>

            {loadingContainers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading containers...
              </div>
            ) : containerList.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <AlertCircle className="h-4 w-4" />
                No containers eligible for this transition
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto border rounded-md p-2">
                {containerList.map((ct) => (
                  <label key={ct.container_number} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                    <Checkbox
                      checked={selectedContainers.has(ct.container_number)}
                      onCheckedChange={() => toggleContainer(ct.container_number)}
                    />
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{ct.container_number}</span>
                      <span className="text-xs text-muted-foreground">{ct.container_type || ''}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Dynamic form fields */}
        <div className="space-y-3">
          {fields.map((field) => {
            const config = FIELD_LABELS[field]
            if (!config) return null

            return (
              <div key={field} className="space-y-1">
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

          <div className="space-y-1">
            <Label className="text-sm">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
