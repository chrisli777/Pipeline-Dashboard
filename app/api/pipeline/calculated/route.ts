import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This API returns the fully calculated pipeline data
// with actual inventory computed using the same logic as Pipeline Dashboard

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Fetch inventory data
    const { data: inventoryData, error: invError } = await supabase
      .from('inventory_data')
      .select('*')
      .order('week_number', { ascending: true })
    
    if (invError) {
      return NextResponse.json({ error: invError.message }, { status: 500 })
    }

    // Fetch SKU metadata
    const { data: skusMeta, error: skuError } = await supabase
      .from('skus')
      .select('*')
    
    if (skuError) {
      return NextResponse.json({ error: skuError.message }, { status: 500 })
    }

    // Transform data using same logic as Pipeline Dashboard
    const calculatedData = transformDatabaseData(inventoryData || [], skusMeta || [])
    
    return NextResponse.json({
      skus: calculatedData,
      currentWeek: getDefaultWeek(),
    })
  } catch (error) {
    console.error('Pipeline calculated API error:', error)
    return NextResponse.json({ error: 'Failed to fetch pipeline data' }, { status: 500 })
  }
}

// Calculate the default week (same logic as Pipeline Dashboard)
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

// Transform database data to frontend format - EXACT SAME LOGIC as Pipeline Dashboard
function transformDatabaseData(inventoryData: any[], skusMeta: any[] = []) {
  const skuMetaMap = new Map<string, any>()
  skusMeta.forEach((s) => skuMetaMap.set(s.id, s))

  const skuMap = new Map<string, any>()

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
        allWeeks: [],
      })
    }

    const sku = skuMap.get(row.sku_id)!
    
    const [year, monthNum, dayNum] = row.week_start_date.split('-').map(Number)
    const weekDate = new Date(year, monthNum - 1, dayNum - 6)
    const month = weekDate.toLocaleDateString('en-US', { month: 'short' })
    const day = weekDate.getDate()
    const weekOf = `${month} ${day}`

    const etaValue = row.eta != null ? Number(row.eta) : null
    const rawAtaFromDb = row.ata
    
    sku.allWeeks.push({
      weekNumber: row.week_number,
      weekOf,
      customerForecast: row.customer_forecast !== null ? Number(row.customer_forecast) : null,
      actualConsumption: row.actual_consumption !== null ? Number(row.actual_consumption) : Number(row.customer_forecast),
      etd: row.etd !== null ? Number(row.etd) : null,
      eta: etaValue,
      ata: etaValue ?? 0,
      rawAtaFromDb: rawAtaFromDb,
      defect: row.defect !== null ? Number(row.defect) : null,
      actualInventory: row.actual_inventory !== null ? Number(row.actual_inventory) : null,
      weeksOnHand: 0,
    })
  })

  // Process each SKU
  skuMap.forEach((sku) => {
    sku.allWeeks.sort((a: any, b: any) => a.weekNumber - b.weekNumber)
    
    // Apply defect default
    for (let i = 1; i < sku.allWeeks.length; i++) {
      const currentWeek = sku.allWeeks[i]
      const prevWeek = sku.allWeeks[i - 1]
      if (currentWeek.defect === null || currentWeek.defect === 0) {
        currentWeek.defect = prevWeek.defect
      }
    }
    
    // Build ETD lookup
    const etdByWeek = new Map<number, number | null>()
    for (const w of sku.allWeeks) {
      etdByWeek.set(w.weekNumber, w.etd)
    }
    
    // ETA calculation
    for (const w of sku.allWeeks) {
      if (w.eta === null) {
        const sourceWeek = w.weekNumber - 6
        const sourceEtd = etdByWeek.get(sourceWeek)
        w.eta = sourceEtd ?? 0
      }
    }
    
    // ATA rollover logic
    let lastSyncedWeekIndex = -1
    for (let i = sku.allWeeks.length - 1; i >= 0; i--) {
      if (sku.allWeeks[i].rawAtaFromDb !== null) {
        lastSyncedWeekIndex = i
        break
      }
    }

    if (lastSyncedWeekIndex === -1) {
      for (let i = 0; i < sku.allWeeks.length; i++) {
        sku.allWeeks[i].ata = sku.allWeeks[i].eta ?? 0
      }
    } else {
      let totalSyncedAta = 0
      let totalEtaUpToSynced = 0
      for (let i = 0; i <= lastSyncedWeekIndex; i++) {
        totalSyncedAta += sku.allWeeks[i].rawAtaFromDb ?? 0
        totalEtaUpToSynced += sku.allWeeks[i].eta ?? 0
        sku.allWeeks[i].ata = sku.allWeeks[i].rawAtaFromDb ?? 0
      }
      
      let remainingSyncedAta = totalSyncedAta - totalEtaUpToSynced
      let batchEnded = false
      
      for (let i = lastSyncedWeekIndex + 1; i < sku.allWeeks.length; i++) {
        const weekEta = sku.allWeeks[i].eta ?? 0
        
        if (batchEnded) {
          sku.allWeeks[i].ata = weekEta
        } else if (weekEta === 0) {
          sku.allWeeks[i].ata = 0
          batchEnded = true
        } else if (remainingSyncedAta >= weekEta) {
          remainingSyncedAta -= weekEta
          sku.allWeeks[i].ata = 0
        } else if (remainingSyncedAta > 0) {
          sku.allWeeks[i].ata = weekEta - remainingSyncedAta
          remainingSyncedAta = 0
        } else {
          sku.allWeeks[i].ata = weekEta
        }
      }
    }

    // Calculate actual inventory
    const week1Index = sku.allWeeks.findIndex((w: any) => w.weekNumber === 1)
    if (week1Index >= 0) {
      for (let i = week1Index + 1; i < sku.allWeeks.length; i++) {
        const prevWeek = sku.allWeeks[i - 1]
        const currentWeek = sku.allWeeks[i]
        const consumption = currentWeek.actualConsumption ?? currentWeek.customerForecast ?? 0
        const ata = currentWeek.ata ?? 0
        const prevInventory = prevWeek.actualInventory ?? 0
        currentWeek.actualInventory = prevInventory - consumption + ata
      }
    }
    
    // Calculate weeks on hand
    sku.allWeeks.forEach((week: any, index: number) => {
      week.weeksOnHand = calculateWeeksOnHand(sku.allWeeks, index)
    })
    
    // Keep weeks >= 1 for display
    sku.weeks = sku.allWeeks.filter((w: any) => w.weekNumber >= 1)
  })

  return Array.from(skuMap.values()).map(({ allWeeks, ...sku }) => ({
    ...sku,
    // Also include allWeeks for replenishment to use full data
    allWeeksData: allWeeks,
  }))
}

function calculateWeeksOnHand(weeks: any[], currentWeekIndex: number): number {
  const currentInventory = weeks[currentWeekIndex]?.actualInventory ?? 0
  const startIndex = Math.max(0, currentWeekIndex - 4)
  const endIndex = Math.min(weeks.length - 1, currentWeekIndex + 8)
  
  let totalConsumption = 0
  const weeksCount = 13
  
  for (let i = startIndex; i <= endIndex; i++) {
    const consumption = weeks[i]?.actualConsumption ?? weeks[i]?.customerForecast ?? 0
    totalConsumption += consumption
  }
  
  const avgConsumption = totalConsumption / weeksCount
  
  if (avgConsumption <= 0) {
    return currentInventory > 0 ? 999 : 0
  }
  
  return parseFloat((currentInventory / avgConsumption).toFixed(2))
}
