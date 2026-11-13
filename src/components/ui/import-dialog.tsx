'use client'

/**
 * ImportDialog — generic, reusable 4-step import dialog.
 *
 * Any module can mount this with `module="patients"` (etc.) and get a full
 * upload → auto-map → validate → batch-import flow for free. The mapping
 * logic, alias registry, and validation rules all live in
 * `@/lib/import-engine` and `@/lib/import-configs`.
 *
 * Steps:
 *   1. Upload           — pick CSV/XLSX, download sample template
 *   2. Column Mapping   — review auto-detected mappings, adjust, remember
 *   3. Preview          — summary cards + invalid-rows table + error report
 *   4. Progress         — batch import with progress bar + final counts
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Upload,
  Download,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { authFetch } from '@/lib/api-client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  autoMapColumns,
  generateErrorReport,
  validateRows,
  type ModuleImportConfig,
  type ValidationResult,
} from '@/lib/import-engine'
import { IMPORT_CONFIGS } from '@/lib/import-configs'
// Static import — Turbopack creates a fragile async chunk for `import('xlsx')`
// (ESM `xlsx.mjs`) that intermittently fails to load with ChunkLoadError.
// A static top-level import bundles xlsx into this component's chunk instead.
import * as XLSX from 'xlsx'

export interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Module key — must exist in IMPORT_CONFIGS unless overridden. */
  module: string
  title: string
  description?: string
  /** Callback fired after a successful (or partial) import — usually refreshes the list. */
  onImportComplete?: () => void
  /** Existing records for duplicate detection (mobile / patientId / employeeId / email). */
  existingRecords?: { mobile?: string; patientId?: string; employeeId?: string; email?: string }[]
  /** Override the config's createEndpoint. */
  createEndpoint?: string
  /** Override the config's buildBody. */
  buildBody?: (row: Record<string, unknown>) => Record<string, unknown>
}

type Step = 'upload' | 'mapping' | 'preview' | 'progress'
type ImportMode = 'create' | 'skip' | 'update'

const BATCH_SIZE = 10

export function ImportDialog({
  open,
  onOpenChange,
  module,
  title,
  description,
  onImportComplete,
  existingRecords,
  createEndpoint,
  buildBody,
}: ImportDialogProps) {
  // ── Resolve the module config ────────────────────────────────────────────
  const config: ModuleImportConfig | undefined = IMPORT_CONFIGS[module]

  // ── State ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [confidence, setConfidence] = useState<Record<string, number>>({})
  const [unmatched, setUnmatched] = useState<string[]>([])
  const [ambiguous, setAmbiguous] = useState<{ header: string; candidates: { field: string; score: number }[] }[]>([])
  const [rememberMapping, setRememberMapping] = useState(true)
  const [validation, setValidation] = useState<ValidationResult>({
    valid: [], invalid: [], duplicates: [], emptyRowsSkipped: 0,
  })
  const [importMode, setImportMode] = useState<ImportMode>('create')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; success: number; fail: number }>({
    done: 0, total: 0, success: 0, fail: 0,
  })
  // Track individual record results for downloadable reports
  const [importResults, setImportResults] = useState<{
    successRows: Record<string, unknown>[]
    failedRows: { row: Record<string, unknown>; error: string; statusCode: number; responseBody: string; payload: Record<string, unknown> }[]
    skippedRows: Record<string, unknown>[]
    duplicateRows: Record<string, unknown>[]
    invalidRows: { row: Record<string, unknown>; issues: { category: string; field: string; message: string }[] }[]
    importedAt: string
    importedBy: string
  }>({ successRows: [], failedRows: [], skippedRows: [], duplicateRows: [], invalidRows: [], importedAt: '', importedBy: '' })
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Reset everything when the dialog closes ───────────────────────────────
  const resetState = useCallback(() => {
    setStep('upload')
    setFile(null)
    setRows([])
    setHeaders([])
    setMapping({})
    setConfidence({})
    setUnmatched([])
    setAmbiguous([])
    setRememberMapping(true)
    setValidation({ valid: [], invalid: [], duplicates: [], emptyRowsSkipped: 0 })
    setImportMode('create')
    setImporting(false)
    setProgress({ done: 0, total: 0, success: 0, fail: 0 })
    setParsing(false)
  }, [])

  useEffect(() => {
    if (!open) {
      // Defer reset so the close animation isn't janky.
      const t = setTimeout(resetState, 200)
      return () => clearTimeout(t)
    }
  }, [open, resetState])

  // ── Download a sample CSV template ────────────────────────────────────────
  const handleDownloadTemplate = useCallback(() => {
    if (!config) return
    const fieldKeys = config.fields.map((f) => f.field)
    const headerLabels = config.fields.map((f) => f.label.replace(/\s*\*$/, ''))
    // CSV with two rows: human-readable header (row 1) and field key (row 2)
    // so users see both what to fill and the canonical name.
    const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    const lines = [
      headerLabels.map(esc).join(','),
      fieldKeys.map(esc).join(','),
    ]
    const csv = '\ufeff' + lines.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${module}-import-template.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Template downloaded', { description: `${fieldKeys.length} fields for the ${module} module.` })
  }, [config, module])

  // ── Parse the uploaded file ───────────────────────────────────────────────
  const parseCSV = (text: string): Record<string, unknown>[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) return []
    const headers = parseCSVLine(lines[0])
    const out: Record<string, unknown>[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i])
      const row: Record<string, unknown> = {}
      headers.forEach((h, j) => { row[h] = values[j] ?? '' })
      out.push(row)
    }
    return out
  }

  const parseCSVLine = (line: string): string[] => {
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue }
        inQuotes = !inQuotes
        continue
      }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += char
    }
    values.push(current.trim())
    return values
  }

  const handleFileUpload = useCallback(async (selectedFile: File) => {
    if (!config) {
      toast.error('Unknown module', { description: `No import config found for "${module}".` })
      return
    }
    setParsing(true)
    setFile(selectedFile)
    try {
      let parsed: Record<string, unknown>[] = []
      const name = selectedFile.name.toLowerCase()
      if (name.endsWith('.csv')) {
        const text = await selectedFile.text()
        parsed = parseCSV(text)
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buffer = await selectedFile.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        parsed = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
      } else {
        toast.error('Unsupported file type', { description: 'Please upload a .csv or .xlsx file.' })
        return
      }

      if (parsed.length === 0) {
        toast.error('Empty file', { description: 'No data rows found in the file.' })
        return
      }

      const excelHeaders = Object.keys(parsed[0])
      // Load previous mappings from localStorage (if "remember" was checked).
      const storageKey = `import-mappings-${module}`
      let previousMappings: Record<string, string> | undefined
      try {
        const raw = localStorage.getItem(storageKey)
        if (raw) previousMappings = JSON.parse(raw)
      } catch { /* ignore */ }

      const result = autoMapColumns(excelHeaders, config, previousMappings)

      setRows(parsed)
      setHeaders(excelHeaders)
      setMapping(result.mapping)
      setConfidence(result.confidence)
      setUnmatched(result.unmatched)
      setAmbiguous(result.ambiguous)
      setStep('mapping')

      const autoCount = Object.values(result.mapping).filter((v) => v).length
      toast.info('File parsed', {
        description: `${parsed.length} rows • ${autoCount}/${excelHeaders.length} columns auto-mapped.`,
      })
    } catch (err) {
      console.error('Failed to parse file:', err)
      toast.error('Failed to parse file', { description: 'Please check the file format and try again.' })
    } finally {
      setParsing(false)
    }
  }, [config, module])

  // ── Update a single mapping ───────────────────────────────────────────────
  const handleMappingChange = (excelHeader: string, fieldKey: string) => {
    setMapping((prev) => ({ ...prev, [excelHeader]: fieldKey }))
    // Clear ambiguity flag once the user picks something.
    setAmbiguous((prev) => prev.filter((a) => a.header !== excelHeader))
  }

  // ── Apply mapping & validate → go to preview ──────────────────────────────
  const handleValidate = useCallback(() => {
    if (!config) return

    // Check that all required fields are mapped.
    const requiredFields = config.fields.filter((f) => f.required)
    const mappedFields = new Set(Object.values(mapping).filter(Boolean))
    const missing = requiredFields.filter((f) => !mappedFields.has(f.field))
    if (missing.length > 0) {
      toast.error('Missing required columns', {
        description: `Please map: ${missing.map((f) => f.label).join(', ')}.`,
      })
      return
    }

    const result = validateRows(rows, mapping, config, existingRecords)
    setValidation(result)

    // Persist mapping if requested.
    if (rememberMapping) {
      try {
        const storageKey = `import-mappings-${module}`
        // Only persist non-empty mappings.
        const toSave: Record<string, string> = {}
        for (const [k, v] of Object.entries(mapping)) {
          if (v) toSave[k] = v
        }
        localStorage.setItem(storageKey, JSON.stringify(toSave))
      } catch { /* ignore */ }
    }

    setStep('preview')
    toast.info('Validation complete', {
      description: `${result.valid.length} valid • ${result.invalid.length} invalid • ${result.duplicates.length} duplicates.`,
    })
  }, [config, mapping, rows, existingRecords, rememberMapping, module])

  // ── Download error report CSV ──────────────────────────────────────────────
  const handleDownloadErrorReport = useCallback(() => {
    if (validation.invalid.length === 0) {
      toast.info('No errors', { description: 'There are no invalid rows to report.' })
      return
    }
    const csv = generateErrorReport(validation.invalid)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${module}-import-errors.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [validation.invalid, module])

  // ── Execute the batch import ───────────────────────────────────────────────
  const handleImport = useCallback(async () => {
    if (!config) return
    const endpoint = createEndpoint ?? config.createEndpoint
    const bodyBuilder = buildBody ?? config.buildBody

    // Determine which records to import based on the selected mode.
    const recordsToImport =
      importMode === 'create' ? validation.valid
        : importMode === 'skip' ? validation.valid
          : [...validation.valid, ...validation.duplicates]

    if (recordsToImport.length === 0) {
      toast.error('No records', { description: 'No valid records to import.' })
      return
    }

    setImporting(true)
    setStep('progress')
    setProgress({ done: 0, total: recordsToImport.length, success: 0, fail: 0 })

    // Track individual record results for downloadable reports
    const successRows: Record<string, unknown>[] = []
    const failedRows: { row: Record<string, unknown>; error: string; statusCode: number; responseBody: string; payload: Record<string, unknown> }[] = []
    // Invalid rows (from validation, not attempted)
    const invalidRowData = validation.invalid.map(v => ({
      row: v.data,
      issues: v.issues.map(i => ({ category: i.category, field: i.field, message: i.message })),
    }))

    let successCount = 0
    let failCount = 0

    try {
      for (let i = 0; i < recordsToImport.length; i += BATCH_SIZE) {
        const batch = recordsToImport.slice(i, i + BATCH_SIZE)
        // Process each record sequentially within the batch to capture full error details
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j]
          const body = bodyBuilder ? bodyBuilder(row) : row
          try {
            const res = await authFetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            if (!res.ok) {
              // Capture the EXACT API error — never a generic "Failed to create" message.
              // The backend now returns { error, detail, status } for real errors like
              // "A patient with this mobile already exists", "Invalid date", etc.
              const responseText = await res.text().catch(() => '')
              let errorMsg = `HTTP ${res.status}`
              let responseBody = responseText

              if (responseText) {
                try {
                  const errorJson = JSON.parse(responseText)
                  // Prefer the user-facing `error`, then fall back to other
                  // common fields, then to the raw detail.
                  errorMsg =
                    errorJson.error ||
                    errorJson.message ||
                    errorJson.details ||
                    errorJson.detail ||
                    (typeof errorJson === 'string' ? errorJson : `HTTP ${res.status}: ${responseText.substring(0, 200)}`)
                  responseBody = JSON.stringify(errorJson)
                } catch {
                  // Body wasn't JSON — use the raw text (truncated).
                  errorMsg = responseText.substring(0, 500)
                }
              } else {
                // Empty body — include the HTTP status so it's not a bare "HTTP 500".
                errorMsg = `HTTP ${res.status} (empty response body from server)`
              }

              failCount++
              failedRows.push({
                row,
                error: errorMsg,
                statusCode: res.status,
                responseBody,
                payload: body,
              })
              // Use console.warn for expected business-rule failures (e.g.
              // duplicate mobile, invalid date) so the browser console isn't
              // filled with red errors during a normal import. True network
              // exceptions below still use console.error.
              console.warn(`[Import] Row failed: HTTP ${res.status}`, {
                error: errorMsg,
                statusCode: res.status,
                responseBody,
                payload: body,
              })
            } else {
              successCount++
              successRows.push(row)
            }
          } catch (err) {
            // Network error or exception
            failCount++
            const errorMsg = err instanceof Error ? err.message : String(err)
            failedRows.push({
              row,
              error: errorMsg,
              statusCode: 0,
              responseBody: '',
              payload: body,
            })
            console.error(`[Import] Row exception:`, { error: errorMsg, payload: body })
          }
        }
        setProgress({ done: Math.min(i + BATCH_SIZE, recordsToImport.length), total: recordsToImport.length, success: successCount, fail: failCount })
      }

      // Store results for downloadable reports
      const now = new Date().toISOString()
      setImportResults({
        successRows,
        failedRows,
        skippedRows: importMode === 'skip' ? validation.duplicates : [],
        duplicateRows: validation.duplicates,
        invalidRows: invalidRowData,
        importedAt: now,
        importedBy: 'current_user', // Will be enriched in download
      })

      // Audit log entry.
      try {
        await authFetch('/api/action-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module,
            recordId: 'bulk-import',
            actionType: 'imported',
            notes: `Imported ${successCount} ${module} from file "${file?.name ?? 'unknown'}". Failed: ${failCount}. Total parsed: ${rows.length}.`,
          }),
        })
      } catch { /* audit log is best-effort */ }

      if (failCount === 0) {
        toast.success('Import complete', {
          description: `${successCount} record(s) imported successfully.`,
        })
      } else {
        toast.warning('Import complete with errors', {
          description: `${successCount} succeeded, ${failCount} failed.`,
        })
      }
      onImportComplete?.()
    } catch (err) {
      console.error('Import failed:', err)
      toast.error('Import failed', { description: 'An unexpected error occurred during import.' })
    } finally {
      setImporting(false)
    }
  }, [config, createEndpoint, buildBody, importMode, validation, module, file, rows.length, onImportComplete])

  // ── Download functions for import results ─────────────────────────────────
  const downloadXLSX = useCallback((data: Record<string, unknown>[], filename: string, extraColumns?: string[]) => {
    if (data.length === 0) {
      toast.info('No data', { description: 'There are no records to download.' })
      return
    }
    // Preserve original column order from the uploaded file
    const originalHeaders = rows.length > 0 ? Object.keys(rows[0]) : Object.keys(data[0])
    // Build worksheet data with original columns + extra columns
    const sheetData = data.map(row => {
      const out: Record<string, unknown> = {}
      for (const h of originalHeaders) {
        out[h] = row[h] ?? row[h] ?? ''
      }
      if (extraColumns) {
        for (const ec of extraColumns) {
          out[ec] = (row as Record<string, unknown>)[ec] ?? ''
        }
      }
      return out
    })
    const ws = XLSX.utils.json_to_sheet(sheetData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Import Results')
    XLSX.writeFile(wb, filename)
    toast.success('Downloaded', { description: filename })
  }, [rows])

  const handleDownloadImported = useCallback(() => {
    const data = importResults.successRows.map(row => ({
      ...row,
      'Import Status': 'Success',
      'Imported Date & Time': new Date(importResults.importedAt).toLocaleString(),
      'Imported By': importResults.importedBy,
    }))
    downloadXLSX(data, `imported-records-${module}-${Date.now()}.xlsx`, ['Import Status', 'Imported Date & Time', 'Imported By'])
  }, [importResults, downloadXLSX, module])

  const handleDownloadFailed = useCallback(() => {
    // Combine API-failed rows + validation-invalid rows
    const apiFailed = importResults.failedRows.map(f => ({
      ...f.row,
      'Import Status': 'Failed',
      'Error Category': 'api_error',
      'Error Message': f.error,
      'HTTP Status Code': f.statusCode,
      'API Response Body': f.responseBody,
      'Failed Field(s)': '',
    }))
    const validationFailed = importResults.invalidRows.map(v => ({
      ...v.row,
      'Import Status': 'Failed',
      'Error Category': v.issues.map(i => i.category).join('; '),
      'Error Message': v.issues.map(i => i.message).join('; '),
      'HTTP Status Code': '',
      'API Response Body': '',
      'Failed Field(s)': v.issues.map(i => i.field).join('; '),
    }))
    const allFailed = [...apiFailed, ...validationFailed]
    downloadXLSX(allFailed, `failed-records-${module}-${Date.now()}.xlsx`, ['Import Status', 'Error Category', 'Error Message', 'HTTP Status Code', 'API Response Body', 'Failed Field(s)'])
  }, [importResults, downloadXLSX, module])

  const handleDownloadFullReport = useCallback(() => {
    const success = importResults.successRows.map(row => ({
      ...row,
      'Import Status': 'Success',
      'Error Category': '',
      'Error Message': '',
      'Imported Date & Time': new Date(importResults.importedAt).toLocaleString(),
      'Imported By': importResults.importedBy,
    }))
    const apiFailed = importResults.failedRows.map(f => ({
      ...f.row,
      'Import Status': 'Failed (API)',
      'Error Category': 'api_error',
      'Error Message': f.error,
      'HTTP Status Code': f.statusCode,
      'API Response Body': f.responseBody,
      'Imported Date & Time': '',
      'Imported By': '',
    }))
    const validationFailed = importResults.invalidRows.map(v => ({
      ...v.row,
      'Import Status': 'Failed (Validation)',
      'Error Category': v.issues.map(i => i.category).join('; '),
      'Error Message': v.issues.map(i => i.message).join('; '),
      'HTTP Status Code': '',
      'API Response Body': '',
      'Imported Date & Time': '',
      'Imported By': '',
    }))
    const duplicates = importResults.duplicateRows.map(row => ({
      ...row,
      'Import Status': 'Duplicate',
      'Error Category': 'duplicate',
      'Error Message': 'Record already exists',
      'HTTP Status Code': '',
      'API Response Body': '',
      'Imported Date & Time': '',
      'Imported By': '',
    }))
    const skipped = importResults.skippedRows.map(row => ({
      ...row,
      'Import Status': 'Skipped',
      'Error Category': '',
      'Error Message': 'Skipped (duplicate)',
      'HTTP Status Code': '',
      'API Response Body': '',
      'Imported Date & Time': '',
      'Imported By': '',
    }))
    const successWithCols = success.map(row => ({
      ...row,
      'HTTP Status Code': '',
      'API Response Body': '',
    }))
    const allRecords = [...successWithCols, ...apiFailed, ...validationFailed, ...duplicates, ...skipped]
    downloadXLSX(allRecords, `full-import-report-${module}-${Date.now()}.xlsx`, ['Import Status', 'Error Category', 'Error Message', 'HTTP Status Code', 'API Response Body', 'Imported Date & Time', 'Imported By'])
  }, [importResults, downloadXLSX, module])

  // ── Derived data ───────────────────────────────────────────────────────────
  const confidenceColor = (score: number) => {
    if (score >= 0.85) return 'text-emerald-600'
    if (score >= 0.75) return 'text-amber-600'
    return 'text-red-600'
  }
  const confidenceLabel = (score: number) => {
    if (score >= 0.85) return 'High'
    if (score >= 0.75) return 'Medium'
    return 'Low'
  }

  const recordsToImportCount = useMemo(() => {
    if (importMode === 'update') return validation.valid.length + validation.duplicates.length
    return validation.valid.length
  }, [importMode, validation])

  if (!config) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import — configuration missing</DialogTitle>
            <DialogDescription>
              No import configuration is registered for module &quot;{module}&quot;.
              Add an entry to <code>src/lib/import-configs.ts</code> first.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description ?? (
              step === 'upload' ? 'Upload an Excel (.xlsx) or CSV file to bulk-import records.'
                : step === 'mapping' ? 'Review the auto-detected column mappings. Adjust if needed, then validate.'
                  : step === 'preview' ? 'Review validation results, then import.'
                    : 'Importing records in batches. Please wait.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          {(['upload', 'mapping', 'preview', 'progress'] as Step[]).map((s, i) => {
            const isActive = step === s
            const isPast = (['upload', 'mapping', 'preview', 'progress'] as Step[]).indexOf(step) > i
            return (
              <React.Fragment key={s}>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium transition-colors ${
                    isActive ? 'bg-primary text-primary-foreground'
                      : isPast ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/20 text-[10px]">
                    {i + 1}
                  </span>
                  <span className="capitalize">{s === 'progress' ? 'Import' : s}</span>
                </div>
                {i < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              </React.Fragment>
            )
          })}
        </div>

        <div className="space-y-4">
          {/* ── STEP 1: Upload ─────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsing}
                className="flex w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg py-10 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {parsing ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                )}
                <div className="text-center">
                  <p className="text-sm font-medium">{parsing ? 'Parsing file…' : 'Click to upload a file'}</p>
                  <p className="text-xs text-muted-foreground">Excel (.xlsx) or CSV (.csv) — max 10MB</p>
                </div>
              </button>

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Required fields: <strong>{config.fields.filter((f) => f.required).map((f) => f.label).join(', ')}</strong>.
                    Download the template to see all available columns.
                  </span>
                </div>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="shrink-0">
                  <Download className="h-4 w-4 mr-1.5" />
                  Sample Template
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: Column Mapping ────────────────────────────────── */}
          {step === 'mapping' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-sm font-medium">
                  Column Mapping <span className="text-muted-foreground font-normal">({rows.length} rows detected)</span>
                </p>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={rememberMapping} onCheckedChange={(v) => setRememberMapping(v === true)} />
                  Remember mapping for next import
                </label>
              </div>

              {/* Unmatched / ambiguous warnings */}
              {unmatched.length > 0 && (
                <div className="rounded-md border border-red-200 bg-red-50/50 p-2.5 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{unmatched.length}</strong> column(s) could not be auto-mapped: {unmatched.slice(0, 5).join(', ')}{unmatched.length > 5 ? '…' : ''}. Map them manually or skip.
                  </span>
                </div>
              )}
              {ambiguous.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{ambiguous.length}</strong> column(s) have multiple possible matches — please confirm: {ambiguous.slice(0, 5).map((a) => a.header).join(', ')}{ambiguous.length > 5 ? '…' : ''}.
                  </span>
                </div>
              )}

              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-[40vh] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Excel Column</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">→ System Field</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Confidence</th>
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Sample Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {headers.map((excelHeader) => {
                        const fieldKey = mapping[excelHeader] ?? ''
                        const score = confidence[excelHeader] ?? 0
                        const isUnmatched = unmatched.includes(excelHeader)
                        const isAmbiguous = ambiguous.some((a) => a.header === excelHeader)
                        return (
                          <tr key={excelHeader} className="hover:bg-muted/30">
                            <td className="px-4 py-2 font-medium">{excelHeader}</td>
                            <td className="px-4 py-2">
                              <select
                                className="w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                value={fieldKey}
                                onChange={(e) => handleMappingChange(excelHeader, e.target.value)}
                              >
                                <option value="">— Skip —</option>
                                {config.fields.map((f) => (
                                  <option key={f.field} value={f.field}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              {fieldKey ? (
                                <span className={`inline-flex items-center gap-1 text-xs font-medium ${confidenceColor(score)}`}>
                                  {score >= 0.85 && <CheckCircle2 className="h-3.5 w-3.5" />}
                                  {isAmbiguous && <AlertCircle className="h-3.5 w-3.5" />}
                                  {isUnmatched && <XCircle className="h-3.5 w-3.5" />}
                                  {confidenceLabel(score)} ({Math.round(score * 100)}%)
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                              {String(rows[0]?.[excelHeader] ?? '-')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>
                  Fields marked with <strong>*</strong> are required. Green = high confidence, Amber = ambiguous (confirm), Red = unmapped.
                </span>
              </div>
            </div>
          )}

          {/* ── STEP 3: Preview & Validation ──────────────────────────── */}
          {step === 'preview' && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl font-bold">{rows.length}</p>
                </Card>
                <Card className="p-3 text-center bg-emerald-50/50 border-emerald-200">
                  <p className="text-xs text-emerald-600">Valid</p>
                  <p className="text-xl font-bold text-emerald-600">{validation.valid.length}</p>
                </Card>
                <Card className="p-3 text-center bg-red-50/50 border-red-200">
                  <p className="text-xs text-red-600">Invalid</p>
                  <p className="text-xl font-bold text-red-600">{validation.invalid.length}</p>
                </Card>
                <Card className="p-3 text-center bg-amber-50/50 border-amber-200">
                  <p className="text-xs text-amber-600">Duplicates</p>
                  <p className="text-xl font-bold text-amber-600">{validation.duplicates.length}</p>
                </Card>
                <Card className="p-3 text-center bg-muted/50">
                  <p className="text-xs text-muted-foreground">Empty Skipped</p>
                  <p className="text-xl font-bold">{validation.emptyRowsSkipped}</p>
                </Card>
              </div>

              {/* Import mode */}
              {validation.valid.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Import Mode:</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={importMode === 'create' ? 'default' : 'outline'}
                      onClick={() => setImportMode('create')}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Import All Valid ({validation.valid.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={importMode === 'skip' ? 'default' : 'outline'}
                      onClick={() => setImportMode('skip')}
                      disabled={validation.duplicates.length === 0}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Skip Duplicates ({validation.valid.length})
                    </Button>
                    <Button
                      size="sm"
                      variant={importMode === 'update' ? 'default' : 'outline'}
                      onClick={() => setImportMode('update')}
                      disabled={validation.duplicates.length === 0}
                    >
                      <Upload className="h-3.5 w-3.5 mr-1" />
                      Update Existing ({validation.valid.length + validation.duplicates.length})
                    </Button>
                  </div>
                </div>
              )}

              {/* Invalid rows table */}
              {validation.invalid.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-red-700 flex items-center gap-1.5">
                      <AlertCircle className="h-4 w-4" />
                      Invalid Rows ({validation.invalid.length})
                    </p>
                    <Button size="sm" variant="outline" onClick={handleDownloadErrorReport}>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download Error Report
                    </Button>
                  </div>
                  <div className="rounded-lg border max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr className="border-b">
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground w-16">Row</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Errors</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {validation.invalid.slice(0, 100).map((err) => (
                          <tr key={err.row} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-bold text-red-600">{err.row}</td>
                            <td className="px-3 py-2 text-red-700">
                              {err.issues.map((iss, i) => (
                                <div key={i}>
                                  <span className="font-medium">{iss.field || 'row'}:</span> {iss.message}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                        {validation.invalid.length > 100 && (
                          <tr>
                            <td colSpan={2} className="px-3 py-2 text-center text-muted-foreground">
                              …and {validation.invalid.length - 100} more rows. Download the error report for the full list.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : validation.valid.length > 0 ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  All rows passed validation. Ready to import.
                </div>
              ) : (
                <div className="rounded-md border border-red-200 bg-red-50/50 p-3 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  No valid rows to import. Fix the errors above and re-upload, or adjust the column mapping.
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Progress & Results ────────────────────────────── */}
          {step === 'progress' && (
            <div className="space-y-5">
              {/* Progress bar (during import) */}
              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Importing records…</span>
                    <span className="text-muted-foreground">{progress.done} / {progress.total}</span>
                  </div>
                  <Progress value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100} />
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Importing in batches of {BATCH_SIZE} — please keep this dialog open.
                  </p>
                </div>
              )}

              {/* Import Summary (after import completes) */}
              {!importing && (
                <>
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <span className="text-sm font-semibold">Import Summary</span>
                  </div>

                  {/* Summary cards — 6 metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <Card className="p-3 text-center">
                      <p className="text-xs text-muted-foreground">Total Records</p>
                      <p className="text-xl font-bold text-gray-900">{rows.length}</p>
                    </Card>
                    <Card className="p-3 text-center bg-emerald-50/50 border-emerald-200">
                      <p className="text-xs text-emerald-600">Successfully Imported</p>
                      <p className="text-xl font-bold text-emerald-600">{importResults.successRows.length}</p>
                    </Card>
                    <Card className="p-3 text-center bg-red-50/50 border-red-200">
                      <p className="text-xs text-red-600">Failed Records</p>
                      <p className="text-xl font-bold text-red-600">{importResults.failedRows.length + importResults.invalidRows.length}</p>
                    </Card>
                    <Card className="p-3 text-center bg-amber-50/50 border-amber-200">
                      <p className="text-xs text-amber-600">Skipped Records</p>
                      <p className="text-xl font-bold text-amber-600">{importResults.skippedRows.length}</p>
                    </Card>
                    <Card className="p-3 text-center bg-blue-50/50 border-blue-200">
                      <p className="text-xs text-blue-600">Duplicate Records</p>
                      <p className="text-xl font-bold text-blue-600">{importResults.duplicateRows.length}</p>
                    </Card>
                    <Card className="p-3 text-center bg-gray-50/50 border-gray-200">
                      <p className="text-xs text-gray-500">Empty Rows Skipped</p>
                      <p className="text-xl font-bold text-gray-500">{validation.emptyRowsSkipped}</p>
                    </Card>
                  </div>

                  {/* Warnings */}
                  {(importResults.failedRows.length > 0 || importResults.invalidRows.length > 0) && (
                    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-700 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>
                        {importResults.failedRows.length + importResults.invalidRows.length} record(s) failed.
                        Download the failed records, correct them in Excel, and re-import.
                      </span>
                    </div>
                  )}

                  {/* Download buttons */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Download Import Results:</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadImported}
                        disabled={importResults.successRows.length === 0}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Imported Records ({importResults.successRows.length})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadFailed}
                        disabled={importResults.failedRows.length === 0 && importResults.invalidRows.length === 0}
                        className="gap-1.5"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Failed Records ({importResults.failedRows.length + importResults.invalidRows.length})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleDownloadFullReport}
                        className="gap-1.5"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Full Import Report ({rows.length})
                      </Button>
                    </div>
                  </div>

                  {/* Import metadata */}
                  <div className="text-xs text-muted-foreground border-t pt-2">
                    <p>Imported at: {new Date(importResults.importedAt).toLocaleString()}</p>
                    <p>File: {file?.name || 'unknown'}</p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <div>
            {step !== 'upload' && step !== 'progress' && (
              <Button
                variant="outline"
                onClick={() => setStep(step === 'preview' ? 'mapping' : 'upload')}
                disabled={importing}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={importing}
            >
              {step === 'progress' && !importing ? 'Close' : 'Cancel'}
            </Button>
            {step === 'mapping' && (
              <Button onClick={handleValidate} className="gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Validate & Preview
              </Button>
            )}
            {step === 'preview' && recordsToImportCount > 0 && (
              <Button onClick={handleImport} className="gap-1.5">
                <Upload className="h-4 w-4" />
                Import {recordsToImportCount} Record{recordsToImportCount === 1 ? '' : 's'}
              </Button>
            )}
            {step === 'progress' && !importing && (
              <Button
                onClick={() => {
                  onImportComplete?.()
                  onOpenChange(false)
                }}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-4 w-4" />
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Export the table pieces that some callers may want to reuse for custom UIs.
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Card, CardContent }
