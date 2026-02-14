'use client'

import { useState } from 'react'
import { AlertTriangle, AlertCircle, Info, X } from 'lucide-react'
import type { InventoryAlert } from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface InventoryAlertBarProps {
  alerts: InventoryAlert[]
}

type AlertSeverity = 'critical' | 'warning' | 'low'

export function InventoryAlertBar({ alerts }: InventoryAlertBarProps) {
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverity | null>(null)
  
  const criticalAlerts = alerts.filter(a => a.severity === 'critical')
  const warningAlerts = alerts.filter(a => a.severity === 'warning')
  const lowAlerts = alerts.filter(a => a.severity === 'low')

  const getSelectedAlerts = () => {
    switch (selectedSeverity) {
      case 'critical':
        return criticalAlerts
      case 'warning':
        return warningAlerts
      case 'low':
        return lowAlerts
      default:
        return []
    }
  }

  const getDialogTitle = () => {
    switch (selectedSeverity) {
      case 'critical':
        return 'Critical Stock Alerts - Out of Stock or Negative Inventory'
      case 'warning':
        return 'Warning Alerts - Inventory Below 2 Weeks'
      case 'low':
        return 'Low Stock Alerts - Inventory Below 4 Weeks'
      default:
        return ''
    }
  }

  if (alerts.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-emerald-600" />
          <span className="font-medium text-emerald-800">All inventory levels are healthy</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mb-4 space-y-2">
        {criticalAlerts.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedSeverity('critical')}
            className="w-full rounded-lg border border-red-300 bg-red-50 p-4 text-left transition-all hover:bg-red-100 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              <span className="font-semibold text-red-800">
                Critical: {criticalAlerts.length} SKU(s) out of stock or negative inventory
              </span>
            </div>
          </button>
        )}

        {warningAlerts.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedSeverity('warning')}
            className="w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-left transition-all hover:bg-amber-100 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <span className="font-semibold text-amber-800">
                Warning: {warningAlerts.length} SKU(s) with low inventory (less than 2 weeks)
              </span>
            </div>
          </button>
        )}

        {lowAlerts.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedSeverity('low')}
            className="w-full rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-left transition-all hover:bg-yellow-100 hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-yellow-600 shrink-0" />
              <span className="font-semibold text-yellow-800">
                Low Stock: {lowAlerts.length} SKU(s) with inventory below 4 weeks
              </span>
            </div>
          </button>
        )}
      </div>

      <Dialog open={!!selectedSeverity} onOpenChange={(open) => !open && setSelectedSeverity(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSeverity === 'critical' && <AlertTriangle className="h-5 w-5 text-red-600" />}
              {selectedSeverity === 'warning' && <AlertCircle className="h-5 w-5 text-amber-600" />}
              {selectedSeverity === 'low' && <Info className="h-5 w-5 text-yellow-600" />}
              {getDialogTitle()}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part/Model #</TableHead>
                  <TableHead>Week #</TableHead>
                  <TableHead>Week Of</TableHead>
                  <TableHead>Weeks on Hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {getSelectedAlerts().map((alert, idx) => (
                  <TableRow key={`${alert.skuId}-${idx}`}>
                    <TableCell className="font-medium">{alert.partModelNumber}</TableCell>
                    <TableCell>{alert.weekNumber}</TableCell>
                    <TableCell>{alert.weekOf}</TableCell>
                    <TableCell className={cn(
                      'font-mono font-bold',
                      alert.weeksOnHand < 0 && 'text-red-700',
                      alert.weeksOnHand >= 0 && alert.weeksOnHand < 1 && 'text-red-500',
                      alert.weeksOnHand >= 1 && alert.weeksOnHand < 2 && 'text-amber-600',
                      alert.weeksOnHand >= 2 && alert.weeksOnHand < 4 && 'text-yellow-600',
                    )}>
                      {alert.weeksOnHand.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
