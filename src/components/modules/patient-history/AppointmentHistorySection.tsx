'use client'

import React, { useState } from 'react'
import { format } from 'date-fns'
import { Calendar, CheckCircle2, ChevronRight, MessageCircle, MoreVertical } from 'lucide-react'
import { resolveAppointmentTypeLabel } from '@/store/app-store'
import { StarRating } from '@/components/modules/parent-portal/SessionReviewDialog'

// Shared "Upcoming Appointments" / "Completed Appointments" tables — used by
// both Patient History Details (its "Appointment History" tab) and Patient
// Profile (replacing its old flat "Recent Appointments" list), so both
// screens show the exact same appointment breakdown/format instead of two
// different, independently-maintained layouts.

export interface AppointmentHistoryItem {
  id: string
  date?: string
  startTime?: string
  endTime?: string
  status?: string
  title?: string
  type?: string | null
  therapistId?: string | null
  progressAchieved?: string | null
  sessionRemarks?: string | null
  parentRating?: number | null
  parentReview?: string | null
}

function formatDate(value?: string) {
  if (!value) return 'N/A'
  try { return format(new Date(value), 'dd MMM yyyy') } catch { return 'N/A' }
}

function formatDayName(value?: string) {
  if (!value) return ''
  try { return format(new Date(value), 'EEEE') } catch { return '' }
}

function statusStyle(status?: string) {
  if (!status) return { badge: 'bg-gray-100 text-gray-600' }
  const s = status.toLowerCase()
  if (s.includes('confirm') || s.includes('complet') || s.includes('paid') || s.includes('done'))
    return { badge: 'bg-green-100 text-green-700' }
  if (s.includes('pending') || s.includes('due'))
    return { badge: 'bg-amber-100 text-amber-700' }
  if (s.includes('cancel') || s.includes('no show'))
    return { badge: 'bg-red-100 text-red-700' }
  return { badge: 'bg-blue-100 text-blue-700' }
}

function AppointmentRow({ appt, onWhatsApp, therapists = [] }: {
  appt: AppointmentHistoryItem
  onWhatsApp?: () => void
  therapists?: Array<{ name: string; role?: string | null }>
}) {
  const st = statusStyle(appt.status)
  return (
    <tr className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
      <td className="px-4 py-3">
        <p className="font-medium text-gray-900 text-sm">{formatDate(appt.date)}</p>
        <p className="text-xs text-gray-400">{formatDayName(appt.date)}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{appt.startTime ? `${appt.startTime}${appt.endTime ? ' - ' + appt.endTime : ''}` : 'N/A'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="h-3 w-3 text-blue-600" />
          </div>
          <span className="text-sm text-blue-600 font-medium">{resolveAppointmentTypeLabel(appt.type, appt.therapistId, therapists) || appt.title || 'N/A'}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-800 font-medium">{appt.therapistId || 'N/A'}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-gray-700">{appt.progressAchieved || appt.sessionRemarks || '-'}</p>
      </td>
      <td className="px-4 py-3" title={appt.parentReview || undefined}>
        {appt.parentRating ? (
          <div className="space-y-0.5">
            <StarRating value={appt.parentRating} className="h-3.5 w-3.5" />
            {appt.parentReview && <p className="text-xs text-gray-500 max-w-[200px] truncate">{appt.parentReview}</p>}
          </div>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${st.badge}`}>
          {appt.status || 'N/A'}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={onWhatsApp}
            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-green-50 hover:border-green-300 transition-colors"
            title="Send WhatsApp"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-green-500">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.118 1.523 5.847L.057 23.49a.5.5 0 0 0 .625.596l5.763-1.514A11.942 11.942 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.9a9.894 9.894 0 0 1-5.045-1.381l-.362-.215-3.75.985.999-3.648-.236-.374A9.86 9.86 0 0 1 2.1 12C2.1 6.534 6.534 2.1 12 2.1S21.9 6.534 21.9 12 17.466 21.9 12 21.9z"/>
            </svg>
          </button>
          <button className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
            <MoreVertical className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function AppointmentTable({
  title,
  icon,
  iconColorClass,
  items,
  emptyLabel,
  showAll,
  onToggleShowAll,
  onWhatsApp,
  therapists,
}: {
  title: string
  icon: React.ReactNode
  iconColorClass: string
  items: AppointmentHistoryItem[]
  emptyLabel: string
  showAll: boolean
  onToggleShowAll: () => void
  onWhatsApp?: () => void
  therapists: Array<{ name: string; role?: string | null }>
}) {
  return (
    <div>
      <h3 className={`text-sm font-semibold uppercase tracking-wide flex items-center gap-2 mb-3 ${iconColorClass}`}>
        {icon} {title}
      </h3>
      <div className="rounded-xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Date', 'Time', 'Therapy Type', 'Therapist', 'Progress', 'Parent Review', 'Status', 'Action'].map((h) => (
                <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">{emptyLabel}</td></tr>
            ) : (
              (showAll ? items : items.slice(0, 5)).map((a) => (
                <AppointmentRow key={a.id} appt={a} onWhatsApp={onWhatsApp} therapists={therapists} />
              ))
            )}
          </tbody>
        </table>
        {items.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-50 flex items-center justify-between text-xs text-gray-400 bg-gray-50/50">
            <span>
              Showing 1 to {showAll ? items.length : Math.min(5, items.length)} of {items.length} {title.toLowerCase()}
            </span>
            {items.length > 5 && (
              <button
                onClick={onToggleShowAll}
                className="text-violet-600 font-medium hover:underline flex items-center gap-1"
              >
                {showAll ? 'Show Less' : `View All ${title}`} <ChevronRight className={`h-3 w-3 transition-transform ${showAll ? '-rotate-90' : ''}`} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function AppointmentHistorySection({
  appointments,
  therapists = [],
  onWhatsApp,
}: {
  appointments: AppointmentHistoryItem[]
  therapists?: Array<{ name: string; role?: string | null }>
  onWhatsApp?: () => void
}) {
  const [showAllUpcoming, setShowAllUpcoming] = useState(false)
  const [showAllCompleted, setShowAllCompleted] = useState(false)

  const upcomingAppts = appointments.filter(
    (a) => !a.status?.toLowerCase().includes('complet') && !a.status?.toLowerCase().includes('cancel')
  )
  const completedAppts = appointments.filter((a) => a.status?.toLowerCase().includes('complet'))

  return (
    <div className="space-y-6">
      <AppointmentTable
        title="Upcoming Appointments"
        icon={<Calendar className="h-4 w-4" />}
        iconColorClass="text-teal-600"
        items={upcomingAppts}
        emptyLabel="No upcoming appointments"
        showAll={showAllUpcoming}
        onToggleShowAll={() => setShowAllUpcoming((v) => !v)}
        onWhatsApp={onWhatsApp}
        therapists={therapists}
      />
      <AppointmentTable
        title="Completed Appointments"
        icon={<CheckCircle2 className="h-4 w-4" />}
        iconColorClass="text-green-600"
        items={completedAppts}
        emptyLabel="No completed appointments"
        showAll={showAllCompleted}
        onToggleShowAll={() => setShowAllCompleted((v) => !v)}
        onWhatsApp={onWhatsApp}
        therapists={therapists}
      />
    </div>
  )
}
