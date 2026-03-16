'use client'

import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { InventoryAlert } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  const [dialogOpen, setDialogOpen] = useState(false)

  if (alerts.length === 0) return null

  // Find the earliest stockout week across all SKUs
  const earliest = alerts[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="mb-4 w-full rounded-lg border border-amber-300 bg-amber-50 p-3 text-left transition-all hover:bg-amber-100 hover:shadow-md cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm font-medium text-amber-800">
            {'Stockout Forecast: '}
            {alerts.length === 1
              ? `${earliest.partModelNumber} projected stockout at Week ${earliest.weekNumber} (${earliest.weekOf})`
              : `${alerts.length} SKUs with projected stockout, earliest Week ${earliest.weekNumber} (${earliest.weekOf})`
            }
          </span>
        </div>
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Stockout Forecast
            </DialogTitle>
            <DialogDescription>
              SKUs with projected inventory stockout based on current consumption rates.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Part / Model</TableHead>
                  <TableHead className="text-center">Stockout Week</TableHead>
                  <TableHead className="text-center">Week Of</TableHead>
                  <TableHead className="text-right">Weeks on Hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.skuId}>
                    <TableCell className="font-medium">{alert.partModelNumber}</TableCell>
                    <TableCell className="text-center">{alert.weekNumber}</TableCell>
                    <TableCell className="text-center">{alert.weekOf}</TableCell>
                    <TableCell className="text-right font-mono text-red-600 font-semibold">
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
