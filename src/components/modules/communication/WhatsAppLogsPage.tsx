'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import {
  MessageSquare,
  Filter,
  ChevronLeft,
  ChevronRight,
  Phone,
  CheckCheck,
  Eye,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppStore } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { toast } from 'sonner'

// Types
interface WhatsAppLogRecord {
  id: string
  patientId: string | null
  mobile: string
  template: string
  message: string
  status: string
  sentAt: string
  createdAt: string
}

// Status badge
function getMessageStatusBadge(status: string) {
  switch (status) {
    case 'sent':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
          <Clock className="h-3 w-3 mr-1" />
          Sent
        </Badge>
      )
    case 'delivered':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          <CheckCheck className="h-3 w-3 mr-1" />
          Delivered
        </Badge>
      )
    case 'read':
      return (
        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400">
          <Eye className="h-3 w-3 mr-1" />
          Read
        </Badge>
      )
    case 'failed':
      return (
        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Failed
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export default function WhatsAppLogsPage() {
  const { searchQuery: globalSearchQuery, setSearchQuery: setGlobalSearchQuery } = useAppStore()
  const [logs, setLogs] = useState<WhatsAppLogRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 20

  // Filters
  const [filterTemplate, setFilterTemplate] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const { query: searchQuery, debouncedQuery: debouncedSearchQuery, setQuery: setSearchQuery, isDebouncing, clear: clearSearch } = useDebouncedSearch(globalSearchQuery)

  // Clear the global search query once consumed as this page's initial search
  useEffect(() => {
    if (globalSearchQuery) setGlobalSearchQuery('')
  }, [])

  // Selected log for detail view
  const [selectedLog, setSelectedLog] = useState<WhatsAppLogRecord | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', limit.toString())

      if (debouncedSearchQuery) params.set('search', debouncedSearchQuery)
      if (filterStatus) params.set('status', filterStatus)
      if (filterTemplate) params.set('template', filterTemplate)
      const res = await authFetch(`/api/whatsapp-logs?${params.toString()}`)
      if (res.ok) {
        const json = await res.json()
        setLogs(json.logs || [])
        setTotal(json.total)
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp logs:', err)
      toast.error('Failed to load WhatsApp logs')
    } finally {
      setLoading(false)
    }
  }, [page, filterStatus, filterTemplate, debouncedSearchQuery])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  // View detail
  const handleViewDetail = (log: WhatsAppLogRecord) => {
    setSelectedLog(log)
    setDetailOpen(true)
  }

  const totalPages = Math.ceil(total / limit)

  const normalizeMobile = (mobile: string) => mobile.replace(/\D/g, '').replace(/^0+/, '')

  const handleRetryViaWhatsApp = (log: WhatsAppLogRecord) => {
    const cleaned = normalizeMobile(log.mobile || '')
    if (!cleaned) {
      toast.error('Invalid mobile number for retry')
      return
    }
    const phone = cleaned.length === 10 ? `91${cleaned}` : cleaned
    const text = log.message || 'Please check the message details.'
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
    toast.success('Opening WhatsApp to retry the message')
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">WhatsApp Message Logs</h1>
          <p className="text-muted-foreground text-sm">View all WhatsApp messages sent from the system</p>
        </div>
        <Button variant="outline" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Filters & Search */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <SearchInput
            value={searchQuery}
            onChange={(v) => { setSearchQuery(v); setPage(1) }}
            onClear={clearSearch}
            loading={isDebouncing}
            placeholder="Search by mobile, template, message..."
            className="flex-1"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterTemplate} onValueChange={(v) => { setFilterTemplate(v === 'all' ? '' : v); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Templates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Templates</SelectItem>
                <SelectItem value="appointment_reminder">Appointment Reminder</SelectItem>
                <SelectItem value="payment_reminder">Payment Reminder</SelectItem>
                <SelectItem value="welcome">Welcome</SelectItem>
                <SelectItem value="assessment_report">Assessment Report</SelectItem>
                <SelectItem value="session_completed">Session Completed</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message Logs</CardTitle>
          <CardDescription>{total} total messages</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground text-sm">No WhatsApp logs found</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Mobile</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead className="hidden md:table-cell">Message Preview</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className={log.status === 'failed' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {format(parseISO(log.sentAt), 'dd MMM yyyy HH:mm')}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            {log.mobile}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {log.template.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell max-w-[280px] truncate text-sm text-muted-foreground">
                          {log.message}
                        </TableCell>
                        <TableCell>{getMessageStatusBadge(log.status)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewDetail(log)} title="View Details">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Page {page} of {totalPages} ({total} messages)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Message Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message Details</DialogTitle>
            <DialogDescription>WhatsApp message details and content</DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4 py-2">
              {/* Message bubble */}
              <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl rounded-tl-none p-4 max-w-[90%]">
                <p className="text-sm whitespace-pre-wrap">{selectedLog.message}</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 text-right">
                  {format(parseISO(selectedLog.sentAt), 'dd MMM yyyy, hh:mm a')}
                </p>
              </div>

              {/* Details */}
              <div className="space-y-2 rounded-lg border p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Mobile</span>
                  <span className="font-medium">{selectedLog.mobile}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Template</span>
                  <span className="capitalize">{selectedLog.template.replace(/_/g, ' ')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Status</span>
                  {getMessageStatusBadge(selectedLog.status)}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sent At</span>
                  <span>{format(parseISO(selectedLog.sentAt), 'dd MMM yyyy, hh:mm a')}</span>
                </div>
              </div>

              {selectedLog.status === 'failed' && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">Delivery Failed</p>
                  <p className="text-xs text-red-500 dark:text-red-500 mt-1">
                    The message could not be delivered. Please check the mobile number or try again later.
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => handleRetryViaWhatsApp(selectedLog)}>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry via WhatsApp
                  </Button>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
