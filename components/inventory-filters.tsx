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
  selectedWarehouse: string
  onWarehouseChange: (value: string) => void
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
  selectedWarehouse,
  onWarehouseChange,
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

  // Derive all known vendors
  const allVendors = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) set.add(sku.supplierCode)
    })
    return Array.from(set).sort()
  }, [skus])

  // Vendors filtered by selected customer
  const vendors = useMemo(() => {
    if (selectedCustomer === 'all') return allVendors
    return allVendors.filter((v) => vendorToCustomer.get(v) === selectedCustomer)
  }, [allVendors, selectedCustomer, vendorToCustomer])

  // Warehouses filtered by selected customer + vendor
  const warehouses = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      if (!sku.warehouse) return
      if (selectedCustomer !== 'all' && sku.customerCode !== selectedCustomer) return
      if (selectedVendor !== 'all' && sku.supplierCode !== selectedVendor) return
      set.add(sku.warehouse)
    })
    return Array.from(set).sort()
  }, [skus, selectedCustomer, selectedVendor])

  // SKUs filtered by selected customer, vendor, and warehouse
  const filteredSkuOptions = useMemo(() => {
    return skus.filter((sku) => {
      if (selectedCustomer !== 'all' && sku.customerCode !== selectedCustomer) return false
      if (selectedVendor !== 'all' && sku.supplierCode !== selectedVendor) return false
      if (selectedWarehouse !== 'all' && sku.warehouse !== selectedWarehouse) return false
      return true
    })
  }, [skus, selectedCustomer, selectedVendor, selectedWarehouse])

  // When customer changes: reset vendor, warehouse, SKU downward
  const handleCustomerChange = (value: string) => {
    onCustomerChange(value)
    onVendorChange('all')
    onWarehouseChange('all')
    onSkuChange('all')
  }

  // When vendor changes: auto-sync customer upward, reset warehouse + SKU downward
  const handleVendorChange = (value: string) => {
    if (value !== 'all') {
      const parentCustomer = vendorToCustomer.get(value)
      if (parentCustomer && selectedCustomer !== parentCustomer) {
        onCustomerChange(parentCustomer)
      }
    }
    onVendorChange(value)
    onWarehouseChange('all')
    onSkuChange('all')
  }

  // When warehouse changes: auto-sync vendor + customer upward, reset SKU downward
  const handleWarehouseChange = (value: string) => {
    if (value !== 'all') {
      // Find a SKU in this warehouse to determine the parent vendor/customer
      const sample = skus.find((s) => s.warehouse === value)
      if (sample) {
        if (sample.supplierCode && selectedVendor === 'all') {
          onVendorChange(sample.supplierCode)
        }
        if (sample.customerCode && selectedCustomer !== sample.customerCode) {
          onCustomerChange(sample.customerCode)
        }
      }
    }
    onWarehouseChange(value)
    onSkuChange('all')
  }

  // When SKU changes: auto-sync warehouse, vendor, and customer upward
  const handleSkuChange = (value: string) => {
    if (value !== 'all') {
      const sku = skus.find((s) => s.id === value)
      if (sku) {
        if (sku.warehouse && selectedWarehouse !== sku.warehouse) {
          onWarehouseChange(sku.warehouse)
        }
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
    onWarehouseChange('all')
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

      {/* Tier 3: Warehouse */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Warehouse:</label>
        <Select value={selectedWarehouse} onValueChange={handleWarehouseChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select Warehouse" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses.map((wh) => (
              <SelectItem key={wh} value={wh}>
                {wh}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tier 4: SKU */}
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
