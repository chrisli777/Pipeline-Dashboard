'use client'

import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TrackingData {
  shipped_date: string | null
  departed_date: string | null
  arrived_port_date: string | null
  cleared_date: string | null
  picked_up_date: string | null
  scheduled_date: string | null
  delivered_date: string | null
  closed_date: string | null
  status: string
}

interface ShipmentStatusTimelineProps {
  tracking: TrackingData | null
}

const STEPS = [
  { key: 'shipped_date', label: 'Shipped', number: 1 },
  { key: 'departed_date', label: 'In Transit', number: 2 },
  { key: 'arrived_port_date', label: 'Arrived at Port', number: 3 },
  { key: 'cleared_date', label: 'Customs Cleared', number: 4 },
  { key: 'picked_up_date', label: 'Picked Up', number: 5 },
  { key: 'scheduled_date', label: 'Delivery Scheduled', number: 6 },
  { key: 'delivered_date', label: 'Delivered', number: 7 },
  { key: 'closed_date', label: 'Closed', number: 8 },
]

// Map general statuses to step completion
function getCompletedStepIndex(tracking: TrackingData): number {
  // Check each step date from the end backwards to find the latest completed step
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const dateVal = tracking[STEPS[i].key as keyof TrackingData]
    if (dateVal && dateVal !== tracking.status) {
      return i
    }
  }
  // Fallback: use status field to determine position
  const statusMap: Record<string, number> = {
    'SHIPPED': 0,
    'IN_TRANSIT': 1,
    'ARRIVED': 2,
    'CLEARED': 3,
    'PICKED_UP': 4,
    'DELIVERY_SCHEDULED': 5,
    'DELIVERED': 6,
    'CLOSED': 7,
  }
  return statusMap[tracking.status] ?? -1
}

export function ShipmentStatusTimeline({ tracking }: ShipmentStatusTimelineProps) {
  if (!tracking) return null

  const completedIndex = getCompletedStepIndex(tracking)

  // Also check individual dates for more accurate completion
  const isStepCompleted = (stepIndex: number): boolean => {
    const step = STEPS[stepIndex]
    const dateVal = tracking[step.key as keyof TrackingData]
    if (dateVal && typeof dateVal === 'string' && dateVal.match(/^\d{4}-\d{2}-\d{2}/)) {
      return true
    }
    return stepIndex <= completedIndex
  }

  // Find the current active step (first incomplete after last completed)
  const currentStepIndex = STEPS.findIndex((_, i) => !isStepCompleted(i))

  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Status Timeline</h4>
      <div className="flex items-center">
        {STEPS.map((step, idx) => {
          const completed = isStepCompleted(idx)
          const isCurrent = idx === currentStepIndex
          const isLast = idx === STEPS.length - 1

          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              {/* Step circle + label */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  completed
                    ? 'bg-emerald-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white ring-4 ring-blue-100'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {completed ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span className={cn(
                  'text-[10px] mt-1.5 whitespace-nowrap font-medium',
                  completed ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className={cn(
                  'flex-1 h-0.5 mx-1 mt-[-18px]',
                  completed ? 'bg-emerald-500' : 'bg-muted'
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
