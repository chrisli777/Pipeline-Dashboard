'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { Package, Download, RefreshCw, Loader2, Save, RefreshCcw, CloudDownload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InventoryAlertBar } from '@/components/inventory-alert-bar'
import { InventoryFilters } from '@/components/inventory-filters'
import { InventoryTable } from '@/components/inventory-table'
import { AIChat } from '@/components/ai-chat'
import { SyncDialog, SyncConfig } from '@/components/sync-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SKUData, InventoryAlert, WeekData } from '@/lib/types'

const TOTAL_WEEKS = 53 // Full year (Week 1: Jan 4 to Week 53: Jan 3)

// Moses Lake warehouse SKUs (HX) - use env token
const MOSES_LAKE_HX_SKUS = ['1272762', '1272913', '61415', '824433']

// Kent warehouse SKU (HX) - needs separate token
const KENT_HX_SKUS = ['1282199']

// Determine which warehouse token a SKU needs
function getSkuWarehouse(skuId: string, supplierCode: string | null): 'moses_lake' | 'kent_hx' | 'kent_amc' {
  if (KENT_HX_SKUS.includes(skuId)) return 'kent_hx'
  if (supplierCode === 'AMC') return 'kent_amc'
  return 'moses_lake' // default: Moses Lake HX, uses env token
}

// Track pending changes
interface PendingChange {
  skuId: string
  weekNumber: number
  field: keyof WeekData
  value: number | null
}

// Transform database data to frontend format
// Calculate weeks on hand: inventory / AVG(consumption from -4 weeks to +8 weeks, including current week = 13 weeks total)
function calculateWeeksOnHand(weeks: WeekData[], currentWeekIndex: number): number {
  const currentInventory = weeks[currentWeekIndex]?.actualInventory ?? 0
  
  // Get consumption from 4 weeks before to 8 weeks after (including current week = 13 weeks total)
  // -4, -3, -2, -1, current, +1, +2, +3, +4, +5, +6, +7, +8
  const startIndex = Math.max(0, currentWeekIndex - 4)
  const endIndex = Math.min(weeks.length - 1, currentWeekIndex + 8)
  
  let totalConsumption = 0
  const weeksCount = 13 // Fixed 13 weeks for averaging
  
  for (let i = startIndex; i <= endIndex; i++) {
    const consumption = weeks[i]?.actualConsumption ?? weeks[i]?.customerForecast ?? 0
    totalConsumption += consumption
  }
  
  // Calculate average over 13 weeks
  const avgConsumption = totalConsumption / weeksCount
  
  if (avgConsumption <= 0) {
    return currentInventory > 0 ? 999 : 0
  }
  
  return parseFloat((currentInventory / avgConsumption).toFixed(2))
}

function transformDatabaseData(inventoryData: any[]): SKUData[] {
  const skuMap = new Map<string, SKUData & { allWeeks: WeekData[] }>()

  inventoryData.forEach((row) => {
    if (!skuMap.has(row.sku_id)) {
      skuMap.set(row.sku_id, {
        id: row.sku_id,
        partModelNumber: row.part_model,
        description: row.description || '',
        category: row.category || 'COUNTERWEIGHT',
        supplierCode: row.supplier_code || null,
        weeks: [],
        allWeeks: [], // Include historical weeks for calculation
      })
    }

    const sku = skuMap.get(row.sku_id)!
    
    // Format week date - show Friday of the week (week_start_date is Sunday, Friday is 2 days before)
    const weekDate = new Date(row.week_start_date)
    weekDate.setDate(weekDate.getDate() - 1)
    const month = weekDate.toLocaleDateString('en-US', { month: 'short' })
    const day = weekDate.getDate()
    const weekOf = `${month} ${day}`

    sku.allWeeks.push({
      weekNumber: row.week_number,
      weekOf,
      customerForecast: row.customer_forecast !== null ? Number(row.customer_forecast) : null,
      actualConsumption: row.actual_consumption !== null ? Number(row.actual_consumption) : Number(row.customer_forecast),
      etd: row.etd !== null ? Number(row.etd) : null,
      eta: row.ata !== null ? Number(row.ata) : null,
      inTransit: row.in_transit !== null && row.in_transit !== undefined ? Number(row.in_transit) : null,
      defect: row.defect !== null ? Number(row.defect) : null,
      actualInventory: row.actual_inventory !== null ? Number(row.actual_inventory) : null,
      weeksOnHand: 0, // Will be calculated after sorting
    })
  })

  // Sort weeks within each SKU and calculate weeks on hand
  skuMap.forEach((sku) => {
    // Sort all weeks including historical data
    sku.allWeeks.sort((a, b) => a.weekNumber - b.weekNumber)
    
    // Apply defect default: if defect is null/0, inherit from previous week
    for (let i = 1; i < sku.allWeeks.length; i++) {
      const currentWeek = sku.allWeeks[i]
      const prevWeek = sku.allWeeks[i - 1]
      if (currentWeek.defect === null || currentWeek.defect === 0) {
        currentWeek.defect = prevWeek.defect
      }
    }
    
    // Calculate actual inventory for display weeks starting from week 2
    // Formula: actualInventory = prevWeek.actualInventory - actualConsumption + ATA
    // Week 1's actualInventory is the starting point (manually set in database)
    // Only calculate if the database value is null (not manually set)
    // Find the index of week 1 (first display week)
    const week1Index = sku.allWeeks.findIndex(w => w.weekNumber === 1)
    if (week1Index >= 0) {
      // Start from week 2 onwards (week1Index + 1)
      for (let i = week1Index + 1; i < sku.allWeeks.length; i++) {
        const prevWeek = sku.allWeeks[i - 1]
        const currentWeek = sku.allWeeks[i]
        // Only calculate if actualInventory was not manually set in database
        // We check if the database had a null value by looking at the original data
        const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
        const ata = currentWeek.eta ?? 0
        const prevInventory = prevWeek.actualInventory ?? 0
        // Always recalculate based on formula - this is the intended behavior
        // The formula chains from Week 1's manually set value
        currentWeek.actualInventory = prevInventory - consumption + ata
      }
    }
    
    // Calculate weeks on hand for each week using rolling average (including historical data)
    sku.allWeeks.forEach((week, index) => {
      week.weeksOnHand = calculateWeeksOnHand(sku.allWeeks, index)
    })
    
    // Only keep weeks >= 1 for display (filter out historical weeks -3, -2, -1, 0)
    sku.weeks = sku.allWeeks.filter(w => w.weekNumber >= 1)
  })

  // Remove allWeeks from the final result
  return Array.from(skuMap.values()).map(({ allWeeks, ...sku }) => sku)
}

export function PipelineDashboard() {
  const [skus, setSkus] = useState<SKUData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncDialogOpen, setSyncDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedSku, setSelectedSku] = useState<string>('all')
  const [weekRange, setWeekRange] = useState({ start: 1, end: 53 })
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Kent warehouse token states
  const [tokenDialogOpen, setTokenDialogOpen] = useState(false)
  const [kentHxToken, setKentHxToken] = useState('')
  const [kentAmcToken, setKentAmcToken] = useState('')
  const [needsKentHx, setNeedsKentHx] = useState(false)
  const [needsKentAmc, setNeedsKentAmc] = useState(false)
  const pendingSyncConfigRef = useRef<SyncConfig | null>(null)

  // Fetch data from Supabase with automatic retry on failure
  const fetchData = useCallback(async (retryCount = 0): Promise<void> => {
    if (retryCount === 0) {
      setLoading(true)
      setError(null)
    }
    try {
      // Fetch inventory data and in-transit data in parallel
      const [inventoryRes, inTransitRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/inventory/in-transit'),
      ])

      // Auto-retry on server errors (429, 500, 502, 503, 504)
      if (inventoryRes.status >= 429 && retryCount < 5) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)))
        return fetchData(retryCount + 1)
      }

      if (!inventoryRes.ok) {
        throw new Error(`Server error: ${inventoryRes.status}`)
      }

      const data = await inventoryRes.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Parse in-transit invoice data for tooltips
      let inTransitInvoiceMap: Map<string, Map<number, string[]>> | undefined
      if (inTransitRes.ok) {
        const inTransitData = await inTransitRes.json()
        if (inTransitData.inTransitData) {
          // Build map: sku_id -> week -> invoice_numbers[]
          inTransitInvoiceMap = new Map()
          for (const row of inTransitData.inTransitData) {
            if (!row.sku_id) continue
            if (!inTransitInvoiceMap.has(row.sku_id)) {
              inTransitInvoiceMap.set(row.sku_id, new Map())
            }
            const weekMap = inTransitInvoiceMap.get(row.sku_id)!
            const existing = weekMap.get(row.expected_week) || []
            weekMap.set(row.expected_week, [...existing, ...(row.invoice_numbers || [])])
          }
        }
      }

      const transformedData = transformDatabaseData(data.inventoryData || [])

      // Merge in-transit invoice info into transformed data
      if (inTransitInvoiceMap) {
        for (const sku of transformedData) {
          const weekMap = inTransitInvoiceMap.get(sku.id)
          if (!weekMap) continue
          for (const week of sku.weeks) {
            const invoices = weekMap.get(week.weekNumber)
            if (invoices && invoices.length > 0) {
              week.inTransitInvoices = [...new Set(invoices)] // deduplicate
            }
          }
        }
      }

      setSkus(transformedData)
      setLoading(false)
    } catch (err) {
      // Auto-retry on network errors (fetch failed, etc.)
      if (retryCount < 5) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)))
        return fetchData(retryCount + 1)
      }
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
      setLoading(false)
    }
  }, [])

  // Load data on mount
  useEffect(() => {
    fetchData()
  }, [fetchData, getTokenForSku])

  // Handle token dialog confirmation
  const handleTokenConfirm = useCallback(() => {
    if (needsKentHx && !kentHxToken) return
    if (needsKentAmc && !kentAmcToken) return
    const config = pendingSyncConfigRef.current
    if (config) {
      pendingSyncConfigRef.current = null
      executeSync(config)
    }
  }, [kentHxToken, kentAmcToken, needsKentHx, needsKentAmc, executeSync])


    skus.forEach((sku) => {
      // Track if we've already found the first problem for each severity
      let foundCritical = false
      let foundWarning = false
      let foundLow = false
      
      // Weeks are already sorted by weekNumber, so we iterate in order
      for (const week of sku.weeks) {
        // Only show alerts for Week 1 and onwards
        if (week.weekNumber < 1 || week.weeksOnHand === null) continue
        
        if (week.weeksOnHand < 0 && !foundCritical) {
          alertList.push({
            skuId: sku.id,
            partModelNumber: sku.partModelNumber,
            weekNumber: week.weekNumber,
            weekOf: week.weekOf,
            weeksOnHand: week.weeksOnHand,
            severity: 'critical',
          })
          foundCritical = true
        } else if (week.weeksOnHand >= 0 && week.weeksOnHand < 2 && !foundWarning) {
          alertList.push({
            skuId: sku.id,
            partModelNumber: sku.partModelNumber,
            weekNumber: week.weekNumber,
            weekOf: week.weekOf,
            weeksOnHand: week.weeksOnHand,
            severity: 'warning',
          })
          foundWarning = true
        } else if (week.weeksOnHand >= 2 && week.weeksOnHand < 4 && !foundLow) {
          alertList.push({
            skuId: sku.id,
            partModelNumber: sku.partModelNumber,
            weekNumber: week.weekNumber,
            weekOf: week.weekOf,
            weeksOnHand: week.weeksOnHand,
            severity: 'low',
          })
          foundLow = true
        }
        
        // Stop early if we've found all three types
        if (foundCritical && foundWarning && foundLow) break
      }
    })
    
    return alertList
  }, [skus])

  // Derive unique customer (supplier) codes
  const customers = useMemo(() => {
    const codes = new Set<string>()
    skus.forEach((sku) => {
      if (sku.supplierCode) codes.add(sku.supplierCode)
    })
    return Array.from(codes).sort()
  }, [skus])

  // SKUs filtered by customer selection (used for SKU dropdown options)
  const customerFilteredSkus = useMemo(() => {
    if (selectedCustomer === 'all') return skus
    return skus.filter((sku) => sku.supplierCode === selectedCustomer)
  }, [skus, selectedCustomer])

  // Reset SKU selection when customer changes
  const handleCustomerChange = useCallback((value: string) => {
    setSelectedCustomer(value)
    setSelectedSku('all') // reset SKU when customer changes
  }, [])

  // Filter SKUs based on both customer and SKU selection
  const filteredSkus = useMemo(() => {
    let filtered = customerFilteredSkus
    if (selectedSku !== 'all') {
      filtered = filtered.filter((sku) => sku.id === selectedSku)
    }
    return filtered
  }, [customerFilteredSkus, selectedSku])

  // Handle data changes - update locally and track pending changes
  const handleDataChange = useCallback(
    (skuId: string, weekNumber: number, field: keyof WeekData, value: number | null) => {
      // Update the UI locally
      setSkus((prevSkus) =>
        prevSkus.map((sku) => {
          if (sku.id !== skuId) return sku
          
          const updatedWeeks = sku.weeks.map((week) => {
            if (week.weekNumber !== weekNumber) return week
            return { ...week, [field]: value }
          })
          
          // If changing actualInventory for week 1, or changing consumption/ATA,
          // recalculate actualInventory for subsequent weeks
          if (field === 'actualInventory' && weekNumber === 1) {
            // Recalculate all weeks from week 2 onwards
            for (let i = 1; i < updatedWeeks.length; i++) {
              const prevWeek = updatedWeeks[i - 1]
              const currentWeek = updatedWeeks[i]
              const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
              const ata = currentWeek.eta ?? 0
              const prevInventory = prevWeek.actualInventory ?? 0
              currentWeek.actualInventory = prevInventory - consumption + ata
            }
          } else if (field === 'actualConsumption' || field === 'eta' || field === 'customerForecast') {
            // Recalculate actualInventory from the changed week onwards
            const changedIndex = updatedWeeks.findIndex(w => w.weekNumber === weekNumber)
            if (changedIndex >= 0) {
              for (let i = Math.max(1, changedIndex); i < updatedWeeks.length; i++) {
                const prevWeek = updatedWeeks[i - 1]
                const currentWeek = updatedWeeks[i]
                const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
                const ata = currentWeek.eta ?? 0
                const prevInventory = prevWeek.actualInventory ?? 0
                currentWeek.actualInventory = prevInventory - consumption + ata
              }
            }
          }
          
          // Recalculate weeks on hand for this SKU
          updatedWeeks.forEach((week, index) => {
            week.weeksOnHand = calculateWeeksOnHand(updatedWeeks, index)
          })
          
          return { ...sku, weeks: updatedWeeks }
        })
      )

      // Track the pending change
      setPendingChanges((prev) => {
        // Remove any existing change for the same cell
        const filtered = prev.filter(
          (c) => !(c.skuId === skuId && c.weekNumber === weekNumber && c.field === field)
        )
        return [...filtered, { skuId, weekNumber, field, value }]
      })
      setHasUnsavedChanges(true)
    },
    []
  )

  // Save all pending changes to database
  const handleSave = useCallback(async () => {
    if (pendingChanges.length === 0) return

    setSaving(true)
    try {
      // Save all changes in parallel
      const savePromises = pendingChanges.map((change) =>
        fetch('/api/inventory/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            skuId: change.skuId,
            weekNumber: change.weekNumber,
            field: change.field,
            value: change.value,
          }),
        }).then((res) => res.json())
      )

      const results = await Promise.all(savePromises)
      
      // Check for errors
      const errors = results.filter((r) => r.error)
      if (errors.length > 0) {
        throw new Error(`Failed to save ${errors.length} changes: ${errors.map((e: { error: string }) => e.error).join(', ')}`)
      }

      // Clear pending changes and refresh data
      setPendingChanges([])
      setHasUnsavedChanges(false)
      await fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }, [pendingChanges, fetchData])

  // Get the correct WMS token for a SKU based on its warehouse
  const getTokenForSku = useCallback((skuId: string): string | undefined => {
    const sku = skus.find(s => s.id === skuId)
    const warehouse = getSkuWarehouse(skuId, sku?.supplierCode || null)
    if (warehouse === 'kent_hx') return kentHxToken || undefined
    if (warehouse === 'kent_amc') return kentAmcToken || undefined
    return undefined // Moses Lake uses env token (server-side)
  }, [skus, kentHxToken, kentAmcToken])

  // Check if Kent tokens are needed before syncing
  const handleSync = useCallback(async (config: SyncConfig) => {
    // Check if any consumption sync requires Kent warehouse tokens
    const hasConsumption = config.fields.includes('actualConsumption')
    const hasAta = config.fields.includes('ata')
    if (hasConsumption || hasAta) {
      let needsHx = false
      let needsAmc = false
      for (const skuId of config.skuIds) {
        const sku = skus.find(s => s.id === skuId)
        const warehouse = getSkuWarehouse(skuId, sku?.supplierCode || null)
        if (warehouse === 'kent_hx') needsHx = true
        if (warehouse === 'kent_amc') needsAmc = true
      }
      // If Kent tokens are needed and not yet provided, show the token dialog
      if ((needsHx && !kentHxToken) || (needsAmc && !kentAmcToken)) {
        setNeedsKentHx(needsHx && !kentHxToken)
        setNeedsKentAmc(needsAmc && !kentAmcToken)
        pendingSyncConfigRef.current = config
        setSyncDialogOpen(false)
        setTokenDialogOpen(true)
        return
      }
    }

    await executeSync(config)
  }, [skus, kentHxToken, kentAmcToken])

  // Execute the actual sync after tokens are confirmed
  const executeSync = useCallback(async (config: SyncConfig) => {
    setSyncing(true)
    setSyncDialogOpen(false)
    setTokenDialogOpen(false)
    setError(null)
    
    try {
      const { skuIds, weekStart, weekEnd, fields } = config
      const results: Array<{ success?: boolean; error?: string }> = []
      
      // Sync each field type
      // Note: Customer Forecast is synced separately from the Customer Forecast page
      for (const field of fields) {
        if (field === 'actualConsumption') {
          // Sync from WMS API for actualConsumption
          for (const skuId of skuIds) {
            const token = getTokenForSku(skuId)
            for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
              try {
                const res = await fetch('/api/wms/consumption', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ skuId, weekNumber, ...(token ? { token } : {}) }),
                })
                const data = await res.json()
                results.push(data)
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200))
              } catch (err) {
                results.push({ error: 'Request failed' })
              }
            }
          }
        } else if (field === 'ata') {
          // Sync from WMS inventory API for ATA
          for (const skuId of skuIds) {
            const token = getTokenForSku(skuId)
            for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
              try {
                const res = await fetch('/api/wms/ata', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ skuId, weekNumber, ...(token ? { token } : {}) }),
                })
                const data = await res.json()
                results.push(data)
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 200))
              } catch (err) {
                results.push({ error: 'Request failed' })
              }
            }
          }
        } else {
          // For other fields (etd, eta), just mark as synced
          // These would connect to different APIs in the future
          for (const skuId of skuIds) {
            for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
              results.push({ success: true })
            }
          }
        }
      }
      
      // Count successful syncs
      const successfulSyncs = results.filter(r => r.success)
      const failedSyncs = results.filter(r => r.error)
      
      // If all syncs failed, don't update anything and show error
      if (failedSyncs.length > 0 && successfulSyncs.length === 0) {
        alert(`All ${failedSyncs.length} syncs failed. Please check your API token. No data was changed.`)
        setSyncing(false)
        return
      }
      
      // Refresh data to show updated values
      await fetchData()
      
      if (failedSyncs.length > 0) {
        alert(`Synced ${successfulSyncs.length} records. ${failedSyncs.length} failed.`)
      } else {
        alert(`Successfully synced ${successfulSyncs.length} records (Weeks ${weekStart}-${weekEnd}).`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync data')
    } finally {
      setSyncing(false)
    }
  }, [fetchData])

  // Export to CSV
  const handleExport = () => {
    const headers = ['SKU', 'Row Type', ...Array.from({ length: weekRange.end - weekRange.start + 1 }, (_, i) => `Week ${weekRange.start + i}`)]
    const rows: string[][] = []
    
    filteredSkus.forEach((sku) => {
      const weekData = sku.weeks.filter(
        (w) => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
      )
      
      const rowTypes = ['customerForecast', 'actualConsumption', 'etd', 'eta', 'inTransit', 'defect', 'actualInventory', 'weeksOnHand'] as const
      
      rowTypes.forEach((rowType) => {
        const row = [
          sku.partModelNumber,
          rowType,
          ...weekData.map((w) => w[rowType]?.toString() ?? ''),
        ]
        rows.push(row)
      })
    })
    
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory-pipeline-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleWmsSync = () => {
    // Placeholder for WMS sync logic
    console.log('WMS Sync triggered');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-700 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading inventory data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Error: {error}</p>
          <Button onClick={fetchData}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative">
      {/* Full screen sync overlay */}
      {syncing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Syncing Data</p>
              <p className="text-sm text-gray-500">Please wait, fetching data from WMS...</p>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-blue-700" />
            <div>
              <h1 className="text-2xl font-bold text-blue-800">Warehouse Pipeline Dashboard</h1>
              <p className="text-sm text-muted-foreground">Inventory Management & Forecasting</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges && (
              <span className="text-sm text-blue-700 font-medium">
                {pendingChanges.length} unsaved change{pendingChanges.length !== 1 ? 's' : ''}
              </span>
            )}
            <Button
              variant="outline"
              size="sm" 
              onClick={() => setSyncDialogOpen(true)} 
              disabled={loading || saving || syncing}
              className="border-blue-500 text-blue-600 hover:bg-blue-50 bg-transparent"
            >
              {syncing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="mr-1 h-4 w-4" />
              )}
              Sync
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={!hasUnsavedChanges || saving}
              className="bg-blue-700 hover:bg-blue-800 text-white"
            >
              {saving ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1 h-4 w-4" />
              )}
              Save
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-1 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {/* Alert Bar */}
        <InventoryAlertBar alerts={alerts} />

        {/* Filters */}
        <InventoryFilters
          skus={customerFilteredSkus}
          customers={customers}
          selectedCustomer={selectedCustomer}
          onCustomerChange={handleCustomerChange}
          selectedSku={selectedSku}
          onSkuChange={setSelectedSku}
          weekRange={weekRange}
          onWeekRangeChange={setWeekRange}
          totalWeeks={TOTAL_WEEKS}
        />

        {/* Data Table */}
        <InventoryTable
          skus={filteredSkus}
          weekRange={weekRange}
          onDataChange={handleDataChange}
        />

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs">
          <span className="font-bold">Weeks on Hand Legend:</span>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-red-600"></div>
            <span className="font-bold">{'< 0 (Stockout)'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-red-400"></div>
            <span className="font-bold">{'< 1 week'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-red-300"></div>
            <span className="font-bold">{'< 2 weeks'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-orange-200"></div>
            <span className="font-bold">{'< 4 weeks'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-yellow-200"></div>
            <span className="font-bold">{'< 8 weeks'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-yellow-100"></div>
            <span className="font-bold">{'< 16 weeks'}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-4 w-4 rounded bg-green-100"></div>
            <span className="font-bold">{'>= 16 weeks'}</span>
          </div>
        </div>

        {/* Formula Info */}
        <div className="mt-4 rounded-lg bg-muted/50 p-4 text-xs">
          <span className="font-bold">Formulas:</span>
          <ul className="mt-1 list-disc list-inside space-y-1 text-muted-foreground">
            <li><span className="font-bold">Actual Consumption</span> = Customer Forecast (default, can be manually edited)</li>
            <li><span className="font-bold">Actual Inventory</span> = Previous Week Actual Inventory - This Week Actual Consumption + ATA (can be manually edited)</li>
            <li><span className="font-bold">Weeks on Hand</span> = Actual Inventory / AVG(Actual Consumption total / 13 weeks: -4 to +8 including current week)</li>
          </ul>
        </div>
      </main>
      
      {/* AI Chat Assistant */}
      <AIChat />
      
      {/* Sync Dialog */}
      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        skus={skus}
        onSync={handleSync}
        syncing={syncing}
      />

      {/* Kent Warehouse Token Dialog */}
      <Dialog open={tokenDialogOpen} onOpenChange={setTokenDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Kent Warehouse API Tokens</DialogTitle>
            <DialogDescription>
              Some selected SKUs belong to the Kent warehouse and require separate WMS tokens.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {needsKentHx && (
              <div className="space-y-2">
                <Label htmlFor="kent-hx-token" className="text-sm font-medium">
                  HX Kent Token <span className="text-muted-foreground">(SKU: 1282199)</span>
                </Label>
                <Input
                  id="kent-hx-token"
                  type="password"
                  placeholder="Enter HX Kent warehouse token..."
                  value={kentHxToken}
                  onChange={(e) => setKentHxToken(e.target.value)}
                />
              </div>
            )}
            {needsKentAmc && (
              <div className="space-y-2">
                <Label htmlFor="kent-amc-token" className="text-sm font-medium">
                  AMC Kent Token <span className="text-muted-foreground">(All AMC SKUs)</span>
                </Label>
                <Input
                  id="kent-amc-token"
                  type="password"
                  placeholder="Enter AMC Kent warehouse token..."
                  value={kentAmcToken}
                  onChange={(e) => setKentAmcToken(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTokenConfirm}
              disabled={(needsKentHx && !kentHxToken) || (needsKentAmc && !kentAmcToken)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Confirm & Sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
