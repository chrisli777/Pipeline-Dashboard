'use client'

import type { ProjectionWeek } from '@/lib/types'

interface SparklineProps {
  weeks: ProjectionWeek[]
  safetyStock: number
}

/**
 * Compact 12-week sparkline using pure SVG (no recharts overhead).
 * Shows projected inventory as an area, with safety stock as a dashed red line.
 */
export function ProjectionSparkline({ weeks, safetyStock }: SparklineProps) {
  if (!weeks.length) return <span className="text-xs text-slate-300">No data</span>

  const W = 200
  const H = 36
  const PAD = 2

  // Compute Y-axis bounds
  const values = weeks.map(w => w.projectedInventory)
  const allValues = [...values, safetyStock]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  const scaleX = (i: number) => PAD + (i / (weeks.length - 1)) * (W - 2 * PAD)
  const scaleY = (v: number) => H - PAD - ((v - minVal) / range) * (H - 2 * PAD)

  // Build path
  const points = values.map((v, i) => `${scaleX(i)},${scaleY(v)}`)
  const linePath = `M${points.join(' L')}`
  const areaPath = `${linePath} L${scaleX(values.length - 1)},${H - PAD} L${PAD},${H - PAD} Z`

  // Safety stock line Y
  const ssY = scaleY(safetyStock)

  // Find first danger zone (below SS)
  const hasRisk = values.some(v => v < safetyStock)
  const hasStockout = values.some(v => v <= 0)

  const areaColor = hasStockout ? 'rgba(239,68,68,0.15)' : hasRisk ? 'rgba(245,158,11,0.15)' : 'rgba(99,102,241,0.15)'
  const lineColor = hasStockout ? '#ef4444' : hasRisk ? '#f59e0b' : '#6366f1'

  return (
    <svg width={W} height={H} className="block">
      {/* Area fill */}
      <path d={areaPath} fill={areaColor} />
      {/* Inventory line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} />
      {/* Safety stock reference line */}
      <line
        x1={PAD} y1={ssY} x2={W - PAD} y2={ssY}
        stroke="#ef4444" strokeWidth={0.8} strokeDasharray="3,2" opacity={0.6}
      />
      {/* Zero line if visible */}
      {minVal < 0 && (
        <line
          x1={PAD} y1={scaleY(0)} x2={W - PAD} y2={scaleY(0)}
          stroke="#94a3b8" strokeWidth={0.5}
        />
      )}
    </svg>
  )
}
