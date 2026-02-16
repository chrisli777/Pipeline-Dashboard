'use client'

import { useState, useMemo } from 'react'
import {
  AlertCircle, AlertTriangle, CheckCircle2, Shield, ChevronDown, ChevronRight,
  Copy, Check, TrendingDown, Package, Truck, Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildRiskReport, generateMeetingText } from '@/lib/risk-report-generator'
import { ProjectionSparkline } from './projection-sparkline'
import { ProjectionDetailChart } from './projection-detail-chart'
import type {
  SKUProjection, ReplenishmentSuggestion, ProjectionSummary,
  RiskItem, RiskReport,
} from '@/lib/types'

interface RiskAnalysisTabProps {
  projections: SKUProjection[]
  suggestions: ReplenishmentSuggestion[]
  summary: ProjectionSummary
  currentWeek: number
}

export function RiskAnalysisTab({ projections, suggestions, summary, currentWeek }: RiskAnalysisTabProps) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null)
  const [showOkItems, setShowOkItems] = useState(false)
  const [showAllWarnings, setShowAllWarnings] = useState(false)
  const [copied, setCopied] = useState(false)

  const report = useMemo(() =>
    buildRiskReport(projections, suggestions, summary, currentWeek),
    [projections, suggestions, summary, currentWeek]
  )

  const meetingText = useMemo(() => generateMeetingText(report), [report])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(meetingText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const ta = document.createElement('textarea')
      ta.value = meetingText
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Demand source stats
  const forecastCount = projections.filter(p => p.demandSource === 'forecast').length

  return (
    <div className="space-y-4">
      {/* Risk Summary Banner */}
      <RiskBanner report={report} forecastCount={forecastCount} totalSkus={projections.length} />

      {/* Critical SKU Cards */}
      {report.criticalItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <h3 className="text-base font-semibold text-red-900">{'Critical \u2014 Immediate Action Required'}</h3>
          </div>
          {report.criticalItems.map(item => (
            <RiskCard
              key={item.skuCode}
              item={item}
              variant="critical"
              expanded={expandedSku === item.skuCode}
              onToggle={() => setExpandedSku(expandedSku === item.skuCode ? null : item.skuCode)}
              currentWeek={currentWeek}
              projections={projections}
            />
          ))}
        </div>
      )}

      {/* Warning SKU Cards */}
      {report.warningItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-base font-semibold text-amber-900">{'Warning \u2014 Monitor Closely'}</h3>
          </div>
          {(showAllWarnings ? report.warningItems : report.warningItems.slice(0, 5)).map(item => (
            <RiskCard
              key={item.skuCode}
              item={item}
              variant="warning"
              expanded={expandedSku === item.skuCode}
              onToggle={() => setExpandedSku(expandedSku === item.skuCode ? null : item.skuCode)}
              currentWeek={currentWeek}
              projections={projections}
            />
          ))}
          {report.warningItems.length > 5 && !showAllWarnings && (
            <button
              onClick={() => setShowAllWarnings(true)}
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              {'Show all '}{report.warningItems.length}{' warning SKUs'}
            </button>
          )}
        </div>
      )}

      {/* OK SKU Summary */}
      {report.okItems.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200">
          <button
            onClick={() => setShowOkItems(!showOkItems)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-900">{'OK \u2014 '}{report.okCount}{' SKUs with adequate stock'}</span>
            </div>
            {showOkItems ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          </button>
          {showOkItems && (
            <div className="border-t border-slate-100 px-4 pb-3">
              <table className="w-full text-xs mt-2">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-3 py-1.5 text-left">SKU</th>
                    <th className="px-3 py-1.5 text-left">Part</th>
                    <th className="px-3 py-1.5 text-left">Supplier</th>
                    <th className="px-3 py-1.5 text-right">On-Hand</th>
                    <th className="px-3 py-1.5 text-right">Wks Cover</th>
                    <th className="px-3 py-1.5 text-center">Source</th>
                    <th className="px-3 py-1.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.okItems.map(item => (
                    <tr key={item.skuCode} className="border-b border-slate-50">
                      <td className="px-3 py-1.5 font-mono">{item.skuCode}</td>
                      <td className="px-3 py-1.5 text-slate-600">{item.partModel?.split('/')[1]?.trim() || '-'}</td>
                      <td className="px-3 py-1.5">{item.supplierCode || '-'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{Math.round(item.currentInventory)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{item.weeksOfCover}</td>
                      <td className="px-3 py-1.5 text-center">
                        <DemandSourceBadge source={item.demandSource} small />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="text-emerald-600">{'\u2713'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Action Plan Summary (Copyable) */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-800">Meeting Summary</span>
          </div>
          <button
            onClick={handleCopy}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors',
              copied
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? 'Copied!' : 'Copy to clipboard'}
          </button>
        </div>
        <pre className="px-4 py-3 text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
          {meetingText}
        </pre>
      </div>
    </div>
  )
}

// Sub-components

function RiskBanner({ report, forecastCount, totalSkus }: { report: RiskReport; forecastCount: number; totalSkus: number }) {
  const bgColor = report.criticalCount > 0
    ? 'bg-red-50 border-red-200'
    : report.warningCount > 0
      ? 'bg-amber-50 border-amber-200'
      : 'bg-emerald-50 border-emerald-200'

  const textColor = report.criticalCount > 0 ? 'text-red-900' : report.warningCount > 0 ? 'text-amber-900' : 'text-emerald-900'
  const subColor = report.criticalCount > 0 ? 'text-red-700' : report.warningCount > 0 ? 'text-amber-700' : 'text-emerald-700'

  const riskCount = report.criticalCount + report.warningCount

  return (
    <div className={cn('rounded-lg border p-5', bgColor)}>
      <div className="flex items-center justify-between">
        <div>
          <div className={cn('text-xl font-bold', textColor)}>
            {riskCount === 0
              ? 'All SKUs Healthy'
              : `${riskCount} SKU${riskCount > 1 ? 's' : ''} at Risk`}
            {report.unmitigatedRiskCount > 0 && (
              <span className="text-base font-semibold text-red-600 ml-2">
                {'('}{report.unmitigatedRiskCount}{' need immediate action)'}
              </span>
            )}
          </div>
          <div className={cn('text-sm mt-1', subColor)}>
            {report.reportWeekLabel}{' \u2022 '}{totalSkus}{' SKUs monitored'}
            {report.totalPendingOrders > 0 && (
              <span>{' \u2022 '}{report.totalPendingOrders}{' pending orders (~$'}{report.totalOrderValue.toLocaleString()}{')'}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DemandSourceIndicator forecastCount={forecastCount} totalSkus={totalSkus} />
          <div className="flex gap-2">
            <StatusPill count={report.criticalCount} label="Critical" color="red" />
            <StatusPill count={report.warningCount} label="Warning" color="amber" />
            <StatusPill count={report.okCount} label="OK" color="emerald" />
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ count, label, color }: { count: number; label: string; color: 'red' | 'amber' | 'emerald' }) {
  const colors = {
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    emerald: 'bg-emerald-100 text-emerald-800',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold', colors[color])}>
      {count} {label}
    </span>
  )
}

function DemandSourceIndicator({ forecastCount, totalSkus }: { forecastCount: number; totalSkus: number }) {
  if (forecastCount === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
        Historical Average
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded">
      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
      {'Genie Forecast ('}{forecastCount}{'/'}{totalSkus}{')'}
    </div>
  )
}

function DemandSourceBadge({ source, small }: { source: 'forecast' | 'historical'; small?: boolean }) {
  if (source === 'forecast') {
    return (
      <span className={cn('inline-flex items-center gap-0.5 rounded text-emerald-700 bg-emerald-50 font-medium',
        small ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5'
      )}>
        FC
      </span>
    )
  }
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded text-slate-500 bg-slate-50 font-medium',
      small ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5'
    )}>
      AVG
    </span>
  )
}

interface RiskCardProps {
  item: RiskItem
  variant: 'critical' | 'warning'
  expanded: boolean
  onToggle: () => void
  currentWeek: number
  projections: SKUProjection[]
}

function RiskCard({ item, variant, expanded, onToggle, currentWeek, projections }: RiskCardProps) {
  const borderColor = variant === 'critical' ? 'border-l-red-500' : 'border-l-amber-500'
  const proj = projections.find(p => p.skuCode === item.skuCode)

  const model = item.partModel?.split('/')[1]?.trim() || ''

  return (
    <div className={cn('bg-white rounded-lg border border-slate-200 border-l-4 overflow-hidden', borderColor)}>
      {/* Card Header */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={onToggle}
      >
        <div className="mt-0.5 text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-slate-900">{item.skuCode}</span>
            {model && <span className="text-sm text-slate-600">{model}</span>}
            {item.supplierCode && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
                {item.supplierCode}
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-medium">
              {item.matrixCell}
            </span>
            <DemandSourceBadge source={item.demandSource} />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-4 gap-4 mt-2">
            <StatMini icon={<Package className="h-3 w-3" />} label="On-Hand" value={`${Math.round(item.currentInventory)}`} />
            <StatMini icon={<Truck className="h-3 w-3" />} label="In-Transit" value={`${Math.round(item.totalInTransit)}`} accent={item.totalInTransit > 0 ? 'blue' : undefined} />
            <StatMini icon={<TrendingDown className="h-3 w-3" />} label="Inv. Position" value={`${Math.round(item.inventoryPosition)}`} />
            <StatMini icon={<Clock className="h-3 w-3" />} label="Days Supply" value={`${item.daysOfSupply}`} accent={item.daysOfSupply < 30 ? 'red' : undefined} />
          </div>

          {/* Risk + Action */}
          <div className="mt-2 space-y-1">
            {item.stockoutDate && (
              <div className="text-xs font-semibold text-red-600">
                {'Stockout expected '}{item.stockoutDate}
                {item.weeksUntilStockout !== null && ` (${item.weeksUntilStockout} weeks)`}
              </div>
            )}
            <div className={cn('text-xs font-semibold',
              item.mitigationStatus === 'COVERED' ? 'text-emerald-600' :
              item.mitigationStatus === 'PARTIAL' ? 'text-amber-600' : 'text-red-600'
            )}>
              {item.actionNote}
            </div>
            <div className="text-xs text-slate-500">
              {item.customerImpactNote}
            </div>
          </div>
        </div>

        {/* Sparkline */}
        <div className="flex-shrink-0 ml-2 mt-1">
          {proj && (
            <ProjectionSparkline weeks={proj.weeks} safetyStock={proj.safetyStock} />
          )}
        </div>
      </div>

      {/* Expanded Detail Chart */}
      {expanded && proj && (
        <div className="border-t border-slate-100 px-4 py-4 bg-slate-50">
          <ProjectionDetailChart projection={proj} currentWeek={currentWeek} />
        </div>
      )}
    </div>
  )
}

function StatMini({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: 'red' | 'blue' }) {
  const valueColor = accent === 'red' ? 'text-red-700' : accent === 'blue' ? 'text-blue-700' : 'text-slate-900'
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wide">
        {icon} {label}
      </div>
      <div className={cn('text-sm font-semibold font-mono', valueColor)}>{value}</div>
    </div>
  )
}
