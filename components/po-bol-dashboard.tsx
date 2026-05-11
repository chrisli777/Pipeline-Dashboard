'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, Download, Search, RefreshCw, ChevronDown, ChevronRight,
  Loader2, Calendar, Package, AlertCircle, CheckCircle2, Filter
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
  status: string
  processDate: string | null
  creationDate: string | null
  isClosed: boolean
  skuSummary: SkuItem[]
  totalQuantity: number
  totalSkus: number
  hasFiles: boolean
}

interface Pagination {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}

// Warehouse and supplier options
const WAREHOUSES = ['Moses Lake', 'Kent']
const SUPPLIERS = ['HX', 'AMC', 'TJJSH']

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
  
  // Pagination
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
  })
  
  // Expanded rows for SKU details
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  
  // File loading states
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set())
  const [orderFiles, setOrderFiles] = useState<Record<string, OrderFile[]>>({})

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

  // Get all unique SKUs from orders for the filter dropdown
  const availableSkus = useMemo(() => {
    const skuSet = new Set<string>()
    orders.forEach(order => {
      order.skuSummary.forEach(item => {
        skuSet.add(item.sku)
      })
    })
    return Array.from(skuSet).sort()
  }, [orders])

  // Filter orders by customer (supplier), search query and selected SKUs
  const filteredOrders = orders.filter(order => {
    // Filter by supplier based on customer name
    // HX orders have customer name containing "HX"
    // TJJSH orders have customer name containing "TJJSH" or "TJJ"
    // AMC orders have customer name containing "AMC"
    const customerNameLower = order.customerName.toLowerCase()
    const supplierLower = supplier.toLowerCase()
    
    // Check if customer name matches the selected supplier
    if (supplierLower === 'hx' && !customerNameLower.includes('hx')) {
      return false
    }
    if (supplierLower === 'tjjsh' && !customerNameLower.includes('tjj')) {
      return false
    }
    if (supplierLower === 'amc' && !customerNameLower.includes('amc')) {
      return false
    }
    
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="mt-2 text-muted-foreground">Loading orders...</p>
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
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
                    </tr>
                    
                    {/* Expanded Details Row */}
                    {expandedRows.has(order.orderId) && (
                      <tr key={`${order.orderId}-details`} className="bg-muted/10">
                        <td colSpan={8} className="p-4">
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
        
        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {filteredOrders.length} of {pagination.totalCount} orders
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
