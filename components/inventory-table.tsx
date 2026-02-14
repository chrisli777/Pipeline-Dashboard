'use client'

import React from "react"
import { useState, useRef, useEffect } from 'react'
import type { SKUData, RowType, WeekData } from '@/lib/types'
import { ROW_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'

interface InventoryTableProps {
  skus: SKUData[]
  weekRange: { start: number; end: number }
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

  if (rowType === 'defect' && value > 0) {
    return 'bg-red-200'
  }

  if (rowType === 'inTransit' && value > 0) {
    return 'bg-blue-50 text-blue-700'
  }

  return ''
}

const ROW_TYPE_ORDER: RowType[] = [
  'customerForecast',
  'actualConsumption',
  'etd',
  'ata',
  'inTransit',
  'defect',
  'actualInventory',
]

export function InventoryTable({ skus, weekRange, onDataChange }: InventoryTableProps) {
  const filteredWeeks = skus[0]?.weeks.filter(
    w => w.weekNumber >= weekRange.start && w.weekNumber <= weekRange.end
  ) || []

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
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
                className="px-2 py-1 text-center font-bold min-w-[60px] bg-blue-100"
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
                className="px-1 py-1 text-center text-xs font-bold min-w-[60px] bg-blue-50"
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
              onDataChange={onDataChange}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface SKURowsProps {
  sku: SKUData
  filteredWeeks: WeekData[]
  weekRange: { start: number; end: number }
  onDataChange: (skuId: string, weekNumber: number, field: keyof WeekData, value: number | null) => void
}

function SKURows({ sku, filteredWeeks, weekRange, onDataChange }: SKURowsProps) {
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
          <div className="text-xs text-muted-foreground">{sku.description}</div>
          <div className="text-xs font-bold">{sku.category}</div>
        </td>
        <td className="sticky left-[180px] z-10 bg-white px-2 py-1 text-xs font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
          {ROW_LABELS.customerForecast}
        </td>
        {skuWeeks.map((week) => (
          <td key={week.weekNumber} className="p-0 bg-white">
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
          <td className="sticky left-[180px] z-10 bg-white px-2 py-1 text-xs font-bold shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]">
            {ROW_LABELS[rowType]}
          </td>
          {skuWeeks.map((week) => {
            const value = week[rowType]
            // In Transit and calculated Actual Inventory are read-only
            const isReadOnly =
              rowType === 'inTransit' ||
              (rowType === 'actualInventory' && week.weekNumber !== 1)
            const tooltipText =
              rowType === 'inTransit' && week.inTransitInvoices && week.inTransitInvoices.length > 0
                ? `Invoices: ${week.inTransitInvoices.join(', ')}`
                : undefined
            return (
              <td key={week.weekNumber} className="p-0" title={tooltipText}>
                <EditableCell
                  value={value}
                  onChange={(v) => onDataChange(sku.id, week.weekNumber, rowType, v)}
                  className={getCellBackground(rowType, value)}
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
        {skuWeeks.map((week) => (
          <td key={week.weekNumber} className="p-0 bg-blue-50">
            <EditableCell
              value={week.weeksOnHand}
              onChange={() => {}}
              className={getCellBackground('weeksOnHand', week.weeksOnHand)}
              isWeeksOnHand
            />
          </td>
        ))}
      </tr>
    </>
  )
}
