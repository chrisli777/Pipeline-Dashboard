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

// Note: 'eta' is kept in data/calculations but hidden from display
const ROW_TYPE_ORDER: RowType[] = [
  'customerForecast',
  'actualConsumption',
  'etd',
  'ata',
  'defect',
  'actualInventory',
]

// Calculate which ETD weeks correspond to a given ATA week
// This traces back through the shipment timeline based on lead time
// The logic matches ETD values that would have been shipped ~leadTime weeks before arrival
function calculateEtdSourceWeeks(sku: SKUData, ataWeekNumber: number): number[] {
  const weeks = sku.weeks
  const ataWeekIndex = weeks.findIndex(w => w.weekNumber === ataWeekNumber)
  if (ataWeekIndex < 0) return []
  
  const ataValue = weeks[ataWeekIndex].ata ?? 0
  if (ataValue === 0) return []
  
  // Find ETD weeks that correspond to this ATA
  // Strategy: Look for ETD values around (ataWeek - leadTime) that sum up to the ATA value
  const leadTimeWeeks = sku.leadTimeWeeks ?? 4
  const sourceWeeks: number[] = []
  let remainingAta = ataValue
  
  // Expected ETD week is approximately ataWeek - leadTime
  // Search in a window around that expected week
  const expectedEtdWeekIndex = ataWeekIndex - leadTimeWeeks
  const searchStart = Math.max(0, expectedEtdWeekIndex - 3)
  const searchEnd = Math.min(weeks.length, expectedEtdWeekIndex + 3)
  
  // First pass: exact match at expected week
  for (let i = searchStart; i < searchEnd && remainingAta > 0; i++) {
    const etdValue = weeks[i]?.etd ?? 0
    if (etdValue > 0 && etdValue <= remainingAta) {
      sourceWeeks.push(weeks[i].weekNumber)
      remainingAta -= etdValue
    }
  }
  
  // If we couldn't find exact matches, look for partial matches
  if (remainingAta > 0 && sourceWeeks.length === 0) {
    for (let i = searchStart; i < searchEnd; i++) {
      const etdValue = weeks[i]?.etd ?? 0
      if (etdValue > 0) {
        sourceWeeks.push(weeks[i].weekNumber)
        break
      }
    }
  }
  
  return sourceWeeks
}

export function InventoryTable({ skus, weekRange, highlightedWeeks = [], onDataChange }: InventoryTableProps) {
  const highlightedSet = new Set(highlightedWeeks)
  const filteredWeeks = skus[0]?.weeks.filter(
    w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
  ) || []
  
  // State for ETD-ATA hover highlighting
  const [hoveredAtaCell, setHoveredAtaCell] = useState<{ skuId: string; weekNumber: number } | null>(null)
  const [highlightedEtdWeeks, setHighlightedEtdWeeks] = useState<Set<number>>(new Set())
  
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
              highlightedEtdWeeks={hoveredAtaCell?.skuId === sku.id ? highlightedEtdWeeks : new Set()}
              onDataChange={onDataChange}
              onAtaHover={(skuId, weekNumber) => {
                setHoveredAtaCell({ skuId, weekNumber })
                const etdWeeks = calculateEtdSourceWeeks(sku, weekNumber)
                setHighlightedEtdWeeks(new Set(etdWeeks))
              }}
              onAtaLeave={() => {
                setHoveredAtaCell(null)
                setHighlightedEtdWeeks(new Set())
              }}
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
  highlightedEtdWeeks: Set<number>
  onDataChange: (skuId: string, weekNumber: number, field: keyof WeekData, value: number | null) => void
  onAtaHover: (skuId: string, weekNumber: number) => void
  onAtaLeave: () => void
}

function SKURows({ sku, filteredWeeks, weekRange, highlightedSet, highlightedEtdWeeks, onDataChange, onAtaHover, onAtaLeave }: SKURowsProps) {
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
            const isReadOnly =
              (rowType === 'actualInventory' && week.weekNumber !== 1)
            const isHighlighted = highlightedSet.has(week.weekNumber)
            // Check if this ETD cell should be highlighted (when hovering on corresponding ATA)
            const isEtdHighlighted = rowType === 'etd' && highlightedEtdWeeks.has(week.weekNumber)
            // Check if this is an ATA cell with a value (for hover interaction)
            const isAtaCell = rowType === 'ata' && (value ?? 0) > 0
            
            return (
              <td 
                key={week.weekNumber} 
                className={cn(
                  "p-0", 
                  isHighlighted && "bg-amber-50",
                  isEtdHighlighted && "!bg-cyan-200 ring-2 ring-cyan-400 ring-inset"
                )}
                onMouseEnter={isAtaCell ? () => onAtaHover(sku.id, week.weekNumber) : undefined}
                onMouseLeave={isAtaCell ? onAtaLeave : undefined}
              >
                <EditableCell
                  value={value}
                  onChange={(v) => onDataChange(sku.id, week.weekNumber, rowType, v)}
                  className={cn(
                    getCellBackground(rowType, value) || (isHighlighted ? 'bg-amber-50' : ''),
                    isEtdHighlighted && '!bg-cyan-200',
                    isAtaCell && 'cursor-pointer hover:ring-2 hover:ring-cyan-400 hover:ring-inset'
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
