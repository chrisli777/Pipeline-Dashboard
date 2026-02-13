'use client'

import { useMemo } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SKUData } from '@/lib/types'

interface InventoryFiltersProps {
  skus: SKUData[]
  selectedCustomer: string
  onCustomerChange: (value: string) => void
  selectedSku: string
  onSkuChange: (value: string) => void
  weekRange: { start: number; end: number }
  onWeekRangeChange: (range: { start: number; end: number }) => void
  totalWeeks: number
}

export function InventoryFilters({
  skus,
  selectedCustomer,
  onCustomerChange,
  selectedSku,
  onSkuChange,
  weekRange,
  onWeekRangeChange,
  totalWeeks,
}: InventoryFiltersProps) {
  const weekOptions = Array.from({ length: totalWeeks }, (_, i) => i + 1)

  // Get unique customer/supplier codes from all SKUs
  const customers = useMemo(() => {
    const codes = new Set<string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) codes.add(sku.supplierCode)
    })
    return Array.from(codes).sort()
  }, [skus])

  // Filter SKUs shown in dropdown based on selected customer
  const availableSkus = useMemo(() => {
    if (selectedCustomer === 'all') return skus
    return skus.filter((sku) => sku.supplierCode === selectedCustomer)
  }, [skus, selectedCustomer])

  const handleReset = () => {
    onCustomerChange('all')
    onSkuChange('all')
    onWeekRangeChange({ start: 1, end: totalWeeks })
  }

  return (
    <div className="relative z-30 mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Filters:</span>
      </div>

      {/* Customer filter - controls which SKUs appear in the SKU dropdown */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Customer:</label>
        <Select value={selectedCustomer} onValueChange={onCustomerChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Customers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {customers.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* SKU filter - filtered by selected customer */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">SKU:</label>
        <Select value={selectedSku} onValueChange={onSkuChange}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select SKU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All SKUs</SelectItem>
            {availableSkus.map((sku) => (
              <SelectItem key={sku.id} value={sku.id}>
                {sku.partModelNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Week Range:</label>
        <Select
          value={weekRange.start.toString()}
          onValueChange={(v) => onWeekRangeChange({ ...weekRange, start: parseInt(v) })}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekOptions
              .filter((w) => w <= weekRange.end)
              .map((week) => (
                <SelectItem key={week} value={week.toString()}>
                  Week {week}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">to</span>
        <Select
          value={weekRange.end.toString()}
          onValueChange={(v) => onWeekRangeChange({ ...weekRange, end: parseInt(v) })}
        >
          <SelectTrigger className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {weekOptions
              .filter((w) => w >= weekRange.start)
              .map((week) => (
                <SelectItem key={week} value={week.toString()}>
                  Week {week}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <Button variant="outline" size="sm" onClick={handleReset} className="ml-auto bg-transparent">
        <X className="mr-1 h-4 w-4" />
        Reset
      </Button>
    </div>
  )
}
