'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import { format, differenceInYears, differenceInMonths, differenceInDays } from 'date-fns'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  GraduationCap,
  Calendar,
  User,
  Heart,
  Activity,
  Clock,
  Stethoscope,
  Package,
  IndianRupee,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  UserRound,
  Building2,
  Share2,
  Pencil,
  Loader2,
  Printer,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { buildDocumentHTML, deliverDocument } from '@/components/print/DocumentLayout'
import { usePrintSettings } from '@/components/print/PrintSettingsDialog'
import { PaymentsBreakdownCard, type BillingBreakdown } from './PaymentsBreakdownCard'
import { buildPatientHistoryReportHTML, type PatientHistoryReportData } from '@/components/print/patient-history-report'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAppStore, canViewPatientContact, resolveAppointmentTypeLabel } from '@/store/app-store'
import { authFetch } from '@/lib/api-client'
import { useToast } from '@/hooks/use-toast'
import { AppointmentHistorySection } from '@/components/modules/patient-history/AppointmentHistorySection'

// Escape user-provided text interpolated into the print HTML — prevents stray
// angle brackets / quotes in patient names, titles, etc. from breaking the
// print document.
const escapeHTMLForPrint = (value: unknown) => {
  if (value == null) return ''
  const str = String(value)
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Types
interface PatientProfileData {
  billingBreakdown?: BillingBreakdown
  patient: {
    id: string
    patientId: string
    childName: string
    gender: string
    dateOfBirth: string
    fatherName: string | null
    motherName: string | null
    parentName: string | null
    mobile: string
    alternateNumber: string | null
    email: string | null
    address: string | null
    city: string | null
    state: string | null
    pincode: string | null
    schoolName: string | null
    class: string | null
    referredBy: string | null
    diagnosis: string | null
    medicalHistory: string | null
    birthHistory: string | null
    photo: string | null
    aadhaar: string | null
    status: string
    createdAt: string
    registrationDate: string
  }
  packages: Array<{
    id: string
    packageId: string
    sessionsPurchased: number
    sessionsCompleted: number
    sessionsExpired: number
    totalAmount: number
    discountAmount: number
    netAmount: number
    startDate: string
    endDate: string
    status: string
    package: { name: string; therapyType: string }
  }>
  appointments: Array<{
    id: string
    date: string
    startTime: string
    endTime: string
    status: string
    title: string
    type: string | null
    notes: string | null
    therapistId: string | null
  }>
  sessions: Array<{
    id: string
    date: string
    therapistName: string | null
    therapyType: string | null
    status: string
    subjective: string | null
    objective: string | null
    assessment: string | null
    plan: string | null
    notes: string | null
    progressReport: string | null
  }>
  assessments: Array<{
    id: string
    type: string
    scheduledDate: string
    completedDate: string | null
    status: string
    therapistName: string | null
    findings: string | null
    recommendations: string | null
  }>
  payments: Array<{
    id: string
    paymentNo: string
    amount: number
    paymentMode: string
    date: string
    type: string
    status: string
  }>
  invoices: Array<{
    id: string
    invoiceNo: string
    totalAmount: number
    status: string
    date: string
  }>
  summary: {
    totalPackageAmount: number
    totalDiscount: number
    totalSessionsCompleted: number
    totalSessionsPurchased: number
    sessionsRemaining: number
    totalAmountPaid: number
    pendingAmount: number
    nextAppointment: {
      id: string
      date: string
      startTime: string
      endTime: string
      status: string
      title: string
    } | null
    lastAppointment: {
      id: string
      date: string
      startTime: string
      endTime: string
      status: string
      title: string
    } | null
  }
}

// Helper functions
function calculateAge(dateOfBirth: string): string {
  if (!dateOfBirth) return ''
  try {
    const dob = new Date(dateOfBirth)
    const now = new Date()
    const years = differenceInYears(now, dob)
    const months = differenceInMonths(now, dob)
    const days = differenceInDays(now, dob)

    if (years > 0) return `${years}y ${months % 12}m`
    if (months > 0) return `${months}m ${days % 30}d`
    return `${days}d`
  } catch {
    return ''
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function getGenderIcon(gender: string) {
  return gender === 'Male' ? '👦' : gender === 'Female' ? '👧' : '🧒'
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          Active
        </Badge>
      )
    case 'inactive':
      return <Badge variant="secondary">Inactive</Badge>
    case 'discharged':
      return <Badge variant="outline">Discharged</Badge>
    case 'scheduled':
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
          Scheduled
        </Badge>
      )
    case 'confirmed':
      return <Badge variant="default">Confirmed</Badge>
    case 'completed':
      return (
        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          Completed
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge variant="default" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
          Cancelled
        </Badge>
      )
    case 'in_progress':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          In Progress
        </Badge>
      )
    case 'planned':
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Planned
        </Badge>
      )
    case 'paid':
      return (
        <Badge variant="default" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
          Paid
        </Badge>
      )
    case 'partially_paid':
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
          Partially Paid
        </Badge>
      )
    case 'pending':
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-300">
          Pending
        </Badge>
      )
    case 'expired':
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          Expired
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string | null | undefined; icon?: React.ElementType }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <span className="text-muted-foreground">{label}: </span>
        <span className="font-medium">{value}</span>
      </div>
    </div>
  )
}

// Main Component
export default function PatientProfile() {
  const { navigate, currentPatientId, user } = useAppStore()
  const canSeeMobile = canViewPatientContact(user?.role)
  const { toast } = useToast()

  const { printWithSettings, choosePrintMode, PrintSettingsDialog } = usePrintSettings()
  const [sharing, setSharing] = useState(false)
  const [data, setData] = useState<PatientProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  // Looked up once so the Recent Appointments "Type" column can resolve a
  // generic type (e.g. "therapy") to the assigned therapist's actual role.
  const [therapists, setTherapists] = useState<Array<{ name: string; role?: string | null }>>([])

  useEffect(() => {
    authFetch('/api/users')
      .then((res) => (res.ok ? res.json() : []))
      .then((json) => setTherapists(Array.isArray(json) ? json : []))
      .catch(() => setTherapists([]))
  }, [])

  useEffect(() => {
    if (!currentPatientId) return
    async function fetchProfile() {
      setLoading(true)
      try {
        const res = await authFetch(`/api/patients/${currentPatientId}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        } else {
          toast({
            title: 'Error',
            description: 'Failed to load patient profile.',
            variant: 'destructive',
          })
        }
      } catch (err) {
        console.error('Failed to fetch patient profile:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchProfile()
  }, [currentPatientId, toast])

  if (loading) {
    return <ProfileSkeleton />
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Patient Not Found</h2>
        <p className="text-muted-foreground text-sm">Please select a valid patient.</p>
        <Button variant="outline" onClick={() => navigate('patients')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Back to Patients
        </Button>
      </div>
    )
  }

  const { patient, packages, appointments, summary } = data
  const activePackage = packages.find((p) => p.status === 'active')
  const sessionProgress =
    summary.totalSessionsPurchased > 0
      ? Math.round((summary.totalSessionsCompleted / summary.totalSessionsPurchased) * 100)
      : 0

  const handleWhatsApp = () => {
    if (!patient.mobile) return
    const phone = patient.mobile.replace(/\D/g, '')
    window.open(`https://wa.me/${phone}`, '_blank')
  }

  // Share = send this patient's history report (PDF) to the parent. It used
  // to share the page URL, which is useless outside the app (hash route, no
  // patient id, needs a login) and on a desktop silently just copied it.
  // Opens the print dialog already on "WhatsApp link"; Save PDF / share
  // sheet / print are one tap away in the same dialog.
  const handleShareReport = async () => {
    if (!data) return
    const choice = await choosePrintMode({ output: 'link' })
    if (!choice) return
    setSharing(true)
    try {
      const html = buildPatientHistoryReportHTML(
        {
          patient: data.patient as unknown as PatientHistoryReportData['patient'],
          summary: data.summary as unknown as PatientHistoryReportData['summary'],
          packages: (data.packages || []) as unknown as PatientHistoryReportData['packages'],
          appointments: (data.appointments || []) as unknown as PatientHistoryReportData['appointments'],
          sessions: ((data as unknown as { sessions?: unknown[] }).sessions || []) as PatientHistoryReportData['sessions'],
          payments: ((data as unknown as { payments?: unknown[] }).payments || []) as PatientHistoryReportData['payments'],
          therapists,
        },
        canSeeMobile,
        choice.branding,
        choice.mode,
      )
      await deliverDocument(html, choice.output, {
        fileName: `Patient History - ${patient.childName}`,
        shareTitle: 'Patient History Report',
        shareText: `Patient history report for ${patient.childName}`,
        patientId: patient.id,
        patientPhone: patient.mobile || undefined,
      })
    } finally {
      setSharing(false)
    }
  }

  // Print the patient's info + appointment history, branded per the chosen
  // print mode (header & footer / letterhead / plain).
  const handlePrintAppointments = () => printWithSettings((mode, branding, output) => {
    const parentName = patient.fatherName || patient.motherName || patient.parentName || '-'

    const patientInfoHTML = `
      <table style="margin-bottom: 12px;">
        <tbody>
          <tr>
            <td style="width:33%;"><strong>Patient ID:</strong> ${escapeHTMLForPrint(patient.patientId)}</td>
            <td style="width:34%;"><strong>Name:</strong> ${escapeHTMLForPrint(patient.childName)}</td>
            <td style="width:33%;"><strong>Parent:</strong> ${escapeHTMLForPrint(parentName)}</td>
          </tr>
          <tr>
            <td colspan="2"><strong>Mobile:</strong> ${escapeHTMLForPrint(canSeeMobile ? (patient.mobile || '-') : '—')}</td>
            <td><strong>Status:</strong> ${escapeHTMLForPrint(patient.status || '-')}</td>
          </tr>
        </tbody>
      </table>`.trim()

    const rows = appointments.length > 0
      ? appointments.map((apt, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${escapeHTMLForPrint(format(new Date(apt.date), 'dd MMM yyyy'))}</td>
          <td>${escapeHTMLForPrint(apt.title || '-')}</td>
          <td style="white-space:nowrap;">${escapeHTMLForPrint(apt.startTime || '-')} - ${escapeHTMLForPrint(apt.endTime || '-')}</td>
          <td>${escapeHTMLForPrint(resolveAppointmentTypeLabel(apt.type, apt.therapistId, therapists) || '-')}</td>
          <td>${escapeHTMLForPrint(apt.status || '-')}</td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="text-align:center; padding:12px;">No appointments on record</td></tr>'

    const apptTableHTML = `
      <table>
        <thead>
          <tr>
            <th style="width:5%;">#</th>
            <th style="width:15%;">Date</th>
            <th style="width:30%;">Title</th>
            <th style="width:18%;">Time</th>
            <th style="width:14%;">Type</th>
            <th style="width:18%;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`.trim()

    const html = buildDocumentHTML({
      title: 'Patient Appointments',
      subtitle: `${patient.childName} (${patient.patientId})`,
      bodyHTML: `${patientInfoHTML}${apptTableHTML}`,
      footerNote: branding.centerName || undefined,
      autoPrint: false,
      windowTitle: `Patient Appointments - ${patient.childName}`,
      mode,
      branding,
    })

    deliverDocument(html, output, {
      fileName: `Appointments - ${patient.childName}`,
      shareTitle: 'Patient Appointments',
      shareText: `Appointment history for ${patient.childName}`,
      patientId: patient.id,
      patientPhone: patient.mobile || undefined,
    })
  })

  return (
    <div className="space-y-6">
      {PrintSettingsDialog}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('patients')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{patient.childName}</h1>
            <p className="text-sm text-muted-foreground">
              {patient.patientId} &middot; Registered {format(new Date(patient.registrationDate || patient.createdAt), 'dd MMM yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleShareReport}
            disabled={sharing}
          >
            <Share2 className="h-4 w-4 mr-1.5" />
            {sharing ? 'Preparing…' : 'Share'}
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('patient-form')}
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        </div>
      </div>

      {/* Patient Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-6">
            {/* Avatar + status — left rail on desktop, centered on mobile */}
            <div className="flex flex-row sm:flex-col items-center gap-3 shrink-0">
              {patient.photo ? (
                <Image
                  src={patient.photo}
                  alt={patient.childName}
                  width={80}
                  height={80}
                  className="h-20 w-20 rounded-2xl object-cover border"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
                  {getGenderIcon(patient.gender)}
                </div>
              )}
              {getStatusBadge(patient.status)}
            </div>

            <Separator orientation="vertical" className="hidden sm:block h-auto self-stretch" />

            {/* Info Grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3">
              <InfoRow label="Patient ID" value={patient.patientId} icon={UserRound} />
              <InfoRow label="Child Name" value={patient.childName} icon={User} />
              <InfoRow label="Gender" value={patient.gender} icon={Heart} />
              <div className="flex items-start gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <span className="text-muted-foreground">DOB: </span>
                  <span className="font-medium">{format(new Date(patient.dateOfBirth), 'dd MMM yyyy')}</span>
                  <span className="ml-2 text-primary font-semibold">
                    ({calculateAge(patient.dateOfBirth)})
                  </span>
                </div>
              </div>
              <InfoRow label="Father" value={patient.fatherName} icon={User} />
              <InfoRow label="Mother" value={patient.motherName} icon={User} />
              <InfoRow label="Mobile" value={canSeeMobile ? patient.mobile : '—'} icon={Phone} />
              {canSeeMobile && patient.alternateNumber && (
                <InfoRow label="Alternate" value={patient.alternateNumber} icon={Phone} />
              )}
              <InfoRow label="Email" value={patient.email} icon={Mail} />
              <InfoRow
                label="Address"
                value={
                  [patient.address, patient.city, patient.state, patient.pincode]
                    .filter(Boolean)
                    .join(', ') || null
                }
                icon={MapPin}
              />
              <InfoRow label="School" value={patient.schoolName} icon={GraduationCap} />
              <InfoRow label="Class" value={patient.class} icon={GraduationCap} />
              <InfoRow label="Referred By" value={patient.referredBy} icon={Share2} />
            </div>
          </div>

          {/* Diagnosis Badge */}
          {patient.diagnosis && (
            <>
              <Separator className="my-4" />
              <div className="flex items-start gap-2">
                <Stethoscope className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <span className="text-sm text-muted-foreground">Diagnosis: </span>
                  <span className="text-sm font-medium">{patient.diagnosis}</span>
                </div>
              </div>
            </>
          )}

          {/* Medical & Birth History (Collapsible) */}
          {(patient.medicalHistory || patient.birthHistory) && (
            <>
              <Separator className="my-4" />
              <Accordion type="multiple" className="w-full">
                {patient.medicalHistory && (
                  <AccordionItem value="medical-history">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-primary" />
                        Medical History
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm leading-relaxed bg-muted/40 rounded-md p-3 whitespace-pre-wrap">
                        {patient.medicalHistory}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                )}
                {patient.birthHistory && (
                  <AccordionItem value="birth-history">
                    <AccordionTrigger className="text-sm font-medium py-2">
                      <div className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-primary" />
                        Birth History
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm leading-relaxed bg-muted/40 rounded-md p-3 whitespace-pre-wrap">
                        {patient.birthHistory}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards: Package, Sessions, Payments */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {/* Active Package */}
        <Card className="p-4 gap-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Active Package</p>
              <p className="text-lg font-bold mt-1">
                {activePackage ? activePackage.package.name : 'No Active Package'}
              </p>
              {activePackage && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    {activePackage.package.therapyType}
                  </Badge>
                  {getStatusBadge(activePackage.status)}
                </div>
              )}
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500">
              <Package className="h-5 w-5 text-white" />
            </div>
          </div>
          {activePackage && (
            <div className="space-y-1.5 text-sm border-t pt-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-medium">{formatCurrency(activePackage.netAmount)}</span>
              </div>
              {activePackage.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    -{formatCurrency(activePackage.discountAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Validity</span>
                <span className="font-medium text-xs">
                  {format(new Date(activePackage.startDate), 'dd MMM yyyy')} - {format(new Date(activePackage.endDate), 'dd MMM yyyy')}
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Package Progress */}
        <Card className="p-4 gap-0">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground font-medium">Package Progress</p>
              <p className="text-lg font-bold mt-1">
                {summary.totalSessionsCompleted} / {summary.totalSessionsPurchased}
              </p>
            </div>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500">
              <Activity className="h-5 w-5 text-white" />
            </div>
          </div>
          <div className="space-y-1.5 text-sm border-t pt-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchased</span>
              <span className="font-medium">{summary.totalSessionsPurchased}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed</span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">{summary.totalSessionsCompleted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-medium">{summary.sessionsRemaining}</span>
            </div>
            <div className="mt-2">
              <Progress value={sessionProgress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1 text-right">{sessionProgress}% completed</p>
            </div>
          </div>
        </Card>

        {/* Payment Status — full package payment breakdown, all figures
            sourced from the backend (summary.totalPackageAmount is already
            net-of-discount; packagePrice is derived as netAmount + discount
            purely for display, matching what the discount was taken off). */}
        {(() => {
          const finalPackageAmount = summary.totalPackageAmount
          const discount = summary.totalDiscount
          const packagePrice = finalPackageAmount + discount
          const totalPaid = summary.totalAmountPaid
          // Deliberately `summary.pendingAmount` (invoice-based, computed
          // server-side) rather than `finalPackageAmount - totalPaid` here —
          // a patient billed via a standalone/service-type invoice (no
          // PatientPackage at all) has finalPackageAmount = 0, so that
          // subtraction would wrongly read "Fully Paid" despite a real
          // outstanding balance. The two agree exactly whenever the patient's
          // invoice is properly package-linked (the common case), and only
          // this one stays correct when it isn't.
          const pending = summary.pendingAmount
          // A patient with no package and no invoice owes nothing because
          // nothing was ever billed — that is "Not Enrolled", not "Fully Paid"
          // (same rule as getPaymentStatus in lib/payment-status).
          const isNotEnrolled = packages.length === 0 &&
            !(data.invoices ?? []).some((inv) => inv.status !== 'cancelled') &&
            totalPaid <= 0
          const isFullyPaid = !isNotEnrolled && pending <= 0
          const isPartiallyPaid = !isNotEnrolled && !isFullyPaid && totalPaid > 0
          const statusLabel = isNotEnrolled ? 'Not Enrolled' : isFullyPaid ? 'Fully Paid' : isPartiallyPaid ? 'Partially Paid' : 'Pending'
          const statusBadgeClass = isNotEnrolled
            ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
            : isFullyPaid
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : isPartiallyPaid
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
          const iconBgClass = isNotEnrolled ? 'bg-gray-400' : isFullyPaid ? 'bg-emerald-500' : isPartiallyPaid ? 'bg-orange-500' : 'bg-red-500'

          return (
            <Card className="p-4 gap-0">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Payment Status</p>
                  <p className="text-lg font-bold mt-1">{formatCurrency(finalPackageAmount)}</p>
                  <Badge className={`mt-1.5 ${statusBadgeClass}`}>{statusLabel}</Badge>
                </div>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBgClass}`}>
                  <IndianRupee className="h-5 w-5 text-white" />
                </div>
              </div>

              <div className="space-y-1.5 text-sm border-t pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package Price</span>
                  <span className="font-semibold text-right">{formatCurrency(packagePrice)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-semibold text-right">{formatCurrency(discount)}</span>
                </div>
                <div className="flex justify-between border-t pt-1.5">
                  <span className="text-muted-foreground">Final Package Amount</span>
                  <span className="font-semibold text-right">{formatCurrency(finalPackageAmount)}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-sm border-t mt-3 pt-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid</span>
                  <span className="font-semibold text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaid)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending Amount</span>
                  <span className={`font-semibold text-right ${pending > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {pending > 0 ? formatCurrency(pending) : isNotEnrolled ? '—' : 'Fully Paid'}
                  </span>
                </div>
              </div>

              {isNotEnrolled ? (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground bg-muted rounded-md px-2.5 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">No package assigned yet</span>
                </div>
              ) : pending > 0 ? (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-2.5 py-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">{formatCurrency(pending)} pending payment</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-md px-2.5 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-medium">Payment Completed</span>
                </div>
              )}
            </Card>
          )
        })()}
      </div>

      {/* Package-wise vs session-wise money, kept apart so a patient on a
          package who also pays for extra sessions is easy to read. */}
      <PaymentsBreakdownCard breakdown={data.billingBreakdown} />

      {/* Appointments Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              Appointments
            </CardTitle>
            <Button variant="outline" size="sm" onClick={handlePrintAppointments} className="gap-1.5" disabled={appointments.length === 0}>
              <Printer className="h-3.5 w-3.5" />Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {/* Next Appointment */}
            <div className={`rounded-lg border-2 p-4 ${summary.nextAppointment ? 'border-primary/40 bg-primary/5' : 'border-dashed border-muted-foreground/20'}`}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Next Appointment
              </p>
              {summary.nextAppointment ? (
                <div className="space-y-1">
                  <p className="font-semibold">{summary.nextAppointment.title}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{format(new Date(summary.nextAppointment.date), 'dd MMM yyyy')}</span>
                    <span>&middot;</span>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{summary.nextAppointment.startTime} - {summary.nextAppointment.endTime}</span>
                  </div>
                  {getStatusBadge(summary.nextAppointment.status)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming appointment</p>
              )}
            </div>

            {/* Last Appointment */}
            <div className={`rounded-lg border p-4 ${summary.lastAppointment ? 'bg-muted/30' : 'border-dashed border-muted-foreground/20'}`}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                Last Appointment
              </p>
              {summary.lastAppointment ? (
                <div className="space-y-1">
                  <p className="font-semibold">{summary.lastAppointment.title}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{format(new Date(summary.lastAppointment.date), 'dd MMM yyyy')}</span>
                    <span>&middot;</span>
                    <Clock className="h-3.5 w-3.5" />
                    <span>{summary.lastAppointment.startTime} - {summary.lastAppointment.endTime}</span>
                  </div>
                  {getStatusBadge(summary.lastAppointment.status)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No past appointments</p>
              )}
            </div>
          </div>

          {/* Appointment History — same Upcoming/Completed breakdown as
              Patient History Details, instead of a flat "Recent Appointments"
              list, so both screens show appointments the same way. */}
          {appointments.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium mb-2">Appointment History</p>
              <AppointmentHistorySection appointments={appointments} therapists={therapists} onWhatsApp={handleWhatsApp} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// Loading Skeleton
function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Card>
        <CardContent className="p-6">
          <div className="flex gap-6">
            <Skeleton className="h-20 w-20 rounded-2xl" />
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="p-4 gap-0">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-2 w-full mt-2" />
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            <Skeleton className="h-28 rounded-lg" />
            <Skeleton className="h-28 rounded-lg" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-96" />
      <div className="grid gap-4 grid-cols-1">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
