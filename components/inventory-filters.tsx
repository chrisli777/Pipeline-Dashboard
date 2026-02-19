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
  selectedVendor: string
  onVendorChange: (value: string) => void
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
  selectedVendor,
  onVendorChange,
  selectedSku,
  onSkuChange,
  weekRange,
  onWeekRangeChange,
  totalWeeks,
}: InventoryFiltersProps) {
  const weekOptions = Array.from({ length: totalWeeks }, (_, i) => i + 1)

  // All known customers (includes Clark even without SKUs yet)
  const ALL_CUSTOMERS = ['CLARK', 'GENIE']

  // Build vendor -> customer mapping from SKU data
  const vendorToCustomer = useMemo(() => {
    const map = new Map<string, string>()
    skus.forEach((sku) => {
      if (sku.supplierCode && sku.customerCode) {
        map.set(sku.supplierCode, sku.customerCode)
      }
    })
    return map
  }, [skus])

  // Derive all known vendors (unfiltered by customer, so vendor dropdown always shows all)
  const allVendors = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) set.add(sku.supplierCode)
    })
    return Array.from(set).sort()
  }, [skus])

  // Derive vendors filtered by selected customer (for display when a customer is selected)
  const vendors = useMemo(() => {
    if (selectedCustomer === 'all') return allVendors
    return allVendors.filter((v) => vendorToCustomer.get(v) === selectedCustomer)
  }, [allVendors, selectedCustomer, vendorToCustomer])

  // Derive SKUs filtered by selected customer and vendor
  const filteredSkuOptions = useMemo(() => {
    return skus.filter((sku) => {
      if (selectedCustomer !== 'all' && sku.customerCode !== selectedCustomer) return false
      if (selectedVendor !== 'all' && sku.supplierCode !== selectedVendor) return false
      return true
    })
  }, [skus, selectedCustomer, selectedVendor])

  // When customer changes, reset vendor and SKU
  const handleCustomerChange = (value: string) => {
    onCustomerChange(value)
    onVendorChange('all')
    onSkuChange('all')
  }

  // When vendor changes, auto-sync customer upward and reset SKU
  const handleVendorChange = (value: string) => {
    if (value !== 'all') {
      const parentCustomer = vendorToCustomer.get(value)
      if (parentCustomer && selectedCustomer !== parentCustomer) {
        onCustomerChange(parentCustomer)
      }
    }
    onVendorChange(value)
    onSkuChange('all')
  }

  // When SKU changes, auto-sync vendor and customer upward
  const handleSkuChange = (value: string) => {
    if (value !== 'all') {
      const sku = skus.find((s) => s.id === value)
      if (sku) {
        if (sku.supplierCode && selectedVendor !== sku.supplierCode) {
          onVendorChange(sku.supplierCode)
        }
        if (sku.customerCode && selectedCustomer !== sku.customerCode) {
          onCustomerChange(sku.customerCode)
        }
      }
    }
    onSkuChange(value)
  }

  const handleReset = () => {
    onCustomerChange('all')
    onVendorChange('all')
    onSkuChange('all')
    onWeekRangeChange({ start: 1, end: totalWeeks })
  }

  return (
    <div className="relative z-30 mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Filters:</span>
      </div>

      {/* Tier 1: Customer */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Customer:</label>
        <Select value={selectedCustomer} onValueChange={handleCustomerChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Select Customer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            {ALL_CUSTOMERS.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tier 2: Vendor (Supplier) */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Vendor:</label>
        <Select value={selectedVendor} onValueChange={handleVendorChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select Vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendors.map((code) => (
              <SelectItem key={code} value={code}>
                {code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tier 3: SKU */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">SKU:</label>
        <Select value={selectedSku} onValueChange={handleSkuChange}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select SKU" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All SKUs</SelectItem>
            {filteredSkuOptions.map((sku) => (
              <SelectItem key={sku.id} value={sku.id}>
                {sku.partModelNumber}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Week Range */}
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
