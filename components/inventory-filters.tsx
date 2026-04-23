'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { Filter, X, ChevronDown, Check } from 'lucide-react'
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
  selectedCustomers: string[]
  onCustomersChange: (value: string[]) => void
  selectedVendors: string[]
  onVendorsChange: (value: string[]) => void
  selectedWarehouses: string[]
  onWarehousesChange: (value: string[]) => void
  selectedSkus: string[]
  onSkusChange: (value: string[]) => void
  highlightedWeeks: number[]
  onHighlightedWeeksChange: (value: number[]) => void
  weekRange: { start: number; end: number }
  onWeekRangeChange: (range: { start: number; end: number }) => void
  totalWeeks: number
  userRole?: 'admin' | 'viewer'  // viewer can only see HX
}

// Multi-select dropdown component
function MultiSelect({
  label,
  options,
  selected,
  onChange,
  renderOption,
  width = 'w-[150px]',
}: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (value: string[]) => void
  renderOption?: (opt: { value: string; label: string }) => React.ReactNode
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleValue = (value: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value))
    } else {
      onChange([...selected, value])
    }
  }

  const displayText =
    selected.length === 0
      ? `All`
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label || selected[0]
        : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        className={`${width} flex h-9 items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background focus:outline-none focus:ring-1 focus:ring-ring`}
      >
        <span className="truncate text-foreground">{displayText}</span>
        <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-50 mt-1 max-h-[300px] min-w-[200px] overflow-auto rounded-md border border-border bg-popover p-1 shadow-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Select All / Clear */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (selected.length === options.length) {
                onChange([])
              } else {
                onChange(options.map((o) => o.value))
              }
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary">
              {selected.length === options.length && <Check className="h-3 w-3" />}
            </div>
            <span className="text-muted-foreground">
              {selected.length === options.length ? 'Clear all' : 'Select all'}
            </span>
          </button>
          <div className="my-1 h-px bg-border" />
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={(e) => toggleValue(opt.value, e)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex h-4 w-4 items-center justify-center rounded-sm border border-primary">
                {selected.includes(opt.value) && <Check className="h-3 w-3" />}
              </div>
              {renderOption ? renderOption(opt) : <span>{opt.label}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function InventoryFilters({
  skus,
  selectedCustomers,
  onCustomersChange,
  selectedVendors,
  onVendorsChange,
  selectedWarehouses,
  onWarehousesChange,
  selectedSkus,
  onSkusChange,
  highlightedWeeks,
  onHighlightedWeeksChange,
  weekRange,
  onWeekRangeChange,
  totalWeeks,
  userRole = 'admin',
}: InventoryFiltersProps) {
  const weekOptions = Array.from({ length: totalWeeks }, (_, i) => i + 1)

  // Build unique customer list from actual SKU data (including null as "Unassigned")
  const allCustomers = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      set.add(sku.customerCode || '__unassigned__')
    })
    return Array.from(set).sort((a, b) => {
      if (a === '__unassigned__') return 1
      if (b === '__unassigned__') return -1
      return a.localeCompare(b)
    })
  }, [skus])

  // Build vendor -> customer mapping (include null as unassigned)
  const vendorToCustomer = useMemo(() => {
    const map = new Map<string, string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) {
        map.set(sku.supplierCode, sku.customerCode || '__unassigned__')
      }
    })
    return map
  }, [skus])

  // All vendors
  const allVendors = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) set.add(sku.supplierCode)
    })
    return Array.from(set).sort()
  }, [skus])

  // Vendors filtered by selected customers
  const vendors = useMemo(() => {
    if (selectedCustomers.length === 0) return allVendors
    return allVendors.filter((v) => {
      const cust = vendorToCustomer.get(v)
      return cust && selectedCustomers.includes(cust)
    })
  }, [allVendors, selectedCustomers, vendorToCustomer])

  // Warehouses filtered by selected customers + vendors
  const warehouses = useMemo(() => {
    const set = new Set<string>()
    skus.forEach((sku) => {
      if (!sku.warehouse) return
      if (selectedCustomers.length > 0 && !selectedCustomers.includes(sku.customerCode || '__unassigned__')) return
      if (selectedVendors.length > 0 && !selectedVendors.includes(sku.supplierCode || '')) return
      set.add(sku.warehouse)
    })
    return Array.from(set).sort()
  }, [skus, selectedCustomers, selectedVendors])

  // SKUs filtered by selected customers, vendors, warehouses
  const filteredSkuOptions = useMemo(() => {
    return skus.filter((sku) => {
      if (selectedCustomers.length > 0 && !selectedCustomers.includes(sku.customerCode || '__unassigned__')) return false
      if (selectedVendors.length > 0 && !selectedVendors.includes(sku.supplierCode || '')) return false
      if (selectedWarehouses.length > 0 && !selectedWarehouses.includes(sku.warehouse || '')) return false
      return true
    })
  }, [skus, selectedCustomers, selectedVendors, selectedWarehouses])

  const handleReset = () => {
    onCustomersChange([])
    onVendorsChange([])
    onWarehousesChange([])
    onSkusChange([])
    onHighlightedWeeksChange([])
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
        <MultiSelect
          label="Customer"
          options={allCustomers.map((c) => ({ 
            value: c, 
            label: c === '__unassigned__' ? 'Unassigned' : c 
          }))}
          selected={selectedCustomers}
          onChange={onCustomersChange}
          width="w-[150px]"
        />
      </div>

  {/* Tier 2: Vendor */}
  <div className="flex items-center gap-2">
  <label className="text-sm text-muted-foreground">Vendor:</label>
  {userRole === 'viewer' ? (
    <div className="px-3 py-1.5 bg-blue-100 text-blue-800 rounded text-sm font-medium">
      HX (locked)
    </div>
  ) : (
    <MultiSelect
      label="Vendor"
      options={vendors.map((v) => ({ value: v, label: v }))}
      selected={selectedVendors}
      onChange={onVendorsChange}
      width="w-[140px]"
    />
  )}
  </div>

      {/* Tier 3: Warehouse */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Warehouse:</label>
        <MultiSelect
          label="Warehouse"
          options={warehouses.map((w) => ({ value: w, label: w }))}
          selected={selectedWarehouses}
          onChange={onWarehousesChange}
          width="w-[180px]"
        />
      </div>

      {/* Tier 4: SKU */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">SKU:</label>
        <MultiSelect
          label="SKU"
          options={filteredSkuOptions.map((sku) => ({ value: sku.id, label: sku.partModelNumber }))}
          selected={selectedSkus}
          onChange={onSkusChange}
          width="w-[280px]"
        />
      </div>

      {/* Tier 5: Highlighted Weeks */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted-foreground">Week:</label>
        <MultiSelect
          label="Week"
          options={weekOptions.map((w) => ({ value: w.toString(), label: `W${w}` }))}
          selected={highlightedWeeks.map(String)}
          onChange={(vals) => onHighlightedWeeksChange(vals.map(Number).sort((a, b) => a - b))}
          width="w-[140px]"
        />
      </div>

      {/* Week Range (keep as single select) */}
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
