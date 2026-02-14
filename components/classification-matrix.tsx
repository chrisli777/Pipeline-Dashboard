'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { SKUClassification, ClassificationPolicy, ClassificationSummary } from '@/lib/types'

interface MatrixProps {
  skus: SKUClassification[]
  policies: ClassificationPolicy[]
  summary: ClassificationSummary
  selectedSupplier: string
  onCellClick: (cell: string) => void
  selectedCell: string | null
}

const ABC_LABELS = { A: 'A (High Value)', B: 'B (Medium)', C: 'C (Low Value)' }
const XYZ_LABELS = { X: 'X (Stable)', Y: 'Y (Moderate)', Z: 'Z (Erratic)' }

const CELL_COLORS: Record<string, string> = {
  AX: 'bg-emerald-100 border-emerald-400 hover:bg-emerald-200',
  AY: 'bg-yellow-100 border-yellow-400 hover:bg-yellow-200',
  AZ: 'bg-orange-100 border-orange-400 hover:bg-orange-200',
  BX: 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100',
  BY: 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100',
  BZ: 'bg-orange-50 border-orange-300 hover:bg-orange-100',
  CX: 'bg-blue-50 border-blue-300 hover:bg-blue-100',
  CY: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
  CZ: 'bg-slate-100 border-slate-300 hover:bg-slate-200',
}

const CELL_SELECTED = 'ring-2 ring-indigo-500 ring-offset-1'

export function ClassificationMatrix({ skus, policies, summary, selectedSupplier, onCellClick, selectedCell }: MatrixProps) {
  // Filter SKUs by supplier if selected
  const filteredSkus = selectedSupplier === 'all'
    ? skus
    : skus.filter(s => s.supplier_code === selectedSupplier)

  // Compute per-cell counts for filtered data
  const cellCounts: Record<string, number> = {}
  const cellValues: Record<string, number> = {}
  for (const sku of filteredSkus) {
    const cell = sku.matrix_cell
    cellCounts[cell] = (cellCounts[cell] || 0) + 1
    cellValues[cell] = (cellValues[cell] || 0) + (sku.annual_consumption_value || 0)
  }

  // Get policy for a cell
  const getPolicy = (cell: string): ClassificationPolicy | undefined =>
    policies.find(p => p.matrix_cell === cell)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="w-28 p-2"></th>
            {(['X', 'Y', 'Z'] as const).map(xyz => (
              <th key={xyz} className="p-2 text-center text-sm font-semibold text-slate-700 min-w-[180px]">
                {XYZ_LABELS[xyz]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(['A', 'B', 'C'] as const).map(abc => (
            <tr key={abc}>
              <td className="p-2 text-sm font-semibold text-slate-700 whitespace-nowrap">
                {ABC_LABELS[abc]}
              </td>
              {(['X', 'Y', 'Z'] as const).map(xyz => {
                const cell = `${abc}${xyz}`
                const count = cellCounts[cell] || 0
                const value = cellValues[cell] || 0
                const policy = getPolicy(cell)
                const isSelected = selectedCell === cell

                return (
                  <td key={xyz} className="p-1">
                    <button
                      onClick={() => onCellClick(cell)}
                      className={cn(
                        'w-full p-3 rounded-lg border-2 text-left transition-all cursor-pointer',
                        CELL_COLORS[cell],
                        isSelected && CELL_SELECTED
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-lg font-bold text-slate-800">{cell}</span>
                        <span className="text-sm font-semibold text-slate-600">
                          {count} SKUs
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-0.5">
                        <div>${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}/yr</div>
                        {policy && (
                          <>
                            <div>SL: {(policy.service_level * 100).toFixed(0)}%</div>
                            <div>Target: {policy.target_woh} wks</div>
                          </>
                        )}
                      </div>
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
