'use client'

import type { SKUProjection } from '@/lib/types'

interface DetailChartProps {
  projection: SKUProjection
  currentWeek: number
}

/**
 * Expanded detail chart for a single SKU's 12-week projection.
 * Pure SVG — no recharts dependency for better performance.
 */
export function ProjectionDetailChart({ projection, currentWeek }: DetailChartProps) {
  const weeks = projection.weeks
  if (!weeks.length) return null

  const W = 800
  const H = 260
  const MARGIN = { top: 20, right: 20, bottom: 40, left: 60 }
  const chartW = W - MARGIN.left - MARGIN.right
  const chartH = H - MARGIN.top - MARGIN.bottom

  // Y-axis
  const allValues = [
    ...weeks.map(w => w.projectedInventory),
    ...weeks.map(w => w.inTransitArrival),
    projection.safetyStock,
    projection.reorderPoint,
    projection.targetInventory,
    0,
  ]
  const maxVal = Math.max(...allValues) * 1.1
  const minVal = Math.min(...allValues, 0)
  const range = maxVal - minVal || 1

  const xScale = (i: number) => MARGIN.left + (i + 0.5) / weeks.length * chartW
  const yScale = (v: number) => MARGIN.top + chartH - ((v - minVal) / range) * chartH
  const barW = chartW / weeks.length * 0.6

  // Projected inventory path
  const projPoints = weeks.map((w, i) => `${xScale(i)},${yScale(w.projectedInventory)}`)
  const projLine = `M${projPoints.join(' L')}`

  // Y-axis ticks
  const nTicks = 5
  const yTicks = Array.from({ length: nTicks + 1 }, (_, i) => {
    const v = minVal + (range * i) / nTicks
    return { value: Math.round(v), y: yScale(v) }
  })

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n.toFixed(0)

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-slate-600 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 bg-indigo-600 inline-block"></span> Projected Inventory
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #ef4444' }}></span> Safety Stock ({Math.round(projection.safetyStock)})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #f59e0b' }}></span> Reorder Point ({projection.reorderPoint})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #10b981' }}></span> Target ({projection.targetInventory})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 bg-emerald-200 border border-emerald-400 inline-block rounded-sm"></span> In-Transit Arrival
        </span>
        <span className="ml-auto text-slate-400">
          LT: {projection.leadTimeWeeks}wk &bull; MOQ: {projection.moq} &bull; Method: {projection.replenishmentMethod}
        </span>
      </div>

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Grid lines */}
        {yTicks.map(t => (
          <g key={t.value}>
            <line x1={MARGIN.left} y1={t.y} x2={W - MARGIN.right} y2={t.y}
              stroke="#e2e8f0" strokeWidth={0.5} />
            <text x={MARGIN.left - 8} y={t.y + 4} textAnchor="end"
              className="fill-slate-400" fontSize={10}>
              {fmt(t.value)}
            </text>
          </g>
        ))}

        {/* In-transit arrival bars */}
        {weeks.map((w, i) => w.inTransitArrival > 0 && (
          <rect
            key={`it-${i}`}
            x={xScale(i) - barW / 2}
            y={yScale(w.inTransitArrival)}
            width={barW}
            height={Math.max(1, yScale(0) - yScale(w.inTransitArrival))}
            fill="#bbf7d0"
            stroke="#4ade80"
            strokeWidth={0.5}
            rx={2}
          />
        ))}

        {/* Reference lines */}
        {/* Target */}
        <line
          x1={MARGIN.left} y1={yScale(projection.targetInventory)}
          x2={W - MARGIN.right} y2={yScale(projection.targetInventory)}
          stroke="#10b981" strokeWidth={1} strokeDasharray="6,3" opacity={0.6}
        />
        {/* Reorder Point */}
        <line
          x1={MARGIN.left} y1={yScale(projection.reorderPoint)}
          x2={W - MARGIN.right} y2={yScale(projection.reorderPoint)}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}
        />
        {/* Safety Stock */}
        <line
          x1={MARGIN.left} y1={yScale(projection.safetyStock)}
          x2={W - MARGIN.right} y2={yScale(projection.safetyStock)}
          stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7}
        />
        {/* Zero line */}
        <line
          x1={MARGIN.left} y1={yScale(0)} x2={W - MARGIN.right} y2={yScale(0)}
          stroke="#64748b" strokeWidth={0.5}
        />

        {/* Projected inventory area fill (below SS turns red) */}
        {weeks.map((w, i) => {
          if (i === 0) return null
          const prev = weeks[i - 1]
          const x1 = xScale(i - 1), x2 = xScale(i)
          const y1 = yScale(prev.projectedInventory), y2 = yScale(w.projectedInventory)
          const bottomY = yScale(0)
          const fill = w.projectedInventory < projection.safetyStock ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)'
          return (
            <polygon
              key={`area-${i}`}
              points={`${x1},${y1} ${x2},${y2} ${x2},${bottomY} ${x1},${bottomY}`}
              fill={fill}
            />
          )
        })}

        {/* Projected inventory line */}
        <path d={projLine} fill="none" stroke="#6366f1" strokeWidth={2} />

        {/* Data points */}
        {weeks.map((w, i) => (
          <circle
            key={`dot-${i}`}
            cx={xScale(i)} cy={yScale(w.projectedInventory)}
            r={3}
            fill={w.status === 'STOCKOUT' ? '#ef4444' : w.status === 'CRITICAL' ? '#f59e0b' : '#6366f1'}
            stroke="white" strokeWidth={1}
          />
        ))}

        {/* X-axis labels */}
        {weeks.map((w, i) => (
          <text
            key={`xl-${i}`}
            x={xScale(i)} y={H - 8}
            textAnchor="middle"
            className="fill-slate-500" fontSize={9}
          >
            W{w.weekNumber}
          </text>
        ))}

        {/* X-axis dates (every other) */}
        {weeks.map((w, i) => i % 2 === 0 && (
          <text
            key={`xd-${i}`}
            x={xScale(i)} y={H - 20}
            textAnchor="middle"
            className="fill-slate-400" fontSize={8}
          >
            {w.weekStartDate.slice(5)}
          </text>
        ))}
      </svg>

      {/* Detail stats */}
      <div className="grid grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-50 rounded p-2">
          <div className="text-slate-500">Current Inventory</div>
          <div className="font-semibold">{Math.round(projection.currentInventory).toLocaleString()} units</div>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <div className="text-slate-500">Weeks of Cover</div>
          <div className="font-semibold">
            {projection.avgWeeklyDemand > 0
              ? `${(projection.currentInventory / projection.avgWeeklyDemand).toFixed(1)} weeks`
              : 'N/A'}
          </div>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <div className="text-slate-500">Safety Stock</div>
          <div className="font-semibold">{Math.round(projection.safetyStock).toLocaleString()} units ({projection.safetyStockWeeks.toFixed(1)} wks)</div>
        </div>
        <div className="bg-slate-50 rounded p-2">
          <div className="text-slate-500">Stockout Risk</div>
          <div className="font-semibold">
            {projection.stockoutWeek
              ? <span className="text-red-600">Week {projection.stockoutWeek}</span>
              : <span className="text-emerald-600">None in 12-wk window</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
