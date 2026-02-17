'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { SKUClassification } from '@/lib/types'

interface TableProps {
  skus: SKUClassification[]
  selectedSupplier: string
  selectedCell: string | null
}

type SortField = 'sku_code' | 'supplier_code' | 'abc_class' | 'xyz_class' | 'unit_cost' | 'avg_weekly_demand' | 'annual_consumption_value' | 'cv_demand'
type SortDirection = 'asc' | 'desc'

const NUMERIC_FIELDS: SortField[] = ['unit_cost', 'avg_weekly_demand', 'annual_consumption_value', 'cv_demand']
const CENTER_FIELDS: SortField[] = ['abc_class', 'xyz_class']

const ABC_COLORS: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-800',
  B: 'bg-blue-100 text-blue-800',
  C: 'bg-slate-100 text-slate-800',
}

const XYZ_COLORS: Record<string, string> = {
  X: 'bg-emerald-100 text-emerald-800',
  Y: 'bg-yellow-100 text-yellow-800',
  Z: 'bg-red-100 text-red-800',
}

export function ClassificationTable({ skus, selectedSupplier, selectedCell }: TableProps) {
  const [sortField, setSortField] = useState<SortField>('annual_consumption_value')
  const [sortDir, setSortDir] = useState<SortDirection>('desc')

  const filteredSkus = useMemo(() => {
    let filtered = skus

    // Filter by supplier
    if (selectedSupplier !== 'all') {
      filtered = filtered.filter(s => s.supplier_code === selectedSupplier)
    }

    // Filter by matrix cell
    if (selectedCell) {
      filtered = filtered.filter(s => s.matrix_cell === selectedCell)
    }

    // Sort
    return [...filtered].sort((a, b) => {
      const aVal = a[sortField] ?? 0
      const bVal = b[sortField] ?? 0

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }

      const aNum = Number(aVal) || 0
      const bNum = Number(bVal) || 0
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum
    })
  }, [skus, selectedSupplier, selectedCell, sortField, sortDir])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 text-slate-400" />
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1 text-indigo-600" />
      : <ArrowDown className="h-3 w-3 ml-1 text-indigo-600" />
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">
          {selectedCell ? `${selectedCell} SKUs` : 'All SKUs'} ({filteredSkus.length})
        </h3>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {[
              { field: 'sku_code' as SortField, label: 'SKU' },
              { field: 'supplier_code' as SortField, label: 'Supplier' },
              { field: 'abc_class' as SortField, label: 'ABC' },
              { field: 'xyz_class' as SortField, label: 'XYZ' },
              { field: 'unit_cost' as SortField, label: 'Unit Cost' },
              { field: 'avg_weekly_demand' as SortField, label: 'Avg/Wk' },
              { field: 'annual_consumption_value' as SortField, label: 'Annual Value' },
              { field: 'cv_demand' as SortField, label: 'CV' },
            ].map(({ field, label }) => (
              <th
                key={field}
                className={cn(
                  "px-3 py-2 cursor-pointer hover:bg-slate-50 whitespace-nowrap",
                  NUMERIC_FIELDS.includes(field) ? 'text-right' :
                  CENTER_FIELDS.includes(field) ? 'text-center' : 'text-left'
                )}
                onClick={() => handleSort(field)}
              >
                <span className={cn(
                  "inline-flex items-center",
                  NUMERIC_FIELDS.includes(field) ? 'justify-end' : ''
                )}>
                  {label}
                  <SortIcon field={field} />
                </span>
              </th>
            ))}
            <th className="px-3 py-2 text-left whitespace-nowrap">Description</th>
          </tr>
        </thead>
        <tbody>
          {filteredSkus.map((sku) => (
            <tr key={sku.id || sku.sku_code} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs font-medium">{sku.sku_code}</td>
              <td className="px-3 py-2 text-xs">{sku.supplier_code || '-'}</td>
              <td className="px-3 py-2 text-center">
                <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', ABC_COLORS[sku.abc_class])}>
                  {sku.abc_class}
                </span>
              </td>
              <td className="px-3 py-2 text-center">
                <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', XYZ_COLORS[sku.xyz_class])}>
                  {sku.xyz_class}
                </span>
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {sku.unit_cost ? `$${sku.unit_cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {sku.avg_weekly_demand?.toFixed(1) || '-'}
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs font-medium">
                {sku.annual_consumption_value
                  ? `$${sku.annual_consumption_value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                  : '-'
                }
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                {sku.cv_demand?.toFixed(2) || '-'}
              </td>
              <td className="px-3 py-2 text-xs text-slate-500 max-w-[200px] truncate">
                {sku.description || sku.part_model || '-'}
              </td>
            </tr>
          ))}
          {filteredSkus.length === 0 && (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">
                No SKUs match the current filters
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
