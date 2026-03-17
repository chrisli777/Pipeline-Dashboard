'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { Package, Download, Loader2, Save, RefreshCcw, CloudDownload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InventoryAlertBar } from '@/components/inventory-alert-bar'
import { InventoryFilters } from '@/components/inventory-filters'
import { InventoryTable } from '@/components/inventory-table'
import { AIChat } from '@/components/ai-chat'
import { SyncDialog, SyncConfig } from '@/components/sync-dialog'
import { ROW_LABELS, type SKUData, type InventoryAlert, type WeekData, type RowType } from '@/lib/types'

const TOTAL_WEEKS = 53 // Full year (Week 1: Jan 4 to Week 53: Jan 3)

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

function transformDatabaseData(inventoryData: any[], skusMeta: any[] = []): SKUData[] {
  // Build a lookup map for SKU metadata (unit_weight, unit_cost, lead_time, moq, qty_per_container)
  const skuMetaMap = new Map<string, any>()
  skusMeta.forEach((s) => skuMetaMap.set(s.id, s))

  const skuMap = new Map<string, SKUData & { allWeeks: WeekData[] }>()

  inventoryData.forEach((row) => {
    if (!skuMap.has(row.sku_id)) {
      const meta = skuMetaMap.get(row.sku_id)
      skuMap.set(row.sku_id, {
        id: row.sku_id,
        partModelNumber: row.part_model,
        description: row.description || '',
        category: row.category || 'COUNTERWEIGHT',
        customerCode: row.customer_code || null,
        supplierCode: row.supplier_code || null,
        warehouse: row.warehouse || null,
        unitWeight: meta?.unit_weight ? parseFloat(meta.unit_weight) : null,
        unitCost: meta?.unit_cost ? parseFloat(meta.unit_cost) : null,
        leadTimeWeeks: meta?.lead_time_weeks ?? null,
        moq: meta?.moq ?? null,
        qtyPerContainer: meta?.qty_per_container ?? null,
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
      eta: row.eta != null ? Number(row.eta) : null, // ETA from database (synced = ETD from 6 weeks prior)
      ata: row.ata != null ? Number(row.ata) : null, // ATA from database (synced from WMS)
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
    
    // Build ETD lookup map for ETA/ATA default calculation
    const etdByWeek = new Map<number, number | null>()
    for (const w of sku.allWeeks) {
      etdByWeek.set(w.weekNumber, w.etd)
    }
    
    // ETA display logic:
    // - If ETA has a value (including 0), preserve it (could be manual input)
    // - If ETA is null (never set), auto-calculate from ETD 6 weeks prior
    for (const w of sku.allWeeks) {
      if (w.eta === null) {
        const sourceWeek = w.weekNumber - 6
        const sourceEtd = etdByWeek.get(sourceWeek)
        w.eta = sourceEtd ?? 0
      }
    }
    
    // ATA display logic with rollover:
    // Goal: ETA total must equal ATA total
    // 1. Find the last synced ATA week (last week where ata is not null in DB)
    // 2. Sum all synced ATA values up to that week
    // 3. Use synced ATA total to "consume" ETA week by week from the beginning
    // 4. Whatever ETA is not yet consumed shows as future ATA
    
    // Find last synced week (last week with non-null ATA in database)
    let lastSyncedWeekIndex = -1
    for (let i = sku.allWeeks.length - 1; i >= 0; i--) {
      if (sku.allWeeks[i].ata !== null) {
        lastSyncedWeekIndex = i
        break
      }
    }
    
    if (lastSyncedWeekIndex === -1) {
      // No synced ATA yet - just use ETA as ATA for all weeks
      for (const w of sku.allWeeks) {
        if (w.ata === null) {
          w.ata = w.eta ?? 0
        }
      }
    } else {
      // Calculate total synced ATA (all weeks up to and including lastSyncedWeek)
      let totalSyncedAta = 0
      for (let i = 0; i <= lastSyncedWeekIndex; i++) {
        totalSyncedAta += sku.allWeeks[i].ata ?? 0
      }
      
      // Use synced ATA to consume ETA week by week from the beginning
      // Collect remaining ETA (not consumed) into an array
      // Important: once remainingAta is exhausted, ALL subsequent ETA values (including 0) go into the list
      let remainingAta = totalSyncedAta
      const remainingEtaList: number[] = []
      let ataExhausted = false
      
      for (let i = 0; i < sku.allWeeks.length; i++) {
        const weekEta = sku.allWeeks[i].eta ?? 0
        
        if (ataExhausted) {
          // ATA already exhausted, add all remaining ETA (including 0) to the list
          remainingEtaList.push(weekEta)
        } else if (remainingAta >= weekEta) {
          // Fully consumed this week's ETA
          remainingAta -= weekEta
          // No remaining ETA for this week
        } else {
          // Partially consumed - add unconsumed portion
          const unconsumed = weekEta - remainingAta
          remainingEtaList.push(unconsumed)
          remainingAta = 0
          ataExhausted = true
        }
      }
      
      // If there's overflow ATA (more arrived than expected), add it to first future week
      if (remainingAta > 0) {
        remainingEtaList.unshift(remainingAta)
      }
      
      // For weeks after lastSyncedWeek, display remaining ETA in order
      // Week 12 gets first remaining ETA, Week 13 gets second, etc.
      let remainingIndex = 0
      for (let i = lastSyncedWeekIndex + 1; i < sku.allWeeks.length; i++) {
        if (remainingIndex < remainingEtaList.length) {
          sku.allWeeks[i].ata = remainingEtaList[remainingIndex]
          remainingIndex++
        } else {
          // No more remaining ETA, future weeks get 0
          sku.allWeeks[i].ata = 0
        }
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
        const ata = currentWeek.ata ?? 0
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

// Calculate the default week (same logic as sync dialog)
function getDefaultWeek(): number {
  const today = new Date()
  const dayOfWeek = today.getDay()
  let daysToLastFriday: number
  if (dayOfWeek === 5) daysToLastFriday = 7
  else if (dayOfWeek === 6) daysToLastFriday = 1
  else daysToLastFriday = dayOfWeek + 2
  const lastFriday = new Date(today)
  lastFriday.setDate(today.getDate() - daysToLastFriday)
  const week1Sunday = new Date(2025, 11, 28)
  const diffTime = lastFriday.getTime() - week1Sunday.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(1, Math.floor(diffDays / 7) + 1)
}

export function PipelineDashboard() {
  const [skus, setSkus] = useState<SKUData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncDialogOpen, setSyncDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(['GENIE'])
  const [selectedVendors, setSelectedVendors] = useState<string[]>(['HX'])
  const [selectedWarehouses, setSelectedWarehouses] = useState<string[]>([])
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [highlightedWeeks, setHighlightedWeeks] = useState<number[]>(() => [getDefaultWeek()])
  const [weekRange, setWeekRange] = useState({ start: 1, end: 53 })
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Fetch data from Supabase with automatic retry on failure
  const fetchData = useCallback(async (retryCount = 0): Promise<void> => {
    if (retryCount === 0) {
      setLoading(true)
      setError(null)
    }
    try {
      // Fetch inventory data
      const inventoryRes = await fetch('/api/inventory')

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

      const transformedData = transformDatabaseData(data.inventoryData || [], data.skus || [])
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
  }, [fetchData])

  // Derive inventory alerts from SKU data
  // 4-tier cascading filter: Customer -> Vendor -> Warehouse -> SKU
  // Empty array = all (no filter applied)
  const filteredSkus = useMemo(() => {
    let filtered = skus
    if (selectedCustomers.length > 0) {
      filtered = filtered.filter((sku) => selectedCustomers.includes(sku.customerCode || ''))
    }
    if (selectedVendors.length > 0) {
      filtered = filtered.filter((sku) => selectedVendors.includes(sku.supplierCode || ''))
    }
    if (selectedWarehouses.length > 0) {
      filtered = filtered.filter((sku) => selectedWarehouses.includes(sku.warehouse || ''))
    }
    if (selectedSkus.length > 0) {
      filtered = filtered.filter((sku) => selectedSkus.includes(sku.id))
    }
    return filtered
  }, [skus, selectedCustomers, selectedVendors, selectedWarehouses, selectedSkus])

  // Stockout forecast: find the first week where inventory runs out per filtered SKU
  const alerts: InventoryAlert[] = useMemo(() => {
    const alertList: InventoryAlert[] = []
    filteredSkus.forEach((sku) => {
      for (const week of sku.weeks) {
        if (week.weekNumber < 1 || week.weeksOnHand === null) continue
        if (week.weeksOnHand <= 0) {
          alertList.push({
            skuId: sku.id,
            partModelNumber: sku.partModelNumber,
            weekNumber: week.weekNumber,
            weekOf: week.weekOf,
            weeksOnHand: week.weeksOnHand,
          })
          break
        }
      }
    })
    return alertList.sort((a, b) => a.weekNumber - b.weekNumber)
  }, [filteredSkus])

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
              const ata = currentWeek.ata ?? 0
              const prevInventory = prevWeek.actualInventory ?? 0
              currentWeek.actualInventory = prevInventory - consumption + ata
            }
          } else if (field === 'actualConsumption' || field === 'ata' || field === 'customerForecast') {
            // Recalculate actualInventory from the changed week onwards
            const changedIndex = updatedWeeks.findIndex(w => w.weekNumber === weekNumber)
            if (changedIndex >= 0) {
              for (let i = Math.max(1, changedIndex); i < updatedWeeks.length; i++) {
                const prevWeek = updatedWeeks[i - 1]
                const currentWeek = updatedWeeks[i]
                const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
                const ata = currentWeek.ata ?? 0
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

  // Sync data based on configuration from dialog
  // Token routing is handled server-side based on SKU
  const handleSync = useCallback(async (config: SyncConfig) => {
    setSyncing(true)
    setSyncDialogOpen(false)
    setError(null)
    
    try {
      const { skuIds, weekStart, weekEnd, fields } = config
      const results: Array<Record<string, any>> = []
      
      // Sync each field type
      // Note: Customer Forecast is synced separately from the Customer Forecast page
      for (const field of fields) {
        if (field === 'actualConsumption') {
          // Sync from WMS API for actualConsumption
          // Server determines correct token per SKU (Moses Lake / Kent HX / Kent AMC)
          for (const skuId of skuIds) {
            for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
              try {
                const res = await fetch('/api/wms/consumption', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ skuId, weekNumber }),
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
          // Sync ATA from WMS inventory API
          for (const skuId of skuIds) {
            for (let weekNumber = weekStart; weekNumber <= weekEnd; weekNumber++) {
              try {
                const res = await fetch('/api/wms/ata', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ skuId, weekNumber }),
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

  // Export Excel with full formatting (colors, merged cells, borders)
  const [exporting, setExporting] = useState(false)
  const handleExport = async () => {
    setExporting(true)
    try {
      const ExcelJSModule = await import('exceljs')
      const ExcelJS = ExcelJSModule.default || ExcelJSModule
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Pipeline', { views: [{ state: 'frozen', xSplit: 2, ySplit: 2 }] })

      const ROW_TYPE_ORDER: RowType[] = [
        'customerForecast', 'actualConsumption', 'etd', 'eta', 'ata', 'defect', 'actualInventory', 'weeksOnHand'
      ]

      const weeks = filteredSkus[0]?.weeks.filter(
        w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
      ) || []
      const numWeeks = weeks.length
      const currentWeekNumber = (() => {
        const now = new Date()
        const start = new Date(now.getFullYear(), 0, 1)
        const diff = now.getTime() - start.getTime()
        return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))
      })()

      // Styles - using 'as const' objects instead of ExcelJS type annotations
      const solidFill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const headerFill = solidFill('FFDBEAFE')
      const subHeaderFill = solidFill('FFEFF6FF')
      const currentWeekFill = solidFill('FFFDE68A')
      const currentWeekSubFill = solidFill('FFFEF3C7')
      const skuInfoFill = solidFill('FFBFDBFE')
      const wohRowFill = solidFill('FFEFF6FF')
      const borderSide = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
      const thinBorder = { top: borderSide, bottom: borderSide, left: borderSide, right: borderSide }
      const boldFont = { bold: true, size: 10 }
      const smallFont = { bold: true, size: 8 }

      // Helper: get weeksOnHand cell fill color
      function getWohFill(value: number | null) {
        if (value === null) return null
        if (value < 0) return solidFill('FFDC2626')
        if (value < 1) return solidFill('FFF87171')
        if (value < 2) return solidFill('FFFCA5A5')
        if (value < 4) return solidFill('FFFED7AA')
        if (value < 8) return solidFill('FFFEF08A')
        if (value < 16) return solidFill('FFFEF9C3')
        return solidFill('FFDCFCE7')
      }

      function getInventoryFill(value: number | null) {
        if (value === null) return null
        if (value < 0) return solidFill('FFDC2626')
        if (value < 10) return solidFill('FFFECACA')
        if (value < 30) return solidFill('FFFEF9C3')
        return null
      }

      // Column widths: col A (Part/Model) = 30, col B (row label) = 30, data cols = 10
      ws.getColumn(1).width = 30
      ws.getColumn(2).width = 30
      for (let i = 0; i < numWeeks; i++) {
        ws.getColumn(3 + i).width = 10
      }

      // --- Header Row 1: Part/Model# | Week of: | week numbers ---
      const headerRow = ws.addRow(['Part/ Model #', 'Week of:', ...weeks.map(w => w.weekNumber)])
      headerRow.eachCell((cell, colNumber) => {
        cell.font = boldFont
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (colNumber > 2) {
          const weekNum = weeks[colNumber - 3]?.weekNumber
          cell.fill = weekNum === currentWeekNumber ? currentWeekFill : headerFill
        } else {
          cell.fill = headerFill
          cell.alignment = { horizontal: 'left', vertical: 'middle' }
        }
      })

      // --- Header Row 2: blank | Week #: | week dates ---
      const subRow = ws.addRow(['', 'Week #:', ...weeks.map(w => w.weekOf)])
      subRow.eachCell((cell, colNumber) => {
        cell.font = smallFont
        cell.border = thinBorder
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        if (colNumber > 2) {
          const weekNum = weeks[colNumber - 3]?.weekNumber
          cell.fill = weekNum === currentWeekNumber ? currentWeekSubFill : subHeaderFill
        } else {
          cell.fill = subHeaderFill
          cell.alignment = { horizontal: 'left', vertical: 'middle' }
        }
      })

      // --- Data rows per SKU ---
      filteredSkus.forEach((sku) => {
        const skuWeeks = sku.weeks.filter(
          w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
        )
        const startRowNum = ws.rowCount + 1

        ROW_TYPE_ORDER.forEach((rowType, idx) => {
          const label = ROW_LABELS[rowType]
          const values = skuWeeks.map(w => {
            const val = w[rowType]
            return val !== null && val !== undefined ? val : ''
          })

          // Build SKU info for first row
          let skuCell = ''
          if (idx === 0) {
            let parts: string[] = [sku.partModelNumber]
            if (sku.description) parts.push(`(${sku.description})`)
            if (sku.category) parts.push(sku.category)
            const meta: string[] = []
            if (sku.supplierCode) meta.push(`Vendor: ${sku.supplierCode}`)
            if (sku.warehouse) meta.push(`WH: ${sku.warehouse}`)
            if (sku.leadTimeWeeks != null) meta.push(`LT: ${sku.leadTimeWeeks}w`)
            if (sku.moq != null) meta.push(`MOQ: ${sku.moq}`)
            if (sku.unitWeight != null && sku.unitWeight > 0) meta.push(`${sku.unitWeight.toLocaleString()} lbs`)
            if (meta.length > 0) parts.push(meta.join('  '))
            skuCell = parts.join('\n')
          }

          const row = ws.addRow([skuCell, label, ...values])

          // Style each cell in the row
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.border = thinBorder
            cell.alignment = { horizontal: colNumber <= 2 ? 'left' : 'center', vertical: 'middle', wrapText: colNumber === 1 }
            cell.font = { bold: colNumber <= 2, size: colNumber === 1 ? 9 : 8 }

            // SKU info column - blue background
            if (colNumber === 1 && idx === 0) {
              cell.fill = skuInfoFill
              cell.font = { bold: true, size: 9 }
            }

            // Data cells - apply conditional coloring
            if (colNumber > 2) {
              const weekIdx = colNumber - 3
              const weekNum = skuWeeks[weekIdx]?.weekNumber
              const val = typeof cell.value === 'number' ? cell.value : null

              // Weeks on hand coloring
              if (rowType === 'weeksOnHand') {
                const fill = getWohFill(val)
                if (fill) {
                  cell.fill = fill
                  if (val !== null && val < 1) cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } }
                }
                if (val !== null) cell.numFmt = '0.00'
              }

              // Actual inventory coloring
              if (rowType === 'actualInventory') {
                const fill = getInventoryFill(val)
                if (fill) {
                  cell.fill = fill
                  if (val !== null && val < 0) cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } }
                }
              }

              // Current week highlight (yellow) - only if no other fill applied
              if (weekNum === currentWeekNumber && !cell.fill) {
                cell.fill = solidFill('FFFFFBEB')
              }
            }

            // Weeks on hand row base fill
            if (rowType === 'weeksOnHand' && colNumber <= 2) {
              cell.fill = wohRowFill
            }
          })
        })

        // Merge SKU info cells (column A)
        const endRowNum = ws.rowCount
        if (endRowNum > startRowNum) {
          ws.mergeCells(startRowNum, 1, endRowNum, 1)
        }
      })

      // Generate and download
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventory-pipeline-${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.log('[v0] Excel export error:', err?.message, err?.stack)
      alert(`Export failed: ${err?.message}`)
    } finally {
      setExporting(false)
    }
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
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
              <Download className="mr-1 h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export Excel'}
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
          skus={skus}
          selectedCustomers={selectedCustomers}
          onCustomersChange={setSelectedCustomers}
          selectedVendors={selectedVendors}
          onVendorsChange={setSelectedVendors}
          selectedWarehouses={selectedWarehouses}
          onWarehousesChange={setSelectedWarehouses}
          selectedSkus={selectedSkus}
          onSkusChange={setSelectedSkus}
          highlightedWeeks={highlightedWeeks}
          onHighlightedWeeksChange={setHighlightedWeeks}
          weekRange={weekRange}
          onWeekRangeChange={setWeekRange}
          totalWeeks={TOTAL_WEEKS}
        />

        {/* Data Table */}
        <InventoryTable
          skus={filteredSkus}
          weekRange={weekRange}
          highlightedWeeks={highlightedWeeks}
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

    </div>
  )
}
