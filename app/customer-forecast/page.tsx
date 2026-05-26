'use client'

import React from "react"
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileText, FileSpreadsheet, Download, Trash2, Loader2, RefreshCw, TrendingUp, TrendingDown, BarChart3, Bot, AlertCircle } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ForecastFile {
  id: string
  file_name: string
  file_size: number
  mime_type: string
  uploaded_at: string
}

interface AccuracyData {
  skuId: string
  skuCode: string
  partModel: string
  supplierCode: string
  weekNumber: number
  customerForecast: number
  actualConsumption: number
  variance: number
  variancePercent: number
}

interface AccuracySummary {
  totalForecast: number
  totalActual: number
  overallVariance: number
  overallVariancePercent: number
  mape: number  // Mean Absolute Percentage Error
  accuracy: number
}

export default function CustomerForecastPage() {
  const [files, setFiles] = useState<ForecastFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [syncingFileId, setSyncingFileId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  
  // Accuracy analysis state
  const [accuracyData, setAccuracyData] = useState<AccuracyData[]>([])
  const [accuracyLoading, setAccuracyLoading] = useState(false)
  const [selectedWeekRange, setSelectedWeekRange] = useState<string>('4')  // Last 4 weeks
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')

  // Fetch accuracy data
  const fetchAccuracyData = useCallback(async () => {
    setAccuracyLoading(true)
    try {
      const res = await fetch(`/api/forecast-accuracy?weeks=${selectedWeekRange}&supplier=${selectedSupplier}`)
      const data = await res.json()
      if (data.accuracy) {
        setAccuracyData(data.accuracy)
      }
    } catch (err) {
      console.error('Failed to fetch accuracy data:', err)
    } finally {
      setAccuracyLoading(false)
    }
  }, [selectedWeekRange, selectedSupplier])

  // Calculate accuracy summary
  const accuracySummary = useMemo((): AccuracySummary | null => {
    if (accuracyData.length === 0) return null
    
    const totalForecast = accuracyData.reduce((sum, d) => sum + d.customerForecast, 0)
    const totalActual = accuracyData.reduce((sum, d) => sum + d.actualConsumption, 0)
    const overallVariance = totalActual - totalForecast
    const overallVariancePercent = totalForecast > 0 ? (overallVariance / totalForecast) * 100 : 0
    
    // Calculate MAPE (Mean Absolute Percentage Error)
    const validData = accuracyData.filter(d => d.customerForecast > 0)
    const mape = validData.length > 0 
      ? validData.reduce((sum, d) => sum + Math.abs(d.variancePercent), 0) / validData.length
      : 0
    
    return {
      totalForecast,
      totalActual,
      overallVariance,
      overallVariancePercent,
      mape,
      accuracy: Math.max(0, 100 - mape)
    }
  }, [accuracyData])

  // Get unique suppliers from accuracy data
  const suppliers = useMemo(() => {
    const set = new Set(accuracyData.map(d => d.supplierCode))
    return Array.from(set).sort()
  }, [accuracyData])

  const fetchFiles = useCallback(async () => {
    try {
      const res = await fetch('/api/forecast-files')
      const data = await res.json()
      if (data.files) {
        setFiles(data.files)
      }
    } catch (err) {
      console.error('Failed to fetch files:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles()
    fetchAccuracyData()
  }, [fetchFiles, fetchAccuracyData])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const res = await fetch('/api/forecast-files', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.success) {
        setSelectedFile(null)
        // Reset file input
        const fileInput = document.getElementById('file') as HTMLInputElement
        if (fileInput) fileInput.value = ''
        fetchFiles()
      } else {
        alert(data.error || 'Upload failed')
      }
    } catch (err) {
      alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSync = async (fileId: string) => {
    setSyncingFileId(fileId)
    try {
      const res = await fetch('/api/sync/customer-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })
      const data = await res.json()
      if (data.success) {
        const extractedMsg = data.stats.extractedModels?.length > 0
          ? `\nExtracted from file: ${data.stats.extractedModels.join(', ')}`
          : ''
        const skippedMsg = data.stats.skippedWeeks?.length > 0 
          ? `\nSkipped weeks (not in database): ${data.stats.skippedWeeks.join(', ')}`
          : ''
        const unmatchedMsg = data.stats.unmatchedModels?.length > 0
          ? `\nUnmatched models (no SKUs found): ${data.stats.unmatchedModels.join(', ')}`
          : ''
        alert(`Sync completed!${extractedMsg}\n\nModels updated: ${data.stats.modelsUpdated.join(', ') || 'None'}\nUpdates: ${data.stats.successCount} successful, ${data.stats.errorCount} errors${unmatchedMsg}${skippedMsg}`)
        // Hard redirect to dashboard - ensures full page reload with fresh data
        window.location.href = '/'
      } else {
        alert(data.error || 'Sync failed')
      }
    } catch (err) {
      alert('Sync failed')
    } finally {
      setSyncingFileId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return

    try {
      const res = await fetch(`/api/forecast-files?id=${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        fetchFiles()
      } else {
        alert(data.error || 'Delete failed')
      }
    } catch (err) {
      alert('Delete failed')
    }
  }

  const handleDownload = async (id: string) => {
    try {
      const res = await fetch(`/api/forecast-files/${id}`)
      const data = await res.json()
      if (data.signedUrl) {
        // Open signed URL directly - browser will download the file
        window.open(data.signedUrl, '_blank')
      } else {
        alert(data.error || 'Failed to get download link')
      }
    } catch (err) {
      alert('Download failed')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex-1 p-6 bg-gray-50 min-h-screen relative">
      {/* Full screen sync overlay */}
      {syncingFileId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 shadow-xl">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">Syncing Customer Forecast</p>
              <p className="text-sm text-gray-500">Please wait, analyzing forecast file...</p>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Forecast</h1>
          <p className="text-gray-500">Upload and manage customer forecast files</p>
        </div>

        {/* Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upload Forecast File</CardTitle>
            <CardDescription>
              Upload customer-provided forecast documents (PDF, Excel, or CSV)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file">Forecast File</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.xlsx,.xls,.xlsm,.csv"
                  onChange={handleFileChange}
                  className="cursor-pointer max-w-md"
                />
                {selectedFile && (
                  <p className="text-sm text-gray-500">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Upload
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Files List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uploaded Files</CardTitle>
            <CardDescription>
              {files.length} file{files.length !== 1 ? 's' : ''} uploaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No forecast files uploaded yet</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {files.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {file.file_name.match(/\.(xlsx?|xlsm|csv)$/i) ? (
                            <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          ) : (
                            <FileText className="h-4 w-4 text-red-500" />
                          )}
                          {file.file_name}
                        </div>
                      </TableCell>
                      <TableCell>{formatFileSize(file.file_size)}</TableCell>
                      <TableCell>{formatDate(file.uploaded_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(file.id)}
                            disabled={syncingFileId === file.id}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            title="Sync to Pipeline"
                          >
                            {syncingFileId === file.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(file.id)}
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(file.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Forecast Analysis Report - Agent Integration Ready */}
        <Card className="border-dashed border-2 border-blue-200 bg-blue-50/30">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Bot className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Forecast Analysis Report</CardTitle>
                <CardDescription>
                  AI-powered analysis of forecast changes and trends (Coming Soon)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-100/50 p-3 rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <span>Agent integration pending - will analyze monthly forecast changes by machine model</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white rounded-lg border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Analysis Features</p>
                  <ul className="mt-2 text-sm text-gray-700 space-y-1">
                    <li>- Month-over-month comparison</li>
                    <li>- Model-level trend detection</li>
                    <li>- Anomaly highlighting</li>
                  </ul>
                </div>
                <div className="p-4 bg-white rounded-lg border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Insights</p>
                  <ul className="mt-2 text-sm text-gray-700 space-y-1">
                    <li>- Demand shift patterns</li>
                    <li>- Seasonal adjustments</li>
                    <li>- Supply risk alerts</li>
                  </ul>
                </div>
                <div className="p-4 bg-white rounded-lg border border-blue-100">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Output</p>
                  <ul className="mt-2 text-sm text-gray-700 space-y-1">
                    <li>- Summary report</li>
                    <li>- Action recommendations</li>
                    <li>- Historical tracking</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Forecast Accuracy Analysis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <BarChart3 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-lg">Forecast Accuracy Analysis</CardTitle>
                  <CardDescription>
                    Compare Customer Forecast vs Actual Consumption
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select value={selectedWeekRange} onValueChange={(v) => { setSelectedWeekRange(v); fetchAccuracyData(); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Week Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">Last 4 weeks</SelectItem>
                    <SelectItem value="8">Last 8 weeks</SelectItem>
                    <SelectItem value="12">Last 12 weeks</SelectItem>
                    <SelectItem value="26">Last 26 weeks</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedSupplier} onValueChange={(v) => { setSelectedSupplier(v); fetchAccuracyData(); }}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Suppliers</SelectItem>
                    {suppliers.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchAccuracyData}
                  disabled={accuracyLoading}
                >
                  {accuracyLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {accuracyLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : accuracySummary ? (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Forecast</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{accuracySummary.totalForecast.toLocaleString()}</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Total Actual</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{accuracySummary.totalActual.toLocaleString()}</p>
                  </div>
                  <div className={`p-4 rounded-lg ${accuracySummary.overallVariance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Variance</p>
                    <div className="flex items-center gap-2 mt-1">
                      {accuracySummary.overallVariance >= 0 ? (
                        <TrendingUp className="h-5 w-5 text-green-600" />
                      ) : (
                        <TrendingDown className="h-5 w-5 text-red-600" />
                      )}
                      <p className={`text-2xl font-bold ${accuracySummary.overallVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {accuracySummary.overallVariance >= 0 ? '+' : ''}{accuracySummary.overallVariance.toLocaleString()}
                      </p>
                      <span className={`text-sm ${accuracySummary.overallVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ({accuracySummary.overallVariancePercent >= 0 ? '+' : ''}{accuracySummary.overallVariancePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <div className={`p-4 rounded-lg ${accuracySummary.accuracy >= 90 ? 'bg-green-50' : accuracySummary.accuracy >= 70 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Forecast Accuracy</p>
                    <p className={`text-2xl font-bold mt-1 ${accuracySummary.accuracy >= 90 ? 'text-green-700' : accuracySummary.accuracy >= 70 ? 'text-yellow-700' : 'text-red-700'}`}>
                      {accuracySummary.accuracy.toFixed(1)}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">MAPE: {accuracySummary.mape.toFixed(1)}%</p>
                  </div>
                </div>

                {/* Detail Table */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead>SKU / Part Model</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Week</TableHead>
                        <TableHead className="text-right">Forecast</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Variance %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {accuracyData.slice(0, 20).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            <div>
                              <span>{row.skuCode}</span>
                              <span className="text-xs text-gray-500 ml-2">/ {row.partModel}</span>
                            </div>
                          </TableCell>
                          <TableCell>{row.supplierCode}</TableCell>
                          <TableCell>W{row.weekNumber}</TableCell>
                          <TableCell className="text-right">{row.customerForecast}</TableCell>
                          <TableCell className="text-right">{row.actualConsumption}</TableCell>
                          <TableCell className={`text-right ${row.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {row.variance >= 0 ? '+' : ''}{row.variance}
                          </TableCell>
                          <TableCell className={`text-right ${Math.abs(row.variancePercent) <= 10 ? 'text-green-600' : Math.abs(row.variancePercent) <= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {row.variancePercent >= 0 ? '+' : ''}{row.variancePercent.toFixed(1)}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {accuracyData.length > 20 && (
                    <div className="p-3 bg-gray-50 text-center text-sm text-gray-500">
                      Showing 20 of {accuracyData.length} records
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No accuracy data available</p>
                <p className="text-sm mt-1">Upload and sync forecast files to see accuracy analysis</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
