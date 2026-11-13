/**
 * IST (Indian Standard Time, UTC+5:30) timezone helpers.
 *
 * The server may run in UTC. All "today" / "this month" business logic
 * (dashboard KPIs, attendance, appointments) must be computed in IST so
 * the numbers match what the clinic sees on the wall clock.
 */

const IST_OFFSET_MS = 5 * 60 * 60 * 1000 + 30 * 60 * 1000 // +05:30

/** Convert any Date to an IST Date (same wall-clock moment, shifted label). */
export function toIST(date: Date = new Date()): Date {
  // new Date(date.getTime() + offset) keeps the moment; the .getUTC* getters
  // then return IST wall-clock components.
  return new Date(date.getTime() + IST_OFFSET_MS)
}

/** Return the IST "start of today" (00:00:00) as a UTC Date the DB can query. */
export function istStartOfToday(): Date {
  const ist = toIST()
  const utcStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
  return new Date(utcStart - IST_OFFSET_MS)
}

/** Return the IST "end of today" (23:59:59.999) as a UTC Date. */
export function istEndOfToday(): Date {
  const ist = toIST()
  const utcEnd = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 23, 59, 59, 999)
  return new Date(utcEnd - IST_OFFSET_MS)
}

/** Return the IST "start of this month" as a UTC Date. */
export function istStartOfMonth(): Date {
  const ist = toIST()
  const utcStart = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1)
  return new Date(utcStart - IST_OFFSET_MS)
}

/** Return the IST "start of this year" as a UTC Date. */
export function istStartOfYear(): Date {
  const ist = toIST()
  const utcStart = Date.UTC(ist.getUTCFullYear(), 0, 1)
  return new Date(utcStart - IST_OFFSET_MS)
}

/** Return the IST date N days ago as a UTC Date (start of that day). */
export function istDaysAgo(days: number): Date {
  const ist = toIST()
  const target = new Date(ist.getTime() - days * 24 * 60 * 60 * 1000)
  const utcStart = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  return new Date(utcStart - IST_OFFSET_MS)
}

/**
 * Return the IST "start of day" (00:00:00) for an arbitrary "yyyy-MM-dd"
 * date string, as a UTC Date the DB can query. Use this (not
 * `new Date(dateStr + 'T00:00:00.000Z')`) wherever a date-string query param
 * needs to become a day boundary — naive UTC parsing is off by IST's
 * +05:30 offset, so "today" in IST could be silently excluded/included
 * incorrectly for the first 5.5 hours after IST midnight.
 */
export function istStartOfDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcStart = Date.UTC(y, (m || 1) - 1, d || 1)
  return new Date(utcStart - IST_OFFSET_MS)
}

/** Return the IST "end of day" (23:59:59.999) for a "yyyy-MM-dd" date string, as a UTC Date. */
export function istEndOfDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcEnd = Date.UTC(y, (m || 1) - 1, d || 1, 23, 59, 59, 999)
  return new Date(utcEnd - IST_OFFSET_MS)
}

/** Current IST hour (0-23) — used for clinic-hours validation. */
export function istCurrentHour(): number {
  return toIST().getUTCHours()
}

/** Current IST minutes since midnight. */
export function istMinutesSinceMidnight(): number {
  const ist = toIST()
  return ist.getUTCHours() * 60 + ist.getUTCMinutes()
}

/** Format a Date as "dd-MM-yyyy" in IST. */
export function formatIST(date: Date = new Date()): string {
  const ist = toIST(date)
  const dd = String(ist.getUTCDate()).padStart(2, '0')
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = ist.getUTCFullYear()
  return `${dd}-${mm}-${yyyy}`
}
