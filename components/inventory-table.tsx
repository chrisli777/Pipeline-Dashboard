'use client'

import React from "react"
import { useState, useRef, useEffect } from 'react'
import type { SKUData, RowType, WeekData } from '@/lib/types'
import { ROW_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface InventoryTableProps {
  skus: SKUData[]
  weekRange: { start: number; end: number }
  highlightedWeeks?: number[]
  onDataChange: (skuId: string, weekNumber: number, field: keyof WeekData, value: number | null) => void
  userRole?: 'admin' | 'viewer'  // viewer can only edit ETD
}

interface EditableCellProps {
  value: number | null
  onChange: (value: number | null) => void
  className?: string
  isWeeksOnHand?: boolean
  isReadOnly?: boolean
}

function EditableCell({ value, onChange, className, isWeeksOnHand = false, isReadOnly = false }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value?.toString() ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const handleDoubleClick = () => {
    if (isWeeksOnHand || isReadOnly) return
    setIsEditing(true)
    setEditValue(value?.toString() ?? '')
  }

  const handleBlur = () => {
    setIsEditing(false)
    const newValue = editValue === '' ? null : parseFloat(editValue)
    if (newValue !== value) {
      onChange(newValue)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(value?.toString() ?? '')
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          'w-full h-full px-1 py-0.5 text-center text-xs font-bold border-2 border-blue-500 outline-none bg-white',
          className
        )}
      />
    )
  }

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={cn(
        'w-full h-full px-1 py-0.5 text-center text-xs font-bold cursor-pointer hover:bg-blue-50',
        (isWeeksOnHand || isReadOnly) && 'cursor-default hover:bg-transparent',
        className
      )}
    >
      {value !== null ? (isWeeksOnHand ? value.toFixed(2) : value) : ''}
    </div>
  )
}

function getCellBackground(rowType: RowType, value: number | null): string {
  if (value === null) return ''

  if (rowType === 'weeksOnHand') {
    if (value < 0) return 'bg-red-600 text-white'
    if (value < 1) return 'bg-red-400 text-white'
    if (value < 2) return 'bg-red-300'
    if (value < 4) return 'bg-orange-200'
    if (value < 8) return 'bg-yellow-200'
    if (value < 16) return 'bg-yellow-100'
    return 'bg-green-100'
  }

  if (rowType === 'actualInventory') {
    if (value < 0) return 'bg-red-600 text-white'
    if (value < 10) return 'bg-red-200'
    if (value < 30) return 'bg-yellow-100'
    return ''
  }

  return ''
}

const ROW_TYPE_ORDER: RowType[] = [
  'customerForecast',
  'actualConsumption',
  'etd',
  'eta',
  'ata',
  'defect',
  'actualInventory',
]

// Calculate the relationship between ATA, ETA, and ETD using CUMULATIVE rollover logic
// 
// Cumulative Rollover Logic:
// 1. Calculate cumulative ATA and cumulative ETA week by week
// 2. For ATA at week X, find which ETA weeks it "consumes" based on cumulative matching
// 3. This ATA's value fills the gap in cumulative ETA that matches its cumulative ATA range
//
// Example: 
// Week:  1   2   3   4   5
// ETA:  16  16  16  16  16  (cumETA: 16, 32, 48, 64, 80)
// ATA:   0  16   0  32   0  (cumATA:  0, 16, 16, 48, 48)
//
// ATA 16 at week 2: cumATA goes from 0 to 16, matches cumETA 0-16 → ETA week 1 (16)
// ATA 32 at week 4: cumATA goes from 16 to 48, matches cumETA 16-48 → ETA weeks 2,3 (16+16=32)
function calculateSourceWeeksFromAta(sku: SKUData, ataWeekNumber: number): { ataWeeks: number[], etaWeeks: number[], etdWeeks: number[] } {
  const weeks = sku.weeks
  const ataWeekIndex = weeks.findIndex(w => w.weekNumber === ataWeekNumber)
  if (ataWeekIndex < 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const ataValue = weeks[ataWeekIndex].ata ?? 0
  if (ataValue === 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const leadTimeWeeks = sku.leadTimeWeeks ?? 4
  
  // Step 1: Calculate cumulative ATA up to (but not including) the current week
  // and cumulative ATA including the current week
  let cumAtaBefore = 0
  for (let i = 0; i < ataWeekIndex; i++) {
    cumAtaBefore += weeks[i].ata ?? 0
  }
  const cumAtaAfter = cumAtaBefore + ataValue
  
  // Step 2: Find ETA weeks whose cumulative range overlaps with [cumAtaBefore, cumAtaAfter]
  // This ATA "consumes" ETA in the range (cumAtaBefore, cumAtaAfter]
  const coveredEtaWeeks: number[] = []
  let cumEta = 0
  
  for (let i = 0; i < weeks.length; i++) {
    const etaValue = weeks[i]?.eta ?? 0
    if (etaValue > 0) {
      const prevCumEta = cumEta
      cumEta += etaValue
      
      // This ETA contributes to range (prevCumEta, cumEta]
      // Check if it overlaps with our ATA range (cumAtaBefore, cumAtaAfter]
      if (cumEta > cumAtaBefore && prevCumEta < cumAtaAfter) {
        coveredEtaWeeks.push(weeks[i].weekNumber)
      }
      
      // Stop if we've passed the ATA range
      if (cumEta >= cumAtaAfter) {
        break
      }
    }
  }
  
  // Step 3: Map each ETA week back to its source ETD week
  // Formula from pipeline: ETA Week X = ETD Week (X - 6) - FIXED 6 weeks, not leadTimeWeeks
  // Also verify that ETD value matches ETA value for proper association
  const ETA_ETD_OFFSET = 6  // Fixed 6 weeks as per pipeline formula
  const sourceEtdWeeks: number[] = []
  for (const etaWeekNum of coveredEtaWeeks) {
    const etdWeekNum = etaWeekNum - ETA_ETD_OFFSET
    const etdWeek = weeks.find(w => w.weekNumber === etdWeekNum)
    const etaWeek = weeks.find(w => w.weekNumber === etaWeekNum)
    const etdValue = etdWeek?.etd ?? 0
    const etaValue = etaWeek?.eta ?? 0
    // Only associate if ETD exists and ETD value matches ETA value
    if (etdValue > 0 && etdValue === etaValue) {
      sourceEtdWeeks.push(etdWeekNum)
    }
  }
  
  return { 
    ataWeeks: [ataWeekNumber],
    etaWeeks: coveredEtaWeeks.sort((a, b) => a - b),
    etdWeeks: sourceEtdWeeks.sort((a, b) => a - b)
  }
}

// Calculate relationship starting from ETD
// ETD week X → ETA week (X + 6) → find which ATA covers that ETA using cumulative logic
function calculateSourceWeeksFromEtd(sku: SKUData, etdWeekNumber: number): { ataWeeks: number[], etaWeeks: number[], etdWeeks: number[] } {
  const weeks = sku.weeks
  const etdWeekIndex = weeks.findIndex(w => w.weekNumber === etdWeekNumber)
  if (etdWeekIndex < 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const etdValue = weeks[etdWeekIndex].etd ?? 0
  if (etdValue === 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const ETA_ETD_OFFSET = 6  // Fixed 6 weeks as per pipeline formula
  
  // ETD week X arrives as ETA at week (X + 6)
  const etaWeekNumber = etdWeekNumber + ETA_ETD_OFFSET
  const etaWeekIndex = weeks.findIndex(w => w.weekNumber === etaWeekNumber)
  if (etaWeekIndex < 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [etdWeekNumber] }
  
  const etaValue = weeks[etaWeekIndex]?.eta ?? 0
  if (etaValue === 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [etdWeekNumber] }
  
  // Use cumulative logic to find which ATA covers this ETA
  // Calculate cumulative ETA position of this ETA
  let cumEtaBefore = 0
  for (let i = 0; i < etaWeekIndex; i++) {
    cumEtaBefore += weeks[i]?.eta ?? 0
  }
  const cumEtaAfter = cumEtaBefore + etaValue
  
  // Find ATA weeks whose cumulative range overlaps with this ETA's range
  const coveringAtaWeeks: number[] = []
  let cumAta = 0
  for (let i = 0; i < weeks.length; i++) {
    const ataValue = weeks[i]?.ata ?? 0
    if (ataValue > 0) {
      const prevCumAta = cumAta
      cumAta += ataValue
      // Check if this ATA's range (prevCumAta, cumAta] overlaps with ETA's range (cumEtaBefore, cumEtaAfter]
      if (cumAta > cumEtaBefore && prevCumAta < cumEtaAfter) {
        coveringAtaWeeks.push(weeks[i].weekNumber)
      }
    }
  }
  
  return {
    ataWeeks: coveringAtaWeeks,
    etaWeeks: [etaWeekNumber],
    etdWeeks: [etdWeekNumber]
  }
}

// Calculate relationship starting from ETA
// ETA week X came from ETD week (X - 6) and is covered by ATA using cumulative logic
function calculateSourceWeeksFromEta(sku: SKUData, etaWeekNumber: number): { ataWeeks: number[], etaWeeks: number[], etdWeeks: number[] } {
  const weeks = sku.weeks
  const etaWeekIndex = weeks.findIndex(w => w.weekNumber === etaWeekNumber)
  if (etaWeekIndex < 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const etaValue = weeks[etaWeekIndex].eta ?? 0
  if (etaValue === 0) return { ataWeeks: [], etaWeeks: [], etdWeeks: [] }
  
  const ETA_ETD_OFFSET = 6  // Fixed 6 weeks as per pipeline formula
  
  // Find source ETD week: ETD week = ETA week - 6
  const etdWeekNumber = etaWeekNumber - ETA_ETD_OFFSET
  const etdWeek = weeks.find(w => w.weekNumber === etdWeekNumber)
  const sourceEtdWeeks = etdWeek && (etdWeek.etd ?? 0) > 0 ? [etdWeekNumber] : []
  
  // Use cumulative logic to find which ATA covers this ETA
  // Calculate cumulative ETA position of this ETA
  let cumEtaBefore = 0
  for (let i = 0; i < etaWeekIndex; i++) {
    cumEtaBefore += weeks[i]?.eta ?? 0
  }
  const cumEtaAfter = cumEtaBefore + etaValue
  
  // Find ATA weeks whose cumulative range overlaps with this ETA's range
  const coveringAtaWeeks: number[] = []
  let cumAta = 0
  for (let i = 0; i < weeks.length; i++) {
    const ataValue = weeks[i]?.ata ?? 0
    if (ataValue > 0) {
      const prevCumAta = cumAta
      cumAta += ataValue
      // Check if this ATA's range (prevCumAta, cumAta] overlaps with ETA's range (cumEtaBefore, cumEtaAfter]
      if (cumAta > cumEtaBefore && prevCumAta < cumEtaAfter) {
        coveringAtaWeeks.push(weeks[i].weekNumber)
      }
    }
  }
  
  return {
    ataWeeks: coveringAtaWeeks,
    etaWeeks: [etaWeekNumber],
    etdWeeks: sourceEtdWeeks
  }
}

export function InventoryTable({ skus, weekRange, highlightedWeeks = [], onDataChange, userRole = 'admin' }: InventoryTableProps) {
  const highlightedSet = new Set(highlightedWeeks)
  const filteredWeeks = skus[0]?.weeks.filter(
    w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
  ) || []
  
  // State for ETD-ETA-ATA hover highlighting
  const [hoveredSkuId, setHoveredSkuId] = useState<string | null>(null)
  const [highlightedAtaWeeks, setHighlightedAtaWeeks] = useState<Set<number>>(new Set())
  const [highlightedEtdWeeks, setHighlightedEtdWeeks] = useState<Set<number>>(new Set())
  const [highlightedEtaWeeks, setHighlightedEtaWeeks] = useState<Set<number>>(new Set())
  
  const topScrollRef = useRef<HTMLDivElement>(null)
  const bottomScrollRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const [tableWidth, setTableWidth] = useState(0)
  
  // Sync scroll between top and bottom scrollbars
  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
    }
  }
  
  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft
    }
  }
  
  // Update table width when content changes
  useEffect(() => {
    if (tableRef.current) {
      setTableWidth(tableRef.current.scrollWidth)
    }
  }, [skus, weekRange])

  return (
    <div>
      {/* Top scrollbar */}
      <div 
        ref={topScrollRef}
        onScroll={handleTopScroll}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: '16px' }}
      >
        <div style={{ width: tableWidth, height: '1px' }} />
      </div>
      
      {/* Table with bottom scrollbar */}
      <div 
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto"
      >
        <table ref={tableRef} className="w-full text-sm border-collapse">
        <thead>
          {/* Week number row */}
          <tr>
            <th className="sticky left-0 z-10 bg-blue-100 px-2 py-1 text-left font-bold min-w-[180px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
              Part/ Model #
            </th>
            <th className="sticky left-[180px] z-10 bg-blue-100 px-2 py-1 text-left font-bold min-w-[160px] shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
              Week of:
            </th>
            {filteredWeeks.map((week) => (
              <th
                key={week.weekNumber}
                className={cn(
                  "px-2 py-1 text-center font-bold min-w-[60px]",
                  highlightedSet.has(week.weekNumber) ? "bg-amber-200 text-amber-900" : "bg-blue-100"
                )}
              >
                {week.weekNumber}
              </th>
            ))}
          </tr>
          {/* Week date row */}
          <tr>
            <th className="sticky left-0 z-10 bg-blue-50 px-2 py-1 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]"></th>
            <th className="sticky left-[180px] z-10 bg-blue-50 px-2 py-1 text-left text-xs text-muted-foreground font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
              Week #:
            </th>
            {filteredWeeks.map((week) => (
              <th
                key={week.weekNumber}
                className={cn(
                  "px-1 py-1 text-center text-xs font-bold min-w-[60px]",
                  highlightedSet.has(week.weekNumber) ? "bg-amber-100 text-amber-800" : "bg-blue-50"
                )}
              >
                {week.weekOf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {skus.map((sku) => (
            <SKURows
              key={sku.id}
              sku={sku}
              filteredWeeks={filteredWeeks}
              weekRange={weekRange}
              highlightedSet={highlightedSet}
              highlightedAtaWeeks={hoveredSkuId === sku.id ? highlightedAtaWeeks : new Set()}
              highlightedEtdWeeks={hoveredSkuId === sku.id ? highlightedEtdWeeks : new Set()}
              highlightedEtaWeeks={hoveredSkuId === sku.id ? highlightedEtaWeeks : new Set()}
              onDataChange={onDataChange}
              onCellHover={(skuId, weekNumber, rowType) => {
                setHoveredSkuId(skuId)
                let result: { ataWeeks: number[], etaWeeks: number[], etdWeeks: number[] }
                if (rowType === 'ata') {
                  result = calculateSourceWeeksFromAta(sku, weekNumber)
                } else if (rowType === 'etd') {
                  result = calculateSourceWeeksFromEtd(sku, weekNumber)
                } else if (rowType === 'eta') {
                  result = calculateSourceWeeksFromEta(sku, weekNumber)
                } else {
                  return
                }
                setHighlightedAtaWeeks(new Set(result.ataWeeks))
                setHighlightedEtaWeeks(new Set(result.etaWeeks))
                setHighlightedEtdWeeks(new Set(result.etdWeeks))
              }}
              onCellLeave={() => {
                setHoveredSkuId(null)
                setHighlightedAtaWeeks(new Set())
                setHighlightedEtaWeeks(new Set())
                setHighlightedEtdWeeks(new Set())
              }}
              userRole={userRole}
            />
          ))}
        </tbody>
      </table>
      </div>
    </div>
  )
}

interface SKURowsProps {
  sku: SKUData
  filteredWeeks: WeekData[]
  weekRange: { start: number; end: number }
  highlightedSet: Set<number>
  highlightedAtaWeeks: Set<number>
  highlightedEtdWeeks: Set<number>
  highlightedEtaWeeks: Set<number>
  onDataChange: (skuId: string, weekNumber: number, field: keyof WeekData, value: number | null) => void
  onCellHover: (skuId: string, weekNumber: number, rowType: RowType) => void
  userRole: 'admin' | 'viewer'
  onCellLeave: () => void
}

function SKURows({ sku, filteredWeeks, weekRange, highlightedSet, highlightedAtaWeeks, highlightedEtdWeeks, highlightedEtaWeeks, onDataChange, onCellHover, onCellLeave, userRole }: SKURowsProps) {
  const skuWeeks = sku.weeks.filter(
    w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
  )

  const totalRows = ROW_TYPE_ORDER.length + 1

  return (
    <>
      {/* First row - with merged Part/Model cell */}
      <tr className="hover:bg-muted/30">
        <td 
          className="sticky left-0 z-10 bg-blue-200 px-2 py-1 align-top shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]"
          rowSpan={totalRows}
        >
          <div className="text-sm font-bold">{sku.partModelNumber}</div>
          {sku.description && (
            <div className="text-xs text-muted-foreground">({sku.description})</div>
          )}
          <div className="text-xs font-bold">{sku.category}</div>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
            {sku.supplierCode && <span>Vendor: {sku.supplierCode}</span>}
            {sku.warehouse && <span>WH: {sku.warehouse}</span>}
            {sku.leadTimeWeeks != null && <span>LT: {sku.leadTimeWeeks}w</span>}
            {sku.moq != null && <span>MOQ: {sku.moq}</span>}
            {sku.unitWeight != null && sku.unitWeight > 0 && <span>{sku.unitWeight.toLocaleString()} lbs</span>}
          </div>
        </td>
        <td className="sticky left-[180px] z-10 bg-[#f8fafc] px-2 py-1 text-xs font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
          {ROW_LABELS.customerForecast}
        </td>
        {skuWeeks.map((week) => (
          <td key={week.weekNumber} className={cn("p-0", highlightedSet.has(week.weekNumber) ? "bg-amber-50" : "bg-white")}>
            <EditableCell
              value={week.customerForecast}
              onChange={(v) => onDataChange(sku.id, week.weekNumber, 'customerForecast', v)}
            />
          </td>
        ))}
      </tr>

      {/* Remaining data rows */}
      {ROW_TYPE_ORDER.slice(1).map((rowType) => (
        <tr key={`${sku.id}-${rowType}`} className="hover:bg-muted/30">
          <td className="sticky left-[180px] z-10 bg-[#f8fafc] px-2 py-1 text-xs font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
            {ROW_LABELS[rowType]}
          </td>
          {skuWeeks.map((week) => {
            const value = week[rowType]
            // Calculated Actual Inventory is read-only (except week 1)
            // Viewer role can only edit ETD
            const isReadOnly =
              (rowType === 'actualInventory' && week.weekNumber !== 1) ||
              (userRole === 'viewer' && rowType !== 'etd')
            const isHighlighted = highlightedSet.has(week.weekNumber)
            
            // Check if this cell should be highlighted based on hover
            const isAtaHighlighted = rowType === 'ata' && highlightedAtaWeeks.has(week.weekNumber)
            const isEtdHighlighted = rowType === 'etd' && highlightedEtdWeeks.has(week.weekNumber)
            const isEtaHighlighted = rowType === 'eta' && highlightedEtaWeeks.has(week.weekNumber)
            const isRelatedHighlighted = isAtaHighlighted || isEtdHighlighted || isEtaHighlighted
            
            // Check if this cell can trigger hover (ETD, ETA, ATA with values)
            const canHover = (rowType === 'ata' || rowType === 'etd' || rowType === 'eta') && (value ?? 0) > 0
            
            return (
              <td 
                key={week.weekNumber} 
                className={cn(
                  "p-0", 
                  isHighlighted && "bg-amber-50",
                  isRelatedHighlighted && "!bg-cyan-200 ring-2 ring-cyan-400 ring-inset"
                )}
                onMouseEnter={canHover ? () => onCellHover(sku.id, week.weekNumber, rowType) : undefined}
                onMouseLeave={canHover ? onCellLeave : undefined}
              >
                <EditableCell
                  value={value}
                  onChange={(v) => onDataChange(sku.id, week.weekNumber, rowType, v)}
                  className={cn(
                    getCellBackground(rowType, value) || (isHighlighted ? 'bg-amber-50' : ''),
                    isRelatedHighlighted && '!bg-cyan-200',
                    canHover && 'cursor-pointer hover:ring-2 hover:ring-cyan-400 hover:ring-inset'
                  )}
                  isReadOnly={isReadOnly}
                />
              </td>
            )
          })}
        </tr>
      ))}

      {/* Weeks on Hand Row - Calculated */}
      <tr className="bg-blue-50">
        <td className="sticky left-[180px] z-10 bg-blue-50 px-2 py-1 text-xs font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
          Weeks on hand (actual / runout)
        </td>
        {skuWeeks.map((week) => {
          const isHighlighted = highlightedSet.has(week.weekNumber)
          return (
            <td key={week.weekNumber} className={cn("p-0", isHighlighted ? "bg-amber-100" : "bg-blue-50")}>
              <EditableCell
                value={week.weeksOnHand}
                onChange={() => {}}
                className={getCellBackground('weeksOnHand', week.weeksOnHand) || (isHighlighted ? 'bg-amber-100' : '')}
                isWeeksOnHand
              />
            </td>
          )
        })}
      </tr>
    </>
  )
}
