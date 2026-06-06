'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, Download, Search, RefreshCw, ChevronDown, ChevronRight,
  Loader2, Calendar, Package, AlertCircle, CheckCircle2, Filter,
  Archive, RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// Types
interface SkuItem {
  sku: string
  quantity: number
  description: string
}

interface OrderFile {
  fileId: string
  fileName: string
  fileType: string
  fileSize: number
  uploadDate: string | null
  downloadUrl: string | null
}

interface Order {
  orderId: string
  referenceNumber: string
  poNumber: string
  customerName: string
  warehouseName: string
  warehouseId: string
  status: string
  processDate: string | null
  creationDate: string | null
  isClosed: boolean
  skuSummary: SkuItem[]
  totalQuantity: number
  totalSkus: number
  hasFiles: boolean
}

interface ParseResult {
  status: 'match' | 'mismatch' | 'no_files' | 'bol_missing' | 'po_missing' | 'no_data' | 'error'
  bolData: { items: { sku: string; quantity: number; description?: string }[] } | null
  poData: { items: { sku: string; quantity: number; description?: string }[] } | null
  comparison: {
    status: string
    matches: { sku: string; bolQty: number; poQty: number }[]
    mismatches: { sku: string; bolQty: number | null; poQty: number | null; status: string; message: string }[]
  } | null
  bolFileName?: string
  poFileName?: string
  message?: string
}

interface Pagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// Warehouse and supplier options
const WAREHOUSES = ['Moses Lake', 'Kent']
const SUPPLIERS = ['HX', 'AMC', 'TJJSH', 'PMP', 'WINSCHEM', 'DONGYU']

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusColor(status: string, isClosed: boolean): string {
  if (isClosed) return 'bg-green-100 text-green-800'
  switch (status?.toLowerCase()) {
    case 'complete':
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'processing':
      return 'bg-blue-100 text-blue-800'
    case 'pending':
      return 'bg-amber-100 text-amber-800'
    default:
      return 'bg-slate-100 text-slate-800'
  }
}

export function PoBolDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filters
  const [warehouse, setWarehouse] = useState('Moses Lake')
  const [supplier, setSupplier] = useState('HX')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSkus, setSelectedSkus] = useState<string[]>([])
  const [showOnlyIssues, setShowOnlyIssues] = useState(false) // Toggle to show only issues from DB
  
  // Pagination
  const [pagination, setPagination] = useState<Pagination>({
  page: 1,
  pageSize: 1000, // Large page size to get all orders
  totalCount: 0,
  totalPages: 0,
  })
  
  // SKUs from database for the selected supplier
  const [supplierSkus, setSupplierSkus] = useState<string[]>([])
  
  // Expanded rows for SKU details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  
  // File loading states
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set())
  const [orderFiles, setOrderFiles] = useState<Record<string, OrderFile[]>>({})
  
  // Parse comparison states
  const [parsingOrders, setParsingOrders] = useState<Set<string>>(new Set())
  const [parseResults, setParseResults] = useState<Record<string, ParseResult>>({})
  
  // Batch operation states
  const [batchDownloading, setBatchDownloading] = useState(false)
  const [batchParsing, setBatchParsing] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 })
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [resultsModalType, setResultsModalType] = useState<'parse' | 'download'>('parse')
  const [batchDownloadResults, setBatchDownloadResults] = useState<{
    success: { orderId: string; refNumber: string }[]
    failed: { orderId: string; refNumber: string; error: string }[]
  }>({ success: [], failed: [] })
  const [batchParseResults, setBatchParseResults] = useState<{
    matches: { orderId: string; refNumber: string }[]
    mismatches: { orderId: string; refNumber: string; issues: string[] }[]
    noFiles: { orderId: string; refNumber: string }[]
    errors: { orderId: string; refNumber: string; message: string }[]
  }>({ matches: [], mismatches: [], noFiles: [], errors: [] })

  // Parse issues panel state
  const [showDiscrepanciesPanel, setShowDiscrepanciesPanel] = useState(false)
  
  // Saved discrepancies from database
  const [savedDiscrepancies, setSavedDiscrepancies] = useState<any[]>([])
  const [loadingDiscrepancies, setLoadingDiscrepancies] = useState(false)

  // Fetch saved discrepancies from DB
  const fetchDiscrepancies = useCallback(async () => {
    setLoadingDiscrepancies(true)
    try {
      const params = new URLSearchParams({
        warehouse,
        supplier,
        resolved: 'false', // Only unresolved issues
      })
      const response = await fetch(`/api/po-bol-discrepancies?${params}`)
      if (response.ok) {
        const data = await response.json()
        setSavedDiscrepancies(data.discrepancies || [])
      }
    } catch (err) {
      console.error('[v0] Failed to fetch discrepancies:', err)
    } finally {
      setLoadingDiscrepancies(false)
    }
  }, [warehouse, supplier])

  // Save discrepancy to DB
  const saveDiscrepancy = async (order: Order, result: ParseResult) => {
    // Only save if there's an issue (not a match)
    if (result.status === 'match') return
    
    try {
      await fetch('/api/po-bol-discrepancies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.orderId,
          referenceNumber: order.referenceNumber,
          warehouse,
          supplierCode: supplier,
          customerName: order.customerName,
          processDate: order.processDate,
          status: result.status,
          bolData: result.bolData,
          poData: result.poData,
          comparisonData: result.comparison,
          errorMessage: result.message || null,
        }),
      })
      // Refresh discrepancies list
      fetchDiscrepancies()
    } catch (err) {
      console.error('[v0] Failed to save discrepancy:', err)
    }
  }

  // Remove discrepancy from DB (when resolved)
  const resolveDiscrepancy = async (orderId: string) => {
    try {
      const discrepancy = savedDiscrepancies.find(d => d.order_id === orderId)
      if (discrepancy) {
        await fetch('/api/po-bol-discrepancies', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: discrepancy.id, resolved: true }),
        })
        fetchDiscrepancies()
      }
    } catch (err) {
      console.error('[v0] Failed to resolve discrepancy:', err)
    }
  }

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const params = new URLSearchParams({
        warehouse,
        supplier,
        startDate,
        endDate,
        page: pagination.page.toString(),
        pageSize: pagination.pageSize.toString(),
      })
      
      const response = await fetch(`/api/wms/orders?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch orders')
      }
      
      const data = await response.json()
      setOrders(data.orders || [])
      setPagination(data.pagination || pagination)
    } catch (err) {
      console.error('[v0] Fetch orders error:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch orders')
    } finally {
      setLoading(false)
    }
  }, [warehouse, supplier, startDate, endDate, pagination.page, pagination.pageSize])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  // Fetch saved discrepancies when warehouse/supplier changes
  useEffect(() => {
    fetchDiscrepancies()
  }, [fetchDiscrepancies])

  // Fetch SKUs for the selected supplier from database
  useEffect(() => {
    async function fetchSupplierSkus() {
      try {
        const response = await fetch(`/api/skus?supplier=${supplier}`)
        if (response.ok) {
          const data = await response.json()
          setSupplierSkus(data.skus?.map((s: { sku_code: string }) => s.sku_code) || [])
        }
      } catch (err) {
        console.error('[v0] Failed to fetch supplier SKUs:', err)
      }
    }
    fetchSupplierSkus()
  }, [supplier])

  const toggleRow = (orderId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  const fetchOrderFiles = async (orderId: string) => {
    if (orderFiles[orderId]) return // Already fetched
    
    setLoadingFiles(prev => new Set(prev).add(orderId))
    
    try {
      const params = new URLSearchParams({ warehouse, supplier })
      const response = await fetch(`/api/wms/orders/${orderId}/files?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch files')
      }
      
      const data = await response.json()
      setOrderFiles(prev => ({
        ...prev,
        [orderId]: data.files || [],
      }))
    } catch (err) {
      console.error('[v0] Fetch files error:', err)
      setOrderFiles(prev => ({
        ...prev,
        [orderId]: [],
      }))
    } finally {
      setLoadingFiles(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  const downloadFile = async (orderId: string, fileId: string, fileName: string) => {
    try {
      const params = new URLSearchParams({ warehouse, supplier })
      const response = await fetch(`/api/wms/orders/${orderId}/files/${fileId}?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to download file')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('[v0] Download file error:', err)
      alert('Failed to download file')
    }
  }

  // Download merged BOL + PO PDF
  const downloadMergedPdf = async (orderId: string, referenceNumber: string) => {
    try {
      const params = new URLSearchParams({ 
        warehouse, 
        supplierCode: supplier,
        referenceNumber 
      })
      const response = await fetch(`/api/wms/orders/${orderId}/merge-files?${params}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to download merged file')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${referenceNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err: any) {
      console.error('[v0] Merge download error:', err)
      alert(err.message || 'Failed to download merged file')
    }
  }

  // Parse and compare BOL vs PO
  const parseAndCompare = async (orderId: string, forceReparse = false) => {
    // Skip if already parsing
    if (parsingOrders.has(orderId)) return
    // Skip if already have successful result (match) unless force reparse
    const existingResult = parseResults[orderId]
    if (existingResult && existingResult.status === 'match' && !forceReparse) return

    setParsingOrders(prev => new Set(prev).add(orderId))
    
    try {
      const response = await fetch(`/api/wms/orders/${orderId}/parse-compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warehouse, supplierCode: supplier }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to parse files')
      }
      
  const data = await response.json()
  setParseResults(prev => ({ ...prev, [orderId]: data.result }))
  
  // Save discrepancy to DB if there's an issue
  const order = orders.find(o => o.orderId === orderId)
  if (order && data.result) {
    saveDiscrepancy(order, data.result)
  }
  } catch (err: any) {
      console.error('[v0] Parse compare error:', err)
      setParseResults(prev => ({ 
        ...prev, 
        [orderId]: { 
          status: 'error', 
          message: err.message,
          bolData: null,
          poData: null,
          comparison: null,
        } 
      }))
    } finally {
      setParsingOrders(prev => {
        const next = new Set(prev)
        next.delete(orderId)
        return next
      })
    }
  }

  // Batch download all filtered orders as ZIP
  const downloadAllAsZip = async () => {
    if (filteredOrders.length === 0) {
      alert('No orders to download')
      return
    }

    setBatchDownloading(true)
    setBatchProgress({ current: 0, total: filteredOrders.length })

    const zip = new JSZip()
    const results = {
      success: [] as { orderId: string; refNumber: string }[],
      failed: [] as { orderId: string; refNumber: string; error: string }[],
    }

    for (let i = 0; i < filteredOrders.length; i++) {
      const order = filteredOrders[i]
      setBatchProgress({ current: i + 1, total: filteredOrders.length })

      try {
        const params = new URLSearchParams({
          warehouse,
          supplierCode: supplier,
          referenceNumber: order.referenceNumber,
        })
        const response = await fetch(`/api/wms/orders/${order.orderId}/merge-files?${params}`)

        if (response.ok) {
          const blob = await response.blob()
          const fileName = `${order.referenceNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`
          zip.file(fileName, blob)
          results.success.push({ orderId: order.orderId, refNumber: order.referenceNumber })
        } else {
          const errorData = await response.json().catch(() => ({}))
          results.failed.push({ 
            orderId: order.orderId, 
            refNumber: order.referenceNumber,
            error: errorData.error || `HTTP ${response.status}`,
          })
        }
      } catch (err: any) {
        results.failed.push({ 
          orderId: order.orderId, 
          refNumber: order.referenceNumber,
          error: err.message || 'Network error',
        })
      }
    }

    if (results.success.length > 0) {
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = window.URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Orders_${warehouse}_${supplier}_${startDate}_${endDate}.zip`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    }

    setBatchDownloading(false)
    setBatchDownloadResults(results)
    if (results.failed.length > 0) {
      setResultsModalType('download')
      setShowResultsModal(true)
    }
  }

  // Batch parse all filtered orders
  const parseAllOrders = async () => {
    if (filteredOrders.length === 0) {
      alert('No orders to parse')
      return
    }

    setBatchParsing(true)
    setBatchProgress({ current: 0, total: filteredOrders.length })
    
    const results = {
      matches: [] as { orderId: string; refNumber: string }[],
      mismatches: [] as { orderId: string; refNumber: string; issues: string[] }[],
      noFiles: [] as { orderId: string; refNumber: string }[],
      errors: [] as { orderId: string; refNumber: string; message: string }[],
    }

    for (let i = 0; i < filteredOrders.length; i++) {
      const order = filteredOrders[i]
      setBatchProgress({ current: i + 1, total: filteredOrders.length })

      try {
        const response = await fetch(`/api/wms/orders/${order.orderId}/parse-compare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ warehouse, supplierCode: supplier }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          results.errors.push({
            orderId: order.orderId,
            refNumber: order.referenceNumber,
            message: errorData.error || 'API error',
          })
          continue
        }

        const data = await response.json()
        const result = data.result as ParseResult

        // Update individual parse results
        setParseResults(prev => ({ ...prev, [order.orderId]: result }))
        
        // Save discrepancy to DB if there's an issue
        saveDiscrepancy(order, result)

        // Categorize result
        if (result.status === 'match') {
          results.matches.push({ orderId: order.orderId, refNumber: order.referenceNumber })
        } else if (result.status === 'mismatch') {
          const issues = result.comparison?.mismatches.map(m => m.message) || ['Unknown mismatch']
          results.mismatches.push({ orderId: order.orderId, refNumber: order.referenceNumber, issues })
        } else if (result.status === 'no_files' || result.status === 'bol_missing' || result.status === 'po_missing') {
          results.noFiles.push({ orderId: order.orderId, refNumber: order.referenceNumber })
        } else {
          results.errors.push({
            orderId: order.orderId,
            refNumber: order.referenceNumber,
            message: result.message || result.status,
          })
        }
      } catch (err: any) {
        results.errors.push({
          orderId: order.orderId,
          refNumber: order.referenceNumber,
          message: err.message || 'Unknown error',
        })
      }
    }

    setBatchParseResults(results)
    setBatchParsing(false)
    setResultsModalType('parse')
    setShowResultsModal(true)
  }

  // Get SKUs for filter dropdown - prefer database SKUs, fallback to order SKUs
  const availableSkus = useMemo(() => {
  if (supplierSkus.length > 0) {
    return supplierSkus.sort()
  }
  // Fallback: extract from orders if database SKUs not loaded
  const skuSet = new Set<string>()
  orders.forEach(order => {
  order.skuSummary.forEach(item => {
  skuSet.add(item.sku)
  })
  })
  return Array.from(skuSet).sort()
  }, [supplierSkus, orders])

  // Filter orders by warehouse, supplier (customer name), search query and selected SKUs
  const filteredOrders = orders.filter(order => {
    // Skip canceled orders (reference number contains "canceled")
    if (order.referenceNumber.toLowerCase().includes('cancel')) {
      return false
    }
    
    // Filter by warehouse using warehouseName field from API
    // WMS warehouse names: "Kent Warehouse", "Moses Lake Warehouse", etc.
    const warehouseNameLower = (order.warehouseName || '').toLowerCase()
    const warehouseLower = warehouse.toLowerCase()
    
    let matchesWarehouse = false
    if (warehouseLower === 'moses lake') {
      matchesWarehouse = warehouseNameLower.includes('moses') || warehouseNameLower.includes('ml')
    } else if (warehouseLower === 'kent') {
      matchesWarehouse = warehouseNameLower.includes('kent')
    } else {
      matchesWarehouse = warehouseNameLower.includes(warehouseLower)
    }
    
    if (!matchesWarehouse) return false
    
    // Filter by supplier based on customer name
    const customerNameLower = order.customerName.toLowerCase()
    const supplierLower = supplier.toLowerCase()
    
    // Customer name to supplier mapping:
    // - "hx" orders contain "hx" in customer name
    // - "amc" orders contain "alliance" in customer name  
    // - "tjjsh" orders contain "tianjin" in customer name
    // - "winschem" orders contain "winschem" in customer name
    // - "pmp" orders contain "pmp" in customer name
    // - "dongyu" orders contain "dongyu" in customer name
    
    let matchesSupplier = false
    switch (supplierLower) {
      case 'hx':
        matchesSupplier = customerNameLower.includes('hx')
        break
      case 'amc':
        matchesSupplier = customerNameLower.includes('alliance')
        break
      case 'tjjsh':
        matchesSupplier = customerNameLower.includes('tianjin')
        break
      case 'winschem':
        matchesSupplier = customerNameLower.includes('winschem')
        break
      case 'pmp':
        matchesSupplier = customerNameLower.includes('pmp')
        break
      case 'dongyu':
        matchesSupplier = customerNameLower.includes('dongyu')
        break
      default:
        matchesSupplier = customerNameLower.includes(supplierLower)
    }
    
    if (!matchesSupplier) return false
    
    // Filter by search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesSearch = (
        order.referenceNumber.toLowerCase().includes(q) ||
        order.poNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.skuSummary.some(s => s.sku.toLowerCase().includes(q))
      )
      if (!matchesSearch) return false
    }
    
    // Filter by selected SKUs (if any selected)
    if (selectedSkus.length > 0) {
      const orderSkus = order.skuSummary.map(s => s.sku)
      const hasMatchingSku = selectedSkus.some(sku => orderSkus.includes(sku))
      if (!hasMatchingSku) return false
  }
  
  // Filter by issues - show only orders that have issues in DB or current session
  if (showOnlyIssues) {
    const hasDbIssue = savedDiscrepancies.some(d => d.order_id === order.orderId)
    const sessionResult = parseResults[order.orderId]
    const hasSessionIssue = sessionResult && sessionResult.status !== 'match'
    if (!hasDbIssue && !hasSessionIssue) return false
  }
    
    return true
  })

  // Export to Excel
  const exportToExcel = () => {
    if (filteredOrders.length === 0) {
      alert('No orders to export')
      return
    }

    // Build rows matching the template format
    const rows = filteredOrders.map(order => {
      // Format SKU/Quantity column like "61415GT(1),824433GT(1)"
      const skuQuantityStr = order.skuSummary
        .map(item => `${item.sku}(${item.quantity})`)
        .join(',')

      // Format close date as "YYYY-MM-DD HH:MM:SS"
      const closeDate = order.processDate 
        ? new Date(order.processDate).toLocaleString('sv-SE').replace('T', ' ')
        : ''

      return {
        'Customer': order.customerName,
        'Warehouse': warehouse === 'Moses Lake' ? 'Moses Lake New' : warehouse,
        'Transaction ID': order.orderId,
        'Reference Number': order.referenceNumber,
        'Status': order.status,
        'Close Date': closeDate,
        'SKU/Quantity': skuQuantityStr,
      }
    })

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(rows)

    // Set column widths
    const colWidths = [
      { wch: 18 }, // Customer
      { wch: 16 }, // Warehouse
      { wch: 12 }, // Transaction ID
      { wch: 18 }, // Reference Number
      { wch: 10 }, // Status
      { wch: 20 }, // Close Date
      { wch: 40 }, // SKU/Quantity
    ]
    ws['!cols'] = colWidths

    // Create workbook and export
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Orders')
    
    // Generate filename with date range
    const fileName = `Orders_${warehouse}_${supplier}_${startDate}_${endDate}.xlsx`
    XLSX.writeFile(wb, fileName)
  }

  // Summary stats
  const totalOrders = filteredOrders.length
  const closedOrders = filteredOrders.filter(o => o.isClosed).length
  const totalQuantity = filteredOrders.reduce((sum, o) => sum + o.totalQuantity, 0)
  
  // Parse result stats
  const parseStats = {
    match: filteredOrders.filter(o => parseResults[o.orderId]?.status === 'match').length,
    mismatch: filteredOrders.filter(o => parseResults[o.orderId]?.status === 'mismatch').length,
    bolMissing: filteredOrders.filter(o => parseResults[o.orderId]?.status === 'bol_missing').length,
    poMissing: filteredOrders.filter(o => parseResults[o.orderId]?.status === 'po_missing').length,
    unparsed: filteredOrders.filter(o => !parseResults[o.orderId]).length,
  }

  return (
    <div className="p-6 space-y-6 bg-background min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">PO / BOL Reconciliation</h1>
          <p className="text-muted-foreground mt-1">
            Compare outbound orders and download BOL documents
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} disabled={loading || filteredOrders.length === 0} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
          <Button 
            onClick={downloadAllAsZip} 
            disabled={loading || batchDownloading || filteredOrders.length === 0} 
            variant="outline"
          >
            {batchDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {batchProgress.current}/{batchProgress.total}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download All
              </>
            )}
          </Button>
          <Button 
            onClick={parseAllOrders} 
            disabled={loading || batchParsing || filteredOrders.length === 0} 
            variant="outline"
          >
            {batchParsing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {batchProgress.current}/{batchProgress.total}
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Parse All
              </>
            )}
          </Button>
          <Button onClick={fetchOrders} disabled={loading} variant="outline">
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[150px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Warehouse
            </label>
            <Select value={warehouse} onValueChange={setWarehouse}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WAREHOUSES.map(w => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[150px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Supplier
            </label>
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPLIERS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              SKU Filter {selectedSkus.length > 0 && `(${selectedSkus.length})`}
            </label>
            <div className="relative">
              <Select
                value={selectedSkus.length === 1 ? selectedSkus[0] : ''}
                onValueChange={(value) => {
                  if (value === '__clear__') {
                    setSelectedSkus([])
                  } else {
                    setSelectedSkus(prev => 
                      prev.includes(value) 
                        ? prev.filter(s => s !== value)
                        : [...prev, value]
                    )
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedSkus.length > 0 ? `${selectedSkus.length} selected` : "All SKUs"} />
                </SelectTrigger>
                <SelectContent>
                  {selectedSkus.length > 0 && (
                    <SelectItem value="__clear__" className="text-destructive">Clear Selection</SelectItem>
                  )}
                  {availableSkus.map(sku => (
                    <SelectItem key={sku} value={sku}>
                      <span className="flex items-center gap-2">
                        {selectedSkus.includes(sku) && <CheckCircle2 className="h-3 w-3" />}
                        {sku}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

  <div className="flex-1 min-w-[150px]">
  <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
  Start Date
  </label>
  <Input
  type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
          </div>
          
          <div className="flex-1 min-w-[150px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              End Date
            </label>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by Ref#, PO#, SKU..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          
          <Button onClick={() => fetchOrders()} disabled={loading}>
            <Filter className="h-4 w-4 mr-2" />
            Apply Filters
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Orders</p>
              <p className="text-2xl font-semibold">{totalOrders}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Closed Orders</p>
              <p className="text-2xl font-semibold">{closedOrders}</p>
            </div>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Package className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Quantity</p>
              <p className="text-2xl font-semibold">{totalQuantity.toLocaleString()}</p>
            </div>
          </div>
        </Card>

        {/* Discrepancies Card - clickable */}
        <Card 
          className={cn(
            "p-4 cursor-pointer transition-colors",
            (savedDiscrepancies.length > 0 || parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing > 0) 
              ? "border-red-200 bg-red-50 hover:bg-red-100" 
              : "hover:bg-muted/50"
          )}
          onClick={() => {
            if (savedDiscrepancies.length > 0 || parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing > 0) {
              setShowOnlyIssues(!showOnlyIssues)
            }
          }}
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              (savedDiscrepancies.length > 0 || parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing > 0) ? "bg-red-100" : "bg-orange-100"
            )}>
              <Archive className={cn(
                "h-5 w-5",
                (savedDiscrepancies.length > 0 || parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing > 0) ? "text-red-600" : "text-orange-600"
              )} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {showOnlyIssues ? 'Showing Issues Only' : 'Parse Issues'}
              </p>
              <p className={cn(
                "text-2xl font-semibold",
                (savedDiscrepancies.length > 0) ? "text-red-600" : ""
              )}>
                {savedDiscrepancies.length}
              </p>
              {savedDiscrepancies.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Click to {showOnlyIssues ? 'show all' : 'filter'}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Error State */}
      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <p>{error}</p>
          </div>
        </Card>
      )}

      {/* Orders Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground w-10"></th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Ref #</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Customer</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                <th className="text-left p-3 text-sm font-medium text-muted-foreground">Process Date</th>
                <th className="text-right p-3 text-sm font-medium text-muted-foreground">SKUs</th>
                <th className="text-right p-3 text-sm font-medium text-muted-foreground">Quantity</th>
                <th className="text-center p-3 text-sm font-medium text-muted-foreground">Files</th>
                <th className="text-center p-3 text-sm font-medium text-muted-foreground">Parse</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Loading orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    No orders found for the selected criteria
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <>
                    <tr 
                      key={order.orderId}
                      className={cn(
                        'hover:bg-muted/30 cursor-pointer transition-colors',
                        expandedRows.has(order.orderId) && 'bg-muted/20'
                      )}
                      onClick={() => {
                        toggleRow(order.orderId)
                        // Fetch files when expanding
                        if (!expandedRows.has(order.orderId) && !orderFiles[order.orderId]) {
                          fetchOrderFiles(order.orderId)
                        }
                      }}
                    >
                      <td className="p-3">
                        {expandedRows.has(order.orderId) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-3 font-mono text-sm">{order.referenceNumber || '-'}</td>
                      <td className="p-3">{order.customerName || '-'}</td>
                      <td className="p-3">
                        <span className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          getStatusColor(order.status, order.isClosed)
                        )}>
                          {order.isClosed ? 'Closed' : order.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm">{formatDateTime(order.processDate)}</td>
                      <td className="p-3 text-right">{order.totalSkus}</td>
                      <td className="p-3 text-right font-medium">{order.totalQuantity.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Download merged BOL + PO PDF"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadMergedPdf(order.orderId, order.referenceNumber)
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                      <td className="p-3 text-center">
                        {parsingOrders.has(order.orderId) ? (
                          <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                        ) : parseResults[order.orderId] ? (
                          <div className="flex items-center justify-center gap-1">
                            {parseResults[order.orderId].status === 'match' ? (
                              <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                                <CheckCircle2 className="h-4 w-4" />
                                Match
                              </span>
                            ) : parseResults[order.orderId].status === 'mismatch' ? (
                              <span className="flex items-center gap-1 text-red-600 text-xs font-medium cursor-pointer" 
                                    title={`Click to reparse. ${parseResults[order.orderId].comparison?.mismatches.map(m => m.message).join('\n')}`}
                                    onClick={(e) => { e.stopPropagation(); parseAndCompare(order.orderId, true) }}>
                                <AlertCircle className="h-4 w-4" />
                                Mismatch
                              </span>
                            ) : parseResults[order.orderId].status === 'no_files' ? (
                              <span className="text-xs text-muted-foreground cursor-pointer"
                                    title="Click to retry"
                                    onClick={(e) => { e.stopPropagation(); parseAndCompare(order.orderId, true) }}>
                                No files
                              </span>
                            ) : parseResults[order.orderId].status === 'error' ? (
                              <span className="flex items-center gap-1 text-orange-600 text-xs cursor-pointer" 
                                    title={`Click to retry. Error: ${parseResults[order.orderId].message}`}
                                    onClick={(e) => { e.stopPropagation(); parseAndCompare(order.orderId, true) }}>
                                <AlertCircle className="h-4 w-4" />
                                Error
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground cursor-pointer"
                                    title="Click to reparse"
                                    onClick={(e) => { e.stopPropagation(); parseAndCompare(order.orderId, true) }}>
                                {parseResults[order.orderId].status}
                              </span>
                            )}
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Parse and compare BOL vs PO"
                            onClick={(e) => {
                              e.stopPropagation()
                              parseAndCompare(order.orderId)
                            }}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {expandedRows.has(order.orderId) && (
                      <tr key={`${order.orderId}-details`} className="bg-muted/10">
                        <td colSpan={9} className="p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* SKU Details */}
                            <div>
                              <h4 className="font-medium mb-2 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                SKU Details
                              </h4>
                              <div className="bg-background rounded-lg border">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="text-left p-2">SKU</th>
                                      <th className="text-right p-2">Qty</th>
                                      <th className="text-left p-2">Description</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {order.skuSummary.map((item, idx) => (
                                      <tr key={idx}>
                                        <td className="p-2 font-mono">{item.sku}</td>
                                        <td className="p-2 text-right">{item.quantity}</td>
                                        <td className="p-2 text-muted-foreground truncate max-w-[200px]">
                                          {item.description || '-'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            
                            {/* Files */}
                            <div>
                              <h4 className="font-medium mb-2 flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Documents
                              </h4>
                              {loadingFiles.has(order.orderId) ? (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading files...
                                </div>
                              ) : orderFiles[order.orderId]?.length > 0 ? (
                                <div className="space-y-2">
                                  {orderFiles[order.orderId].map(file => (
                                    <div
                                      key={file.fileId}
                                      className="flex items-center justify-between p-2 bg-background rounded-lg border"
                                    >
                                      <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-sm">{file.fileName}</span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => downloadFile(order.orderId, file.fileId, file.fileName)}
                                      >
                                        <Download className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : orderFiles[order.orderId] ? (
                                <p className="text-sm text-muted-foreground">No files available</p>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => fetchOrderFiles(order.orderId)}
                                >
                                  Load Files
                                </Button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {/* Order count summary */}
        <div className="p-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {filteredOrders.length} of {orders.length} orders loaded
          </p>
        </div>
      </Card>

      {/* Batch Results Modal */}
      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {resultsModalType === 'download' ? 'Download Results' : 'Parse Results Summary'}
            </DialogTitle>
          </DialogHeader>
          
          {resultsModalType === 'download' ? (
            /* Download Results */
            <div className="space-y-6 py-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{batchDownloadResults.success.length}</div>
                  <div className="text-xs text-green-700">Downloaded</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{batchDownloadResults.failed.length}</div>
                  <div className="text-xs text-red-700">Failed</div>
                </div>
              </div>

              {/* Failed Downloads */}
              {batchDownloadResults.failed.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Failed Downloads ({batchDownloadResults.failed.length})
                  </h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {batchDownloadResults.failed.map((item) => (
                      <div key={item.orderId} className="p-2 bg-red-50 rounded text-sm">
                        <span className="font-mono font-medium">{item.refNumber}</span>
                        <span className="text-red-700 text-xs ml-2">- {item.error}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Parse Results */
            <div className="space-y-6 py-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{batchParseResults.matches.length}</div>
                  <div className="text-xs text-green-700">Matched</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{batchParseResults.mismatches.length}</div>
                  <div className="text-xs text-red-700">Mismatched</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{batchParseResults.noFiles.length}</div>
                  <div className="text-xs text-yellow-700">Missing Files</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{batchParseResults.errors.length}</div>
                  <div className="text-xs text-orange-700">Errors</div>
                </div>
              </div>

              {/* Mismatches */}
              {batchParseResults.mismatches.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Mismatched Orders ({batchParseResults.mismatches.length})
                  </h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {batchParseResults.mismatches.map((item) => (
                      <div key={item.orderId} className="p-2 bg-red-50 rounded text-sm">
                        <span className="font-mono font-medium">{item.refNumber}</span>
                        <ul className="mt-1 text-red-700 text-xs">
                          {item.issues.map((issue, idx) => (
                            <li key={idx}>- {issue}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Files */}
              {batchParseResults.noFiles.length > 0 && (
                <div>
                  <h4 className="font-medium text-yellow-600 mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Missing BOL/PO Files ({batchParseResults.noFiles.length})
                  </h4>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {batchParseResults.noFiles.map((item) => (
                      <span key={item.orderId} className="px-2 py-1 bg-yellow-50 rounded text-xs font-mono">
                        {item.refNumber}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {batchParseResults.errors.length > 0 && (
                <div>
                  <h4 className="font-medium text-orange-600 mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Parse Errors ({batchParseResults.errors.length})
                  </h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {batchParseResults.errors.map((item) => (
                      <div key={item.orderId} className="p-2 bg-orange-50 rounded text-sm">
                        <span className="font-mono">{item.refNumber}</span>
                        <span className="text-orange-700 text-xs ml-2">- {item.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All Match */}
              {batchParseResults.matches.length > 0 && 
               batchParseResults.mismatches.length === 0 && 
               batchParseResults.noFiles.length === 0 && 
               batchParseResults.errors.length === 0 && (
                <div className="text-center p-6 bg-green-50 rounded-lg">
                  <CheckCircle2 className="h-12 w-12 text-green-600 mx-auto mb-2" />
                  <p className="text-green-700 font-medium">All {batchParseResults.matches.length} orders matched!</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Discrepancies Panel Dialog */}
      <Dialog open={showDiscrepanciesPanel} onOpenChange={setShowDiscrepanciesPanel}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5 text-red-600" />
              Parse Issues & Discrepancies
              {(parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing) > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                  {parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing} issues
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto">
            {/* Current Session Parse Results */}
            {(() => {
              const issueOrders = filteredOrders.filter(o => {
                const result = parseResults[o.orderId]
                return result && ['mismatch', 'bol_missing', 'po_missing'].includes(result.status)
              })
              
              if (issueOrders.length === 0) {
                return (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                    <p className="text-lg font-medium text-green-700">No Issues Found</p>
                    <p className="text-sm text-muted-foreground mt-1">All parsed orders match or have not been parsed yet</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {parseStats.match} matched | {parseStats.unparsed} unparsed
                    </p>
                  </div>
                )
              }
              
              return (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground mb-3">
                    Found {issueOrders.length} orders with issues. Click to filter in the main table.
                  </p>
                  {issueOrders.map((order) => {
                    const result = parseResults[order.orderId]
                    return (
                      <Card 
                        key={order.orderId} 
                        className={cn(
                          "p-4 cursor-pointer hover:bg-muted/50 transition-colors",
                          result.status === 'mismatch' ? "border-red-200" : "border-yellow-200"
                        )}
                        onClick={() => {
                          setParseStatusFilter(result.status)
                          setShowDiscrepanciesPanel(false)
                        }}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-mono font-semibold">{order.referenceNumber}</span>
                              <span className={cn(
                                "px-2 py-0.5 text-xs rounded",
                                result.status === 'mismatch' ? 'bg-red-100 text-red-700' :
                                result.status === 'bol_missing' ? 'bg-yellow-100 text-yellow-700' :
                                result.status === 'po_missing' ? 'bg-orange-100 text-orange-700' :
                                'bg-gray-100 text-gray-700'
                              )}>
                                {result.status.replace('_', ' ')}
                              </span>
                            </div>
                            
                            <div className="text-sm text-muted-foreground">
                              <p>{order.customerName} | {formatDateTime(order.processDate)}</p>
                            </div>
                            
                            {/* Show mismatches if available */}
                            {result.comparison?.mismatches && result.comparison.mismatches.length > 0 && (
                              <div className="mt-3 p-2 bg-red-50 rounded text-sm">
                                <p className="font-medium text-red-700 mb-1">Mismatches:</p>
                                <ul className="text-xs text-red-600 space-y-0.5">
                                  {result.comparison.mismatches.slice(0, 3).map((m: any, idx: number) => (
                                    <li key={idx}>- {m.message}</li>
                                  ))}
                                  {result.comparison.mismatches.length > 3 && (
                                    <li className="text-red-500">... and {result.comparison.mismatches.length - 3} more</li>
                                  )}
                                </ul>
                              </div>
                            )}
                            
                            {result.message && !result.comparison?.mismatches?.length && (
                              <p className="mt-2 text-xs text-yellow-600">{result.message}</p>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation()
                                // Re-parse this order
                                parseOrder(order.orderId)
                              }}
                              disabled={parsingOrders.has(order.orderId)}
                              title="Re-parse"
                            >
                              {parsingOrders.has(order.orderId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )
            })()}
          </div>
          
          <div className="flex justify-between items-center pt-4 border-t mt-4">
            <div className="text-xs text-muted-foreground">
              <Button variant="link" size="sm" className="px-2 h-auto" onClick={() => { setParseStatusFilter('issues'); setShowDiscrepanciesPanel(false) }}>
                View All Issues ({parseStats.mismatch + parseStats.bolMissing + parseStats.poMissing})
              </Button>
            </div>
            <Button variant="outline" onClick={() => setShowDiscrepanciesPanel(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
