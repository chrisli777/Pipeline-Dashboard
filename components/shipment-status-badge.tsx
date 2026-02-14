'use client'

import { cn } from '@/lib/utils'
import { type ShipmentStatus, SHIPMENT_STATUS_LABELS } from '@/lib/types'

const STATUS_COLORS: Record<ShipmentStatus, string> = {
  ON_WATER: 'bg-blue-100 text-blue-800 border-blue-200',
  CLEARED: 'bg-teal-100 text-teal-800 border-teal-200',
  DELIVERING: 'bg-orange-100 text-orange-800 border-orange-200',
  DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  CLOSED: 'bg-gray-100 text-gray-600 border-gray-200',
}

const STATUS_ICONS: Record<ShipmentStatus, string> = {
  ON_WATER: '\u{1F6A2}',     // 🚢 ship
  CLEARED: '\u{2705}',       // ✅ check
  DELIVERING: '\u{1F69B}',   // 🚛 truck
  DELIVERED: '\u{1F4E6}',    // 📦 package
  CLOSED: '\u{1F512}',       // 🔒 lock
}

interface ShipmentStatusBadgeProps {
  status: ShipmentStatus | string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

export function ShipmentStatusBadge({ status, size = 'md', showIcon = true }: ShipmentStatusBadgeProps) {
  const safeStatus = (status && status in STATUS_COLORS ? status : 'ON_WATER') as ShipmentStatus
  const label = SHIPMENT_STATUS_LABELS[safeStatus] || safeStatus
  const colorClass = STATUS_COLORS[safeStatus] || STATUS_COLORS.ON_WATER
  const icon = STATUS_ICONS[safeStatus]

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        colorClass,
        sizeClasses[size]
      )}
    >
      {showIcon && <span className="text-xs">{icon}</span>}
      {label}
    </span>
  )
}

// LFD Status Badge
interface LfdBadgeProps {
  lfd: string | null
  status: ShipmentStatus | string | null
}

export function LfdStatusBadge({ lfd, status }: LfdBadgeProps) {
  if (!lfd || !status) return <span className="text-gray-400 text-xs">-</span>

  if (['DELIVERED', 'CLOSED'].includes(status)) {
    return <span className="text-gray-400 text-xs">Resolved</span>
  }

  const lfdDate = new Date(lfd)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const daysToLfd = Math.ceil((lfdDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let colorClass = 'bg-green-100 text-green-800'
  let label = `${daysToLfd}d`

  if (daysToLfd < 0) {
    colorClass = 'bg-red-100 text-red-800 animate-pulse'
    label = `${Math.abs(daysToLfd)}d overdue`
  } else if (daysToLfd <= 3) {
    colorClass = 'bg-red-100 text-red-800'
    label = `${daysToLfd}d left`
  } else if (daysToLfd <= 7) {
    colorClass = 'bg-amber-100 text-amber-800'
    label = `${daysToLfd}d left`
  }

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', colorClass)}>
      LFD: {label}
    </span>
  )
}
