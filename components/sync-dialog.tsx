'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SKUData } from '@/lib/types'

// Syncable fields (excluding defect, actualInventory, weeksOnHand)
// Customer Forecast is synced separately from the Customer Forecast page
const SYNCABLE_FIELDS = [
  { id: 'actualConsumption', label: 'Actual Consumption' },
  { id: 'etd', label: 'ETD' },
  { id: 'eta', label: 'ETA' },
  { id: 'ata', label: 'ATA' },
] as const

type SyncableField = typeof SYNCABLE_FIELDS[number]['id']

export interface SyncConfig {
  skuIds: string[] // 'all' or specific SKU IDs
  weekStart: number
  weekEnd: number
  fields: SyncableField[]
}

interface SyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skus: SKUData[]
  onSync: (config: SyncConfig) => void
  syncing: boolean
}

// Calculate the week number for the last Friday before today
function getLastFridayWeek(): number {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sunday, 1=Monday, ..., 5=Friday, 6=Saturday
  
  let daysToLastFriday: number
  if (dayOfWeek === 5) {
    daysToLastFriday = 7 // Last week's Friday
  } else if (dayOfWeek === 6) {
    daysToLastFriday = 1
  } else {
    daysToLastFriday = dayOfWeek + 2
  }
  
  const lastFriday = new Date(today)
  lastFriday.setDate(today.getDate() - daysToLastFriday)
  
  // Week 1 Monday is Dec 29, 2025
  const week1Monday = new Date(2025, 11, 29)
  const diffTime = lastFriday.getTime() - week1Monday.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const weekNumber = Math.floor(diffDays / 7) + 1
  
  return Math.max(1, weekNumber)
}

export function SyncDialog({ open, onOpenChange, skus, onSync, syncing }: SyncDialogProps) {
  const defaultWeek = useMemo(() => getLastFridayWeek(), [])
  
  const [selectedSkus, setSelectedSkus] = useState<string[]>(['all'])
  const [weekStart, setWeekStart] = useState<number>(defaultWeek)
  const [weekEnd, setWeekEnd] = useState<number>(defaultWeek)
  const [selectedFields, setSelectedFields] = useState<SyncableField[]>(SYNCABLE_FIELDS.map(f => f.id))

  // Generate week options
  const weekOptions = useMemo(() => {
    return Array.from({ length: 53 }, (_, i) => i + 1)
  }, [])

  const handleSkuChange = (skuId: string, checked: boolean) => {
    if (skuId === 'all') {
      setSelectedSkus(checked ? ['all'] : [])
    } else {
      setSelectedSkus(prev => {
        const newSkus = prev.filter(id => id !== 'all')
        if (checked) {
          return [...newSkus, skuId]
        } else {
          return newSkus.filter(id => id !== skuId)
        }
      })
    }
  }

  const handleFieldChange = (fieldId: SyncableField, checked: boolean) => {
    setSelectedFields(prev => {
      if (checked) {
        return [...prev, fieldId]
      } else {
        return prev.filter(id => id !== fieldId)
      }
    })
  }

  const handleSync = () => {
    const skuIds = selectedSkus.includes('all') 
      ? skus.map(s => s.id) 
      : selectedSkus
    
    onSync({
      skuIds,
      weekStart,
      weekEnd,
      fields: selectedFields,
    })
  }

  const isAllSkusSelected = selectedSkus.includes('all')
  const canSync = selectedFields.length > 0 && (isAllSkusSelected || selectedSkus.length > 0) && weekStart <= weekEnd

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Sync Data</DialogTitle>
          <DialogDescription>
            {"Select which data to sync. Default syncs all SKUs for last Friday's week only."}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          {/* Week Range Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Week Range</Label>
            <div className="flex items-center gap-2">
              <Select 
                value={weekStart.toString()} 
                onValueChange={(v) => setWeekStart(parseInt(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Start Week" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(week => (
                    <SelectItem key={week} value={week.toString()}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-muted-foreground">to</span>
              <Select 
                value={weekEnd.toString()} 
                onValueChange={(v) => setWeekEnd(parseInt(v))}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="End Week" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map(week => (
                    <SelectItem key={week} value={week.toString()}>
                      Week {week}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SKU Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">SKUs</Label>
            <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto border rounded-md p-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="sku-all" 
                  checked={isAllSkusSelected}
                  onCheckedChange={(checked) => handleSkuChange('all', !!checked)}
                />
                <Label htmlFor="sku-all" className="text-sm font-medium">All SKUs</Label>
              </div>
              {skus.map(sku => (
                <div key={sku.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`sku-${sku.id}`}
                    checked={isAllSkusSelected || selectedSkus.includes(sku.id)}
                    disabled={isAllSkusSelected}
                    onCheckedChange={(checked) => handleSkuChange(sku.id, !!checked)}
                  />
                  <Label htmlFor={`sku-${sku.id}`} className="text-sm">{sku.id}</Label>
                </div>
              ))}
            </div>
          </div>

          {/* Field Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Data Fields</Label>
            <div className="grid grid-cols-2 gap-2 border rounded-md p-2">
              {SYNCABLE_FIELDS.map(field => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`field-${field.id}`}
                    checked={selectedFields.includes(field.id)}
                    onCheckedChange={(checked) => handleFieldChange(field.id, !!checked)}
                  />
                  <Label htmlFor={`field-${field.id}`} className="text-sm">{field.label}</Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={syncing}>
            Cancel
          </Button>
          <Button 
            onClick={handleSync} 
            disabled={!canSync || syncing}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {syncing ? 'Syncing...' : 'Sync'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
