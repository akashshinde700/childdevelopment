/**
 * import-engine.ts
 * ----------------
 * Generic, framework-agnostic Excel/CSV import engine.
 *
 * Pure TypeScript — no React, no DOM, no Next.js dependencies.
 * Can be unit-tested in isolation and reused by any module.
 *
 * Exports:
 *   - normalizeHeader(s)            → canonical lowercase string for matching
 *   - fuzzyMatch(a, b)              → Levenshtein-based similarity 0..1
 *   - autoMapColumns(...)           → map Excel headers → module fields
 *   - validateRows(...)             → split rows into valid / invalid / duplicates
 *   - generateErrorReport(...)      → CSV string with row-level errors
 *   - MODULE_CONFIGS                → default module configurations (re-exported
 *                                     from import-configs.ts — the single source
 *                                     of truth that admins can extend)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Header normalization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize a header string for matching purposes.
 *
 * Pipeline:
 *   1. Convert camelCase → space-separated words ("childName" → "child Name")
 *   2. Lowercase
 *   3. Strip everything that is not a-z or 0-9 (spaces, underscores, hyphens,
 *      dots, quotes, etc.)
 *
 * Result is a single lowercase alphanumeric token, e.g.:
 *   "Child Name"   → "childname"
 *   "child_name"   → "childname"
 *   "child-name"   → "childname"
 *   "childName"    → "childname"
 *   "D.O.B"        → "dob"
 *   "Mobile No."   → "mobileno"
 */
export function normalizeHeader(s: string): string {
  if (!s) return ''
  // camelCase → words. Handles "childName", "dateOfBirth", "mobileNumber".
  // Also handles PascalCase ("ChildName") and consecutive caps ("HTTPServer").
  let out = String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  out = out.toLowerCase()
  out = out.replace(/[^a-z0-9]/g, '')
  return out.trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Fuzzy matching (Levenshtein)
// ─────────────────────────────────────────────────────────────────────────────

/** Standard Levenshtein edit-distance between two strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  // Use two rolling arrays to keep memory O(min(m,n)).
  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1,        // deletion
        curr[j - 1] + 1,    // insertion
        prev[j - 1] + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]
}

/**
 * Fuzzy similarity score between 0 and 1.
 *
 * Both inputs are normalized first, so "Child Name" and "childname" score 1.0.
 * 1.0 = identical, 0.0 = completely different.
 */
export function fuzzyMatch(a: string, b: string): number {
  const s1 = normalizeHeader(a)
  const s2 = normalizeHeader(b)
  if (!s1 && !s2) return 1
  if (!s1 || !s2) return 0
  if (s1 === s2) return 1
  const dist = levenshtein(s1, s2)
  const maxLen = Math.max(s1.length, s2.length)
  if (maxLen === 0) return 1
  return 1 - dist / maxLen
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Field / module configuration types
// ─────────────────────────────────────────────────────────────────────────────

export interface FieldAlias {
  /** Field key as used in the API request body, e.g. "childName". */
  field: string
  /** Human-readable label, e.g. "Child Name". */
  label: string
  /** Required fields must be present and non-empty in every row. */
  required: boolean
  /**
   * All known alias variations for this field (lowercased, but the engine
   * normalizes again so any casing/separator is fine). 10-15 per field is
   * ideal for high auto-mapping accuracy.
   */
  aliases: string[]
  /** Optional inline validation hint. */
  type?: 'text' | 'mobile' | 'email' | 'date' | 'number'
}

export interface ModuleImportConfig {
  /** Module key, e.g. "patients", "employees". */
  module: string
  /** Field definitions with aliases. */
  fields: FieldAlias[]
  /** API endpoint to POST each valid row to, e.g. "/api/patients". */
  createEndpoint: string
  /**
   * Build the POST body from a normalized row (keys = field keys).
   * Defaults to an identity transform that trims strings and drops empties.
   */
  buildBody?: (row: Record<string, unknown>) => Record<string, unknown>
  /**
   * Field key(s) used for duplicate detection against existing records.
   * Defaults to ['mobile'] when not specified.
   */
  duplicateKeys?: string[]
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. autoMapColumns
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoMapResult {
  /** { excelHeader: fieldKey | '' } — empty string means "skip / unmapped". */
  mapping: Record<string, string>
  /** { excelHeader: 0..1 } — confidence score for the mapping. */
  confidence: Record<string, number>
  /** Headers that could not be auto-mapped (best score < 0.75). */
  unmatched: string[]
  /**
   * Headers where multiple fields matched with similar scores — the user
   * should confirm the pre-selected mapping.
   */
  ambiguous: { header: string; candidates: { field: string; score: number }[] }[]
}

/** Minimum fuzzy score to consider a match. */
const MATCH_THRESHOLD = 0.75
/** If the top-2 fields score within this delta, the header is ambiguous. */
const AMBIGUITY_DELTA = 0.1

/**
 * Compute a 0..1 match score between an Excel header and a single alias.
 *
 *   - exact normalized match → 1.0
 *   - one is a substring of the other → 0.9 (good but not perfect —
 *     "name" matches "childname" but also "parentname", so it's lower
 *     confidence than an exact match)
 *   - otherwise → Levenshtein-based fuzzy score
 */
function scoreAlias(header: string, alias: string): number {
  const h = normalizeHeader(header)
  const a = normalizeHeader(alias)
  if (!h || !a) return 0
  if (h === a) return 1
  if (h.includes(a) || a.includes(h)) {
    // Length-aware substring score: matching "name" against "childname" is
    // weaker than "childname" against "childnames".
    const minLen = Math.min(h.length, a.length)
    const maxLen = Math.max(h.length, a.length)
    return 0.9 * (minLen / maxLen) + 0.1 // ranges ~0.55..1.0 for substring matches
  }
  return fuzzyMatch(h, a)
}

/**
 * Auto-map Excel headers to module fields using the alias registry.
 *
 * Honors `previousMappings` (saved from a prior import) — if a header was
 * mapped before, the saved mapping is reused with confidence 1.0.
 */
export function autoMapColumns(
  excelHeaders: string[],
  config: ModuleImportConfig,
  previousMappings?: Record<string, string>,
): AutoMapResult {
  const mapping: Record<string, string> = {}
  const confidence: Record<string, number> = {}
  const unmatched: string[] = []
  const ambiguous: AutoMapResult['ambiguous'] = []

  // Pre-compute normalized aliases per field for speed.
  const fieldScores = (header: string) =>
    config.fields.map((f) => {
      let best = 0
      for (const alias of f.aliases) {
        const s = scoreAlias(header, alias)
        if (s > best) best = s
      }
      return { field: f.field, label: f.label, score: best }
    })

  for (const header of excelHeaders) {
    // 1. Remembered mapping — highest priority.
    if (previousMappings && previousMappings[header]) {
      const fieldKey = previousMappings[header]
      // Validate the remembered field still exists in the config.
      const exists = config.fields.some((f) => f.field === fieldKey)
      if (exists) {
        mapping[header] = fieldKey
        confidence[header] = 1.0
        continue
      }
    }

    // 2. Score against every field.
    const scores = fieldScores(header).sort((a, b) => b.score - a.score)
    const best = scores[0]
    const second = scores[1]

    if (!best || best.score < MATCH_THRESHOLD) {
      mapping[header] = ''
      confidence[header] = best?.score ?? 0
      unmatched.push(header)
      continue
    }

    // 3. Ambiguity check — top-2 within delta and both above threshold.
    if (
      second &&
      second.score >= MATCH_THRESHOLD &&
      best.score - second.score < AMBIGUITY_DELTA
    ) {
      ambiguous.push({
        header,
        candidates: scores
          .filter((s) => s.score >= MATCH_THRESHOLD && best.score - s.score < AMBIGUITY_DELTA)
          .map((s) => ({ field: s.field, score: s.score })),
      })
    }

    mapping[header] = best.field
    confidence[header] = best.score
  }

  return { mapping, confidence, unmatched, ambiguous }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. validateRows
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationIssue {
  /** 1-based row number (2 = first data row, after the header). */
  row: number
  /** Field key the issue relates to (or "" for row-level issues). */
  field: string
  /** Human-readable error message. */
  message: string
  /** The invalid value as it appeared in the row. */
  value: unknown
  /** Machine-readable error category for precise error reporting. */
  category: 'not_mapped' | 'empty' | 'invalid_value' | 'conversion_failed' | 'duplicate'
  /** The Excel column header this value came from (for traceability). */
  excelColumn?: string
  /** The raw cell value before conversion. */
  rawValue?: unknown
  /** The converted value (if conversion was attempted). */
  convertedValue?: unknown
}

export interface ValidationResult {
  valid: Record<string, unknown>[]
  invalid: { row: number; issues: ValidationIssue[]; data: Record<string, unknown> }[]
  /** Rows that are valid but match an existing record on a duplicate key. */
  duplicates: Record<string, unknown>[]
  /** Empty rows that were silently skipped. */
  emptyRowsSkipped: number
}

/** A row is "empty" if every mapped value is blank/whitespace. */
function isRowEmpty(row: Record<string, unknown>): boolean {
  const values = Object.values(row)
  if (values.length === 0) return true
  return values.every((v) => {
    if (v === null || v === undefined) return true
    return String(v).trim() === ''
  })
}

/** Validate a single value against a field's declared type. */
/**
 * Convert Excel serial date number to JavaScript Date.
 * Excel epoch: January 1, 1900 (with the Leap Year Bug: 1900 is treated as leap).
 * Serial 1 = Jan 1, 1900. Serial 60 = Feb 29, 1900 (nonexistent, but Excel counts it).
 * For serials > 60, we subtract 2 days to account for the bug.
 * For serials <= 60, we subtract 1 day.
 */
function excelSerialToDate(serial: number): Date | null {
  if (typeof serial !== 'number' || isNaN(serial) || serial < 1) return null
  // Excel epoch: Dec 30, 1899 (accounts for the 1900 leap year bug)
  const excelEpoch = Date.UTC(1899, 11, 30)
  const ms = excelEpoch + serial * 24 * 60 * 60 * 1000
  const d = new Date(ms)
  if (isNaN(d.getTime())) return null
  // Sanity check: year must be between 1900 and 2100
  if (d.getUTCFullYear() < 1900 || d.getUTCFullYear() > 2100) return null
  return d
}

/**
 * Try to parse a date from various input formats:
 * - Excel serial number (e.g., 45200)
 * - JavaScript Date object
 * - ISO date string (2020-05-15, 2020-05-15T00:00:00Z)
 * - Common date formats: DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY, DD MMM YYYY, etc.
 * Returns an ISO date string (YYYY-MM-DD) or null if conversion fails.
 */
function convertToDate(raw: unknown): { iso: string; date: Date } | null {
  if (raw === null || raw === undefined || raw === '') return null

  // Already a Date object
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null
    return { iso: raw.toISOString().split('T')[0], date: raw }
  }

  // Excel serial number (numeric value that's not a year)
  if (typeof raw === 'number') {
    // If it looks like a year (1900-2100), it's not a serial date
    if (raw >= 1900 && raw <= 2100 && Number.isInteger(raw)) return null
    const d = excelSerialToDate(raw)
    if (d) return { iso: d.toISOString().split('T')[0], date: d }
    return null
  }

  const str = String(raw).trim()
  if (!str) return null

  // Pure number string → could be Excel serial
  if (/^\d{5}$/.test(str)) {
    const d = excelSerialToDate(parseInt(str))
    if (d) return { iso: d.toISOString().split('T')[0], date: d }
  }

  // ISO format: 2020-05-15 or 2020-05-15T00:00:00
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return { iso: str.split('T')[0], date: d }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (m) {
    const [, dd, mm, yyyy] = m
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd))
    if (!isNaN(d.getTime())) return { iso: d.toISOString().split('T')[0], date: d }
  }

  // MM/DD/YYYY (US format)
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) {
    const [, mm, dd, yyyy] = m
    const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd))
    if (!isNaN(d.getTime())) return { iso: d.toISOString().split('T')[0], date: d }
  }

  // DD MMM YYYY (e.g., "15 May 2020", "15-May-2020")
  m = str.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{4})$/)
  if (m) {
    const d = new Date(str.replace(/-/g, ' '))
    if (!isNaN(d.getTime())) return { iso: d.toISOString().split('T')[0], date: d }
  }

  // MMM DD, YYYY (e.g., "May 15, 2020")
  m = str.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})$/)
  if (m) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) return { iso: d.toISOString().split('T')[0], date: d }
  }

  // Generic Date parse as last resort
  const d = new Date(str)
  if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
    return { iso: d.toISOString().split('T')[0], date: d }
  }

  return null
}

/**
 * Convert and normalize a raw cell value based on field type.
 * Returns the converted value or throws with a descriptive error.
 */
function convertValue(
  field: FieldAlias,
  rawValue: unknown,
): { value: unknown; rawValue: unknown; converted: boolean } {
  const raw = rawValue

  // Handle null/undefined/empty
  if (raw === null || raw === undefined) {
    return { value: '', rawValue: raw, converted: false }
  }

  switch (field.type) {
    case 'date': {
      const result = convertToDate(raw)
      if (result) {
        return { value: result.iso, rawValue: raw, converted: true }
      }
      // Conversion failed — return empty and let validation flag it
      return { value: '', rawValue: raw, converted: false }
    }
    case 'number': {
      if (typeof raw === 'number') {
        return { value: raw, rawValue: raw, converted: true }
      }
      const str = String(raw).trim().replace(/[₹,$]/g, '').replace(/,/g, '')
      const num = parseFloat(str)
      if (!isNaN(num)) {
        return { value: num, rawValue: raw, converted: true }
      }
      return { value: '', rawValue: raw, converted: false }
    }
    case 'mobile': {
      // Strip non-digits, keep as string
      const str = String(raw).replace(/\D/g, '')
      return { value: str, rawValue: raw, converted: str !== String(raw).trim() }
    }
    case 'email': {
      return { value: String(raw).trim().toLowerCase(), rawValue: raw, converted: true }
    }
    default: {
      // String — trim and normalize whitespace
      return { value: String(raw).trim(), rawValue: raw, converted: true }
    }
  }
}

/**
 * Validate a single field value AFTER conversion.
 * Returns a ValidationIssue or null if valid.
 * Distinguishes between "not_mapped", "empty", "invalid_value", "conversion_failed".
 */
function validateFieldAfterConversion(
  field: FieldAlias,
  convertedValue: unknown,
  rawValue: unknown,
  isMapped: boolean,
  excelColumn: string | undefined,
  rowNumber: number,
): ValidationIssue | null {
  const val = String(convertedValue ?? '').trim()

  // Case 1: Required field but column not mapped
  if (field.required && !isMapped) {
    return {
      row: rowNumber,
      field: field.field,
      message: `Column not mapped for required field "${field.label}"`,
      value: '',
      category: 'not_mapped',
      excelColumn,
      rawValue,
      convertedValue,
    }
  }

  // Case 2: Required field is empty (column mapped but cell empty)
  if (field.required && !val) {
    // Check if raw value existed but conversion failed
    if (rawValue !== null && rawValue !== undefined && String(rawValue).trim() !== '') {
      return {
        row: rowNumber,
        field: field.field,
        message: `Conversion failed for "${field.label}": could not convert "${String(rawValue)}" to ${field.type || 'string'}`,
        value: rawValue,
        category: 'conversion_failed',
        excelColumn,
        rawValue,
        convertedValue,
      }
    }
    return {
      row: rowNumber,
      field: field.field,
      message: `Cell is empty for required field "${field.label}"`,
      value: '',
      category: 'empty',
      excelColumn,
      rawValue,
      convertedValue,
    }
  }

  // Non-required empty values are fine
  if (!val) return null

  // Case 3: Invalid value (type-specific validation)
  switch (field.type) {
    case 'mobile': {
      const digits = val.replace(/\D/g, '')
      if (digits.length < 10 || digits.length > 12) {
        return {
          row: rowNumber,
          field: field.field,
          message: `Invalid value for "${field.label}": "${val}" is not a valid mobile number (10-12 digits required)`,
          value: val,
          category: 'invalid_value',
          excelColumn,
          rawValue,
          convertedValue,
        }
      }
      return null
    }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        return {
          row: rowNumber,
          field: field.field,
          message: `Invalid value for "${field.label}": "${val}" is not a valid email address`,
          value: val,
          category: 'invalid_value',
          excelColumn,
          rawValue,
          convertedValue,
        }
      }
      return null
    }
    case 'date': {
      const d = new Date(val)
      if (isNaN(d.getTime())) {
        return {
          row: rowNumber,
          field: field.field,
          message: `Invalid value for "${field.label}": "${val}" is not a valid date`,
          value: val,
          category: 'invalid_value',
          excelColumn,
          rawValue,
          convertedValue,
        }
      }
      if (d.getFullYear() < 1900 || d.getFullYear() > 2100) {
        return {
          row: rowNumber,
          field: field.field,
          message: `Invalid value for "${field.label}": year ${d.getFullYear()} is out of range (1900-2100)`,
          value: val,
          category: 'invalid_value',
          excelColumn,
          rawValue,
          convertedValue,
        }
      }
      return null
    }
    case 'number': {
      if (isNaN(Number(val))) {
        return {
          row: rowNumber,
          field: field.field,
          message: `Invalid value for "${field.label}": "${val}" is not a number`,
          value: val,
          category: 'invalid_value',
          excelColumn,
          rawValue,
          convertedValue,
        }
      }
      return null
    }
    default:
      return null
  }
}

/**
 * Validate mapped rows.
 *
 * - Skips empty rows (counted in `emptyRowsSkipped`).
 * - Checks required fields and type rules.
 * - Detects duplicates within the file (by the first duplicate key).
 * - When `existingRecords` is supplied, valid rows whose duplicate-key value
 *   matches an existing record are moved into `duplicates` instead of `valid`.
 */
export function validateRows(
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
  config: ModuleImportConfig,
  existingRecords?: { mobile?: string; patientId?: string; employeeId?: string; email?: string }[],
): ValidationResult {
  const valid: Record<string, unknown>[] = []
  const invalid: ValidationResult['invalid'] = []
  const duplicates: Record<string, unknown>[] = []
  let emptyRowsSkipped = 0

  const duplicateKeys = config.duplicateKeys && config.duplicateKeys.length > 0
    ? config.duplicateKeys
    : ['mobile']

  // For within-file duplicate detection we track seen values per key.
  const seenInFile: Record<string, Set<string>> = {}
  for (const k of duplicateKeys) seenInFile[k] = new Set<string>()

  // Index existing records by duplicate key for O(1) lookup.
  const existingIndex: Record<string, Set<string>> = {}
  for (const k of duplicateKeys) existingIndex[k] = new Set<string>()
  if (existingRecords) {
    for (const rec of existingRecords) {
      for (const k of duplicateKeys) {
        const v = (rec as Record<string, unknown>)[k]
        if (typeof v === 'string' && v.trim()) {
          existingIndex[k].add(v.trim())
        }
      }
    }
  }

  // Build a quick lookup for fields by key.
  const fieldByKey = new Map<string, FieldAlias>()
  for (const f of config.fields) fieldByKey.set(f.field, f)

  // The first data row is row 2 (row 1 is the header).
  rows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2

    // ── PIPELINE STEP 1: Extract raw values using mapping ──
    // For each field, find the Excel column that maps to it and get the raw cell value.
    const rawExtracted: Record<string, { value: unknown; excelColumn: string | undefined; isMapped: boolean }> = {}
    for (const field of config.fields) {
      // Find which Excel header maps to this field
      let excelColumn: string | undefined
      let isMapped = false
      for (const [excelHeader, fieldKey] of Object.entries(mapping)) {
        if (fieldKey === field.field) {
          excelColumn = excelHeader
          isMapped = true
          break
        }
      }
      rawExtracted[field.field] = {
        value: isMapped ? (rawRow[excelColumn!] ?? '') : '',
        excelColumn,
        isMapped,
      }
    }

    // ── PIPELINE STEP 2: Check if row is entirely empty ──
    const allEmpty = Object.values(rawExtracted).every(
      (r) => r.value === '' || r.value === null || r.value === undefined || String(r.value).trim() === ''
    )
    if (allEmpty) {
      emptyRowsSkipped++
      return
    }

    // ── PIPELINE STEP 3: Convert data types (BEFORE validation) ──
    // Excel serial dates → ISO dates, numbers → JS numbers, mobile → digits-only, etc.
    const converted: Record<string, unknown> = {}
    for (const field of config.fields) {
      const raw = rawExtracted[field.field]
      const result = convertValue(field, raw.value)
      converted[field.field] = result.value
    }

    // ── PIPELINE STEP 4: Validate AFTER conversion ──
    // Distinguishes: not_mapped, empty, invalid_value, conversion_failed
    const issues: ValidationIssue[] = []
    for (const field of config.fields) {
      const raw = rawExtracted[field.field]
      const convertedVal = converted[field.field]
      const issue = validateFieldAfterConversion(
        field,
        convertedVal,
        raw.value,
        raw.isMapped,
        raw.excelColumn,
        rowNumber,
      )
      if (issue) {
        issues.push(issue)
      }
    }

    if (issues.length > 0) {
      invalid.push({ row: rowNumber, issues, data: converted })
      return
    }

    // Within-file duplicate detection.
    let isDupInFile = false
    for (const k of duplicateKeys) {
      const v = String(converted[k] ?? '').trim()
      if (v && seenInFile[k].has(v)) {
        isDupInFile = true
        issues.push({
          row: rowNumber,
          field: k,
          message: `Duplicate ${k} within file: "${v}" already appears in a previous row`,
          value: v,
          category: 'duplicate' as const,
        })
      } else if (v) {
        seenInFile[k].add(v)
      }
    }
    if (isDupInFile) {
      invalid.push({ row: rowNumber, issues, data: converted })
      return
    }

    // Existing-record duplicate detection.
    let isDupExisting = false
    for (const k of duplicateKeys) {
      const v = String(converted[k] ?? '').trim()
      if (v && existingIndex[k].has(v)) {
        isDupExisting = true
        break
      }
    }
    if (isDupExisting) {
      duplicates.push(converted)
    } else {
      valid.push(converted)
    }
  })

  return { valid, invalid, duplicates, emptyRowsSkipped }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. generateErrorReport (CSV)
// ─────────────────────────────────────────────────────────────────────────────

/** Escape a value for CSV (quote if it contains comma, quote, or newline). */
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Build a CSV error report from invalid rows.
 *
 * Columns: Row, Field, Error, Value
 * One line per issue (a row with 3 issues produces 3 lines).
 */
export function generateErrorReport(
  invalid: { row: number; issues: ValidationIssue[]; data: Record<string, unknown> }[],
): string {
  const header = ['Row', 'Field', 'Error Category', 'Error Message', 'Excel Column', 'Raw Value', 'Converted Value'].join(',')
  const lines = [header]
  for (const entry of invalid) {
    for (const issue of entry.issues) {
      lines.push(
        [
          issue.row,
          issue.field,
          issue.category || '',
          issue.message,
          issue.excelColumn || '',
          issue.rawValue ?? '',
          issue.convertedValue ?? '',
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  }
  // Prepend BOM so Excel reads UTF-8 correctly.
  return '\ufeff' + lines.join('\r\n')
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Default module configurations
// ─────────────────────────────────────────────────────────────────────────────
//
// Re-exported from import-configs.ts which is the single source of truth that
// admins can extend without touching the engine. The type-only import below
// does not create a runtime circular dependency.
// ─────────────────────────────────────────────────────────────────────────────

export { IMPORT_CONFIGS as MODULE_CONFIGS } from './import-configs'
