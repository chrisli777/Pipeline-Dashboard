'use client'

import React from "react"
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Upload, FileText, FileSpreadsheet, Download, Trash2, Loader2, RefreshCw, TrendingUp, TrendingDown, BarChart3, Bot, AlertCircle, FolderOpen, X, LineChart as LineChartIcon } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import dynamic from 'next/dynamic'

// Dynamic import for chart component (client-side only)
const AccuracyChart = dynamic(() => import('@/components/accuracy-chart').then(mod => mod.AccuracyChart), { 
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
})

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
  mape: number
  accuracy: number
}

export default function CustomerForecastPage() {
  const [files, setFiles] = useState<ForecastFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [syncingFileId, setSyncingFileId] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileDialogOpen, setFileDialogOpen] = useState(false)
  
  // Accuracy analysis state
  const [accuracyData, setAccuracyData] = useState<AccuracyData[]>([])
  const [accuracyLoading, setAccuracyLoading] = useState(false)
  const [selectedWeekRange, setSelectedWeekRange] = useState<string>('4')
  const [selectedSupplier, setSelectedSupplier] = useState<string>('all')
  const [selectedSku, setSelectedSku] = useState<string>('all')

  // Forecast analysis agent state
  const [analysisReport, setAnalysisReport] = useState<string>('')
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)

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

  const suppliers = useMemo(() => {
    const set = new Set(accuracyData.map(d => d.supplierCode))
    return Array.from(set).sort()
  }, [accuracyData])

  // Get SKUs for selected supplier
  const skusForSupplier = useMemo(() => {
    const filtered = selectedSupplier === 'all' 
      ? accuracyData 
      : accuracyData.filter(d => d.supplierCode === selectedSupplier)
    const set = new Set(filtered.map(d => d.skuCode))
    return Array.from(set).sort()
  }, [accuracyData, selectedSupplier])

  // Filtered accuracy data for display - MUST be defined before accuracySummary
  const filteredAccuracyData = useMemo(() => {
    return accuracyData.filter(d => {
      if (selectedSupplier !== 'all' && d.supplierCode !== selectedSupplier) return false
      if (selectedSku !== 'all' && d.skuCode !== selectedSku) return false
      return true
    })
  }, [accuracyData, selectedSupplier, selectedSku])

  const accuracySummary = useMemo((): AccuracySummary | null => {
    if (filteredAccuracyData.length === 0) return null
    
    const totalForecast = filteredAccuracyData.reduce((sum, d) => sum + d.customerForecast, 0)
    const totalActual = filteredAccuracyData.reduce((sum, d) => sum + d.actualConsumption, 0)
    const overallVariance = totalActual - totalForecast
    const overallVariancePercent = totalForecast > 0 ? (overallVariance / totalForecast) * 100 : 0
    
    const validData = filteredAccuracyData.filter(d => d.customerForecast > 0)
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
  }, [filteredAccuracyData])

  // Generate forecast analysis using AI agent
  const generateAnalysis = useCallback(async () => {
    setAnalysisLoading(true)
    setAnalysisError(null)
    try {
      // Fetch forecast data for analysis
      const forecastRes = await fetch('/api/inventory-data?includeForecasts=true')
      const forecastJson = await forecastRes.json()
      
      const res = await fetch('/api/forecast-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          forecastData: forecastJson.data || [],
          accuracyData: accuracyData,
          currentMonth: new Date().toISOString().slice(0, 7),
        }),
      })
      
      const data = await res.json()
      if (data.error) {
        setAnalysisError(data.error)
      } else {
        setAnalysisReport(data.analysis || 'No analysis generated')
      }
    } catch (err) {
      console.error('Failed to generate analysis:', err)
      setAnalysisError('Failed to generate analysis')
    } finally {
      setAnalysisLoading(false)
    }
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
    setFileDialogOpen(false)
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
    <div className="flex flex-col h-screen p-6 bg-gray-50 overflow-hidden">
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

      <div className="flex flex-col flex-1 min-h-0 space-y-4">
        {/* Header with File Management Button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Customer Forecast</h1>
            <p className="text-gray-500">Analyze forecast accuracy and trends</p>
          </div>
          <Dialog open={fileDialogOpen} onOpenChange={setFileDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FolderOpen className="h-4 w-4" />
                Manage Files
                {files.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 rounded-full">{files.length}</span>
                )}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>Forecast File Management</DialogTitle>
                <DialogDescription>
                  Upload, sync, and manage customer forecast files
                </DialogDescription>
              </DialogHeader>
              
              <div className="flex-1 overflow-y-auto space-y-6 py-4">
                {/* Upload Section */}
                <div className="p-4 border rounded-lg bg-gray-50/50">
                  <h4 className="text-sm font-medium mb-3">Upload New File</h4>
                  <div className="flex items-center gap-3">
                    <Input
                      id="file"
                      type="file"
                      accept=".pdf,.xlsx,.xls,.xlsm,.csv"
                      onChange={handleFileChange}
                      className="cursor-pointer flex-1"
                    />
                    <Button
                      onClick={handleUpload}
                      disabled={!selectedFile || uploading}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-gray-500 mt-2">
                      Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                    </p>
                  )}
                </div>

                {/* Files List */}
                <div>
                  <h4 className="text-sm font-medium mb-3">Uploaded Files ({files.length})</h4>
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                  ) : files.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No forecast files uploaded yet</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-xs">File</TableHead>
                            <TableHead className="text-xs">Size</TableHead>
                            <TableHead className="text-xs">Uploaded</TableHead>
                            <TableHead className="text-xs text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {files.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-2">
                                  {file.file_name.match(/\.(xlsx?|xlsm|csv)$/i) ? (
                                    <FileSpreadsheet className="h-4 w-4 text-green-600 shrink-0" />
                                  ) : (
                                    <FileText className="h-4 w-4 text-red-500 shrink-0" />
                                  )}
                                  <span className="text-sm truncate max-w-[200px]">{file.file_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-2 text-xs text-gray-500">{formatFileSize(file.file_size)}</TableCell>
                              <TableCell className="py-2 text-xs text-gray-500">{formatDate(file.uploaded_at)}</TableCell>
                              <TableCell className="py-2 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSync(file.id)}
                                    disabled={syncingFileId === file.id}
                                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    title="Sync to Pipeline"
                                  >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDownload(file.id)}
                                    className="h-7 w-7 p-0"
                                    title="Download"
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(file.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                    title="Delete"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Side-by-side Analysis Layout - Full Height */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
          {/* Left: Forecast Analysis Report - Agent Integration */}
          <Card className="border border-blue-200 bg-gradient-to-br from-blue-50/50 to-white flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Bot className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Forecast Analysis Report</CardTitle>
                    <CardDescription>
                      AI-powered analysis of forecast changes
                    </CardDescription>
                  </div>
                </div>
                <Button
                  onClick={generateAnalysis}
                  disabled={analysisLoading}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {analysisLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
              {analysisLoading ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Loader2 className="h-10 w-10 animate-spin text-blue-600 mb-4" />
                  <p className="text-lg font-medium text-gray-700">Analyzing Forecast Data</p>
                  <p className="text-sm text-gray-500 mt-1">This may take 1-2 minutes...</p>
                </div>
              ) : analysisError ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 rounded-lg text-red-700">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-medium">Analysis Failed</p>
                    <p className="text-sm">{analysisError}</p>
                  </div>
                </div>
              ) : analysisReport ? (
                <div className="max-h-[500px] overflow-auto">
                  <div className="bg-white border rounded-lg p-4 whitespace-pre-wrap text-sm leading-relaxed">
                    {analysisReport}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-100/50 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span>Click &quot;Generate&quot; to analyze forecast changes by machine model</span>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-lg border border-blue-100">
                      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Analysis Features</p>
                      <ul className="text-sm text-gray-700 space-y-1">
                        <li>- Month-over-month comparison</li>
                        <li>- Model-level trend detection</li>
                        <li>- Demand shift patterns</li>
                        <li>- Supply risk alerts</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Forecast Accuracy Analysis with Line Chart */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <LineChartIcon className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Forecast Accuracy</CardTitle>
                    <CardDescription>
                      Forecast vs Actual over time
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={selectedWeekRange} onValueChange={(v) => { setSelectedWeekRange(v); }}>
                    <SelectTrigger className="w-[100px] h-8 text-xs">
                      <SelectValue placeholder="Weeks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="4">4 weeks</SelectItem>
                      <SelectItem value="8">8 weeks</SelectItem>
                      <SelectItem value="12">12 weeks</SelectItem>
                      <SelectItem value="26">26 weeks</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedSupplier} onValueChange={(v) => { setSelectedSupplier(v); setSelectedSku('all'); }}>
                    <SelectTrigger className="w-[90px] h-8 text-xs">
                      <SelectValue placeholder="Supplier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {suppliers.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedSku} onValueChange={(v) => { setSelectedSku(v); }}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue placeholder="SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All SKUs</SelectItem>
                      {skusForSupplier.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
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
            <CardContent className="flex-1 overflow-auto">
              {accuracyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : accuracySummary ? (
                <div className="space-y-4">
                  {/* Summary Stats Row */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                      <p className="text-xs text-gray-500 uppercase">Forecast</p>
                      <p className="text-lg font-bold text-gray-900">{accuracySummary.totalForecast.toLocaleString()}</p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg text-center">
                      <p className="text-xs text-gray-500 uppercase">Actual</p>
                      <p className="text-lg font-bold text-gray-900">{accuracySummary.totalActual.toLocaleString()}</p>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${accuracySummary.overallVariance >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <p className="text-xs text-gray-500 uppercase">Variance</p>
                      <p className={`text-lg font-bold ${accuracySummary.overallVariance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {accuracySummary.overallVariance >= 0 ? '+' : ''}{accuracySummary.overallVariancePercent.toFixed(1)}%
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg text-center ${accuracySummary.accuracy >= 90 ? 'bg-green-50' : accuracySummary.accuracy >= 70 ? 'bg-yellow-50' : 'bg-red-50'}`}>
                      <p className="text-xs text-gray-500 uppercase">Accuracy</p>
                      <p className={`text-lg font-bold ${accuracySummary.accuracy >= 90 ? 'text-green-700' : accuracySummary.accuracy >= 70 ? 'text-yellow-700' : 'text-red-700'}`}>
                        {accuracySummary.accuracy.toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Line Chart */}
                  <div className="h-[280px] w-full">
                    <AccuracyChart 
                      data={(() => {
                        // Aggregate data by week
                        const weeklyData: Record<number, { week: number; forecast: number; actual: number }> = {}
                        filteredAccuracyData.forEach(d => {
                          if (!weeklyData[d.weekNumber]) {
                            weeklyData[d.weekNumber] = { week: d.weekNumber, forecast: 0, actual: 0 }
                          }
                          weeklyData[d.weekNumber].forecast += d.customerForecast
                          weeklyData[d.weekNumber].actual += d.actualConsumption
                        })
                        return Object.values(weeklyData).sort((a, b) => a.week - b.week)
                      })()}
                    />
                  </div>

                  {/* Compact Table */}
                  <div className="border rounded-lg overflow-hidden flex-1 min-h-[150px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs">SKU</TableHead>
                          <TableHead className="text-xs">Week</TableHead>
                          <TableHead className="text-xs text-right">Forecast</TableHead>
                          <TableHead className="text-xs text-right">Actual</TableHead>
                          <TableHead className="text-xs text-right">Var %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredAccuracyData.slice(0, 15).map((row, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="text-xs font-medium py-2">{row.skuCode}</TableCell>
                            <TableCell className="text-xs py-2">W{row.weekNumber}</TableCell>
                            <TableCell className="text-xs text-right py-2">{row.customerForecast}</TableCell>
                            <TableCell className="text-xs text-right py-2">{row.actualConsumption}</TableCell>
                            <TableCell className={`text-xs text-right py-2 ${Math.abs(row.variancePercent) <= 10 ? 'text-green-600' : Math.abs(row.variancePercent) <= 25 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {row.variancePercent >= 0 ? '+' : ''}{row.variancePercent.toFixed(1)}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {filteredAccuracyData.length > 15 && (
                      <div className="p-2 bg-gray-50 text-center text-xs text-gray-500">
                        Showing 15 of {filteredAccuracyData.length} records
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No accuracy data available</p>
                  <p className="text-sm mt-1">Upload and sync forecast files to see accuracy analysis</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
