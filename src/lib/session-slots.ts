/**
 * Therapy Session Slot Configuration
 *
 * Clinic working hours: 10:00 AM – 9:45 PM
 * Every session is exactly 45 minutes.
 * Lunch break: 1:00 PM – 1:30 PM (blocked, not bookable).
 */

export interface SessionSlot {
  start: string // "10:00"
  end: string // "10:45"
  startLabel: string // "10:00 AM"
  endLabel: string // "10:45 AM"
  isLunch: boolean
}

/**
 * All fixed 45-minute session slots for a day.
 * Lunch break (1:00 PM – 1:30 PM) is included as a blocked slot.
 */
export const SESSION_SLOTS: SessionSlot[] = [
  { start: '10:00', end: '10:45', startLabel: '10:00 AM', endLabel: '10:45 AM', isLunch: false },
  { start: '10:45', end: '11:30', startLabel: '10:45 AM', endLabel: '11:30 AM', isLunch: false },
  { start: '11:30', end: '12:15', startLabel: '11:30 AM', endLabel: '12:15 PM', isLunch: false },
  { start: '12:15', end: '13:00', startLabel: '12:15 PM', endLabel: '1:00 PM', isLunch: false },
  { start: '13:00', end: '13:30', startLabel: '1:00 PM', endLabel: '1:30 PM', isLunch: true },
  { start: '13:30', end: '14:15', startLabel: '1:30 PM', endLabel: '2:15 PM', isLunch: false },
  { start: '14:15', end: '15:00', startLabel: '2:15 PM', endLabel: '3:00 PM', isLunch: false },
  { start: '15:00', end: '15:45', startLabel: '3:00 PM', endLabel: '3:45 PM', isLunch: false },
  { start: '15:45', end: '16:30', startLabel: '3:45 PM', endLabel: '4:30 PM', isLunch: false },
  { start: '16:30', end: '17:15', startLabel: '4:30 PM', endLabel: '5:15 PM', isLunch: false },
  { start: '17:15', end: '18:00', startLabel: '5:15 PM', endLabel: '6:00 PM', isLunch: false },
  { start: '18:00', end: '18:45', startLabel: '6:00 PM', endLabel: '6:45 PM', isLunch: false },
  { start: '18:45', end: '19:30', startLabel: '6:45 PM', endLabel: '7:30 PM', isLunch: false },
  { start: '19:30', end: '20:15', startLabel: '7:30 PM', endLabel: '8:15 PM', isLunch: false },
  { start: '20:15', end: '21:00', startLabel: '8:15 PM', endLabel: '9:00 PM', isLunch: false },
  { start: '21:00', end: '21:45', startLabel: '9:00 PM', endLabel: '9:45 PM', isLunch: false },
]

export const CLINIC_OPEN = '10:00'
export const CLINIC_CLOSE = '21:45'
export const LUNCH_START = '13:00'
export const LUNCH_END = '13:30'
export const SESSION_DURATION_MINUTES = 45

// ── Session status colors ──────────────────────────────────────────────

export const SESSION_STATUS_COLORS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  scheduled:    { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-300',    label: 'Scheduled' },
  in_progress:  { bg: 'bg-orange-50',  text: 'text-orange-700',  border: 'border-orange-300',  label: 'In Progress' },
  completed:    { bg: 'bg-green-50',   text: 'text-green-700',   border: 'border-green-300',   label: 'Completed' },
  cancelled:    { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-300',     label: 'Cancelled' },
  no_show:      { bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-300',     label: 'No Show' },
  rescheduled:  { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-300',  label: 'Rescheduled' },
  lunch:        { bg: 'bg-gray-100',   text: 'text-gray-500',    border: 'border-gray-200',    label: 'Lunch Break' },
}

// ── Validation helpers ─────────────────────────────────────────────────

/** Check if a time slot falls during the lunch break */
export function isLunchBreak(startTime: string): boolean {
  return startTime === LUNCH_START
}

/** Check if a time is outside clinic working hours */
export function isOutsideClinicHours(startTime: string): boolean {
  return startTime < CLINIC_OPEN || startTime >= CLINIC_CLOSE
}

/** Check if a therapist is already booked for the given time slot */
export function isTherapistDoubleBooked(
  therapistId: string,
  date: string,
  startTime: string,
  existingSessions: { therapistName: string; date: string; startTime: string; status: string }[]
): boolean {
  return existingSessions.some(
    s => s.therapistName === therapistId &&
         s.date.startsWith(date) &&
         s.startTime === startTime &&
         s.status !== 'cancelled' &&
         s.status !== 'no_show'
  )
}

/** Check if a room is already booked for the given time slot */
export function isRoomDoubleBooked(
  roomId: string | null,
  date: string,
  startTime: string,
  existingSessions: { roomId?: string | null; date: string; startTime: string; status: string }[]
): boolean {
  if (!roomId) return false
  return existingSessions.some(
    s => s.roomId === roomId &&
         s.date.startsWith(date) &&
         s.startTime === startTime &&
         s.status !== 'cancelled' &&
         s.status !== 'no_show'
  )
}

/** Check if the therapist is on leave on the given date */
export function isTherapistOnLeave(
  therapistName: string,
  date: string,
  leaves: { employeeName: string; startDate: string; endDate: string; status: string }[]
): boolean {
  const checkDate = new Date(date).toISOString().split('T')[0]
  return leaves.some(
    l => l.employeeName === therapistName &&
         l.status === 'approved' &&
         checkDate >= l.startDate.split('T')[0] &&
         checkDate <= l.endDate.split('T')[0]
  )
}

/**
 * Validate a session booking and return an error message if invalid.
 * Returns null if the booking is valid.
 */
export function validateSessionBooking(opts: {
  startTime: string
  therapistName: string
  roomId?: string | null
  date: string
  existingSessions: { therapistName: string; roomId?: string | null; date: string; startTime: string; status: string }[]
  leaves: { employeeName: string; startDate: string; endDate: string; status: string }[]
}): string | null {
  const { startTime, therapistName, roomId, date, existingSessions, leaves } = opts

  if (isLunchBreak(startTime)) {
    return 'Cannot book a session during lunch break (1:00 PM – 1:30 PM).'
  }

  if (isOutsideClinicHours(startTime)) {
    return 'Cannot book a session outside clinic working hours (10:00 AM – 9:45 PM).'
  }

  if (isTherapistOnLeave(therapistName, date, leaves)) {
    return `${therapistName} is on approved leave on this date.`
  }

  if (isTherapistDoubleBooked(therapistName, date, startTime, existingSessions)) {
    return `${therapistName} is already booked for this time slot. Double booking is not allowed.`
  }

  if (roomId && isRoomDoubleBooked(roomId, date, startTime, existingSessions)) {
    return `Room is already booked for this time slot. Please select a different room.`
  }

  return null
}

/**
 * Get the current time slot index based on the current time.
 * Returns -1 if current time is outside clinic hours.
 */
export function getCurrentSlotIndex(currentTime: string): number {
  for (let i = 0; i < SESSION_SLOTS.length; i++) {
    const slot = SESSION_SLOTS[i]
    if (currentTime >= slot.start && currentTime < slot.end) {
      return i
    }
  }
  return -1
}

/**
 * Calculate therapist utilization percentage.
 */
export function calculateUtilization(
  therapistName: string,
  sessions: { therapistName: string; status: string; date: string }[],
  date: string
): { booked: number; total: number; percent: number } {
  const therapistSessions = sessions.filter(
    s => s.therapistName === therapistName &&
         s.date.startsWith(date) &&
         s.status !== 'cancelled' &&
         s.status !== 'no_show'
  )
  const totalSlots = SESSION_SLOTS.filter(s => !s.isLunch).length
  const booked = therapistSessions.length
  const percent = totalSlots > 0 ? Math.round((booked / totalSlots) * 100) : 0
  return { booked, total: totalSlots, percent }
}
