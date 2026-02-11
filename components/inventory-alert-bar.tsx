'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import type { InventoryAlert } from '@/lib/types'
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

export function InventoryAlertBar({ alerts }: InventoryAlertBarProps) {
  const [showDetails, setShowDetails] = useState(false)

  if (alerts.length === 0) {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <span className="font-medium text-emerald-800">All inventory levels are healthy - no reorder needed</span>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDetails(true)}
        className="mb-4 w-full rounded-lg border border-amber-300 bg-amber-50 p-4 text-left transition-all hover:bg-amber-100 hover:shadow-md cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <span className="font-semibold text-amber-800">
            Reorder Warning: {alerts.length} SKU(s) need replenishment within 12 weeks to avoid stockout
          </span>
        </div>
      </button>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Reorder Warning - 12 Week Lead Time Required
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part/Model #</TableHead>
                  <TableHead>Predicted Stockout Week</TableHead>
                  <TableHead>Stockout Date</TableHead>
                  <TableHead>Reorder By Week</TableHead>
                  <TableHead className="text-right">Weeks Until Stockout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert, idx) => (
                  <TableRow key={`${alert.skuId}-${idx}`}>
                    <TableCell className="font-medium">{alert.partModelNumber}</TableCell>
                    <TableCell>Week {alert.stockoutWeekNumber}</TableCell>
                    <TableCell>{alert.stockoutWeekOf}</TableCell>
                    <TableCell className="font-semibold text-amber-700">
                      {alert.reorderByWeekNumber <= 0 
                        ? 'Overdue - Order Now!' 
                        : `Week ${alert.reorderByWeekNumber} (${alert.reorderByWeekOf})`}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold text-amber-700">
                      {alert.weeksUntilStockout}
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
