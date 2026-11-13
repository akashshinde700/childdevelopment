/**
 * Seed SystemConfig — all hardcoded dropdown / status / category values
 * used across the ERP modules, surfaced as a single dynamic, admin-managed
 * configuration table.
 *
 * Run with: `bun run prisma/seed-config.ts`
 */
import { db } from '@/lib/db'

interface ConfigSeed {
  category: string
  key: string
  label: string
  color?: string
  sortOrder: number
  isActive?: boolean
  metadata?: string
}

const configItems: ConfigSeed[] = [
  // ───────────────────── roles (9) ─────────────────────
  { category: 'roles', key: 'super_admin', label: 'Super Admin', color: '#dc2626', sortOrder: 1 },
  { category: 'roles', key: 'admin', label: 'Admin', color: '#2563eb', sortOrder: 2 },
  { category: 'roles', key: 'receptionist', label: 'Receptionist', color: '#0d9488', sortOrder: 3 },
  { category: 'roles', key: 'therapist_speech', label: 'Speech Therapist', color: '#0d9488', sortOrder: 4 },
  { category: 'roles', key: 'therapist_ot', label: 'Occupational Therapist', color: '#9333ea', sortOrder: 5 },
  { category: 'roles', key: 'therapist_behavioral', label: 'Behavioral Therapist', color: '#ea580c', sortOrder: 6 },
  { category: 'roles', key: 'therapist_remedial', label: 'Remedial Therapist', color: '#ca8a04', sortOrder: 7 },
  { category: 'roles', key: 'psychologist', label: 'Clinical Psychologist', color: '#4f46e5', sortOrder: 8 },
  { category: 'roles', key: 'parent', label: 'Parent', color: '#16a34a', sortOrder: 9 },

  // ───────────────────── therapy_types (6) ─────────────────────
  { category: 'therapy_types', key: 'speech_therapy', label: 'Speech Therapy', color: '#0d9488', sortOrder: 1 },
  { category: 'therapy_types', key: 'occupational_therapy', label: 'Occupational Therapy', color: '#ea580c', sortOrder: 2 },
  { category: 'therapy_types', key: 'behavioral_therapy', label: 'Behavioral Therapy', color: '#9333ea', sortOrder: 3 },
  { category: 'therapy_types', key: 'special_education', label: 'Special Education', color: '#2563eb', sortOrder: 4 },
  { category: 'therapy_types', key: 'aba_therapy', label: 'ABA Therapy', color: '#dc2626', sortOrder: 5 },
  { category: 'therapy_types', key: 'physiotherapy', label: 'Physiotherapy', color: '#16a34a', sortOrder: 6 },

  // ───────────────────── appointment_statuses (8 with colors) ─────────────────────
  { category: 'appointment_statuses', key: 'scheduled', label: 'Scheduled', color: '#3b82f6', sortOrder: 1 },
  { category: 'appointment_statuses', key: 'confirmed', label: 'Confirmed', color: '#22c55e', sortOrder: 2 },
  { category: 'appointment_statuses', key: 'completed', label: 'Completed', color: '#2563eb', sortOrder: 3 },
  { category: 'appointment_statuses', key: 'rescheduled', label: 'Rescheduled', color: '#9333ea', sortOrder: 4 },
  { category: 'appointment_statuses', key: 'cancelled', label: 'Cancelled', color: '#ef4444', sortOrder: 5 },
  { category: 'appointment_statuses', key: 'no_show', label: 'No Show', color: '#f97316', sortOrder: 6 },
  { category: 'appointment_statuses', key: 'therapist_leave', label: 'Therapist Leave', color: '#6b7280', sortOrder: 7 },
  { category: 'appointment_statuses', key: 'holiday', label: 'Holiday', color: '#0d9488', sortOrder: 8 },

  // ───────────────────── appointment_types (6) ─────────────────────
  { category: 'appointment_types', key: 'consultation', label: 'Consultation', color: '#0d9488', sortOrder: 1 },
  { category: 'appointment_types', key: 'therapy', label: 'Therapy', color: '#2563eb', sortOrder: 2 },
  { category: 'appointment_types', key: 'assessment', label: 'Assessment', color: '#9333ea', sortOrder: 3 },
  { category: 'appointment_types', key: 'speech', label: 'Speech Therapy', color: '#10b981', sortOrder: 4 },
  { category: 'appointment_types', key: 'occupational', label: 'Occupational Therapy', color: '#f59e0b', sortOrder: 5 },
  { category: 'appointment_types', key: 'behavioral', label: 'Behavioral Therapy', color: '#ef4444', sortOrder: 6 },

  // ───────────────────── assessment_types (8) ─────────────────────
  { category: 'assessment_types', key: 'doctor_consultation', label: 'Doctor Consultation', color: '#9333ea', sortOrder: 1 },
  { category: 'assessment_types', key: 'speech', label: 'Speech Assessment', color: '#0d9488', sortOrder: 2 },
  { category: 'assessment_types', key: 'occupational', label: 'Occupational Therapy Assessment', color: '#ea580c', sortOrder: 3 },
  { category: 'assessment_types', key: 'autism', label: 'Autism Assessment', color: '#ec4899', sortOrder: 4 },
  { category: 'assessment_types', key: 'adhd', label: 'ADHD Assessment', color: '#06b6d4', sortOrder: 5 },
  { category: 'assessment_types', key: 'iq', label: 'IQ Assessment', color: '#4f46e5', sortOrder: 6 },
  { category: 'assessment_types', key: 'dp3', label: 'DP3 Assessment', color: '#10b981', sortOrder: 7 },
  { category: 'assessment_types', key: 'learning_disability', label: 'Learning Disability Assessment', color: '#f59e0b', sortOrder: 8 },

  // ───────────────────── session_statuses (7) ─────────────────────
  { category: 'session_statuses', key: 'planned', label: 'Planned', color: '#f59e0b', sortOrder: 1 },
  { category: 'session_statuses', key: 'in_progress', label: 'In Progress', color: '#3b82f6', sortOrder: 2 },
  { category: 'session_statuses', key: 'completed', label: 'Completed', color: '#22c55e', sortOrder: 3 },
  { category: 'session_statuses', key: 'cancelled', label: 'Cancelled', color: '#ef4444', sortOrder: 4 },
  { category: 'session_statuses', key: 'no_show', label: 'No Show', color: '#f97316', sortOrder: 5 },
  { category: 'session_statuses', key: 'accepted', label: 'Accepted', color: '#10b981', sortOrder: 6 },
  { category: 'session_statuses', key: 'rescheduled', label: 'Rescheduled', color: '#9333ea', sortOrder: 7 },

  // ───────────────────── expense_categories (12) ─────────────────────
  { category: 'expense_categories', key: 'rent', label: 'Rent', color: '#2563eb', sortOrder: 1 },
  { category: 'expense_categories', key: 'electricity', label: 'Electricity', color: '#ca8a04', sortOrder: 2 },
  { category: 'expense_categories', key: 'internet', label: 'Internet', color: '#06b6d4', sortOrder: 3 },
  { category: 'expense_categories', key: 'salary', label: 'Salary', color: '#10b981', sortOrder: 4 },
  { category: 'expense_categories', key: 'marketing', label: 'Marketing', color: '#ec4899', sortOrder: 5 },
  { category: 'expense_categories', key: 'therapy_equipment', label: 'Therapy Equipment', color: '#9333ea', sortOrder: 6 },
  { category: 'expense_categories', key: 'stationery', label: 'Stationery', color: '#ea580c', sortOrder: 7 },
  { category: 'expense_categories', key: 'housekeeping', label: 'Housekeeping', color: '#0d9488', sortOrder: 8 },
  { category: 'expense_categories', key: 'maintenance', label: 'Maintenance', color: '#6b7280', sortOrder: 9 },
  { category: 'expense_categories', key: 'travel', label: 'Travel', color: '#4f46e5', sortOrder: 10 },
  { category: 'expense_categories', key: 'training', label: 'Training', color: '#e11d48', sortOrder: 11 },
  { category: 'expense_categories', key: 'miscellaneous', label: 'Miscellaneous', color: '#475569', sortOrder: 12 },

  // ───────────────────── expense_statuses (3) ─────────────────────
  { category: 'expense_statuses', key: 'pending', label: 'Pending', color: '#f97316', sortOrder: 1 },
  { category: 'expense_statuses', key: 'approved', label: 'Approved', color: '#10b981', sortOrder: 2 },
  { category: 'expense_statuses', key: 'rejected', label: 'Rejected', color: '#ef4444', sortOrder: 3 },

  // ───────────────────── leave_types (5) ─────────────────────
  { category: 'leave_types', key: 'casual', label: 'Casual Leave', color: '#3b82f6', sortOrder: 1 },
  { category: 'leave_types', key: 'sick', label: 'Sick Leave', color: '#ef4444', sortOrder: 2 },
  { category: 'leave_types', key: 'earned', label: 'Earned Leave', color: '#10b981', sortOrder: 3 },
  { category: 'leave_types', key: 'maternity', label: 'Maternity Leave', color: '#ec4899', sortOrder: 4 },
  { category: 'leave_types', key: 'unpaid', label: 'Unpaid Leave', color: '#6b7280', sortOrder: 5 },

  // ───────────────────── leave_statuses (4) ─────────────────────
  { category: 'leave_statuses', key: 'pending', label: 'Pending', color: '#f59e0b', sortOrder: 1 },
  { category: 'leave_statuses', key: 'approved', label: 'Approved', color: '#10b981', sortOrder: 2 },
  { category: 'leave_statuses', key: 'rejected', label: 'Rejected', color: '#ef4444', sortOrder: 3 },
  { category: 'leave_statuses', key: 'cancelled', label: 'Cancelled', color: '#6b7280', sortOrder: 4 },

  // ───────────────────── payment_modes (5) ─────────────────────
  { category: 'payment_modes', key: 'cash', label: 'Cash', color: '#10b981', sortOrder: 1 },
  { category: 'payment_modes', key: 'upi', label: 'UPI', color: '#3b82f6', sortOrder: 2 },
  { category: 'payment_modes', key: 'card', label: 'Card', color: '#9333ea', sortOrder: 3 },
  { category: 'payment_modes', key: 'bank_transfer', label: 'Bank Transfer', color: '#0d9488', sortOrder: 4 },
  { category: 'payment_modes', key: 'cheque', label: 'Cheque', color: '#ea580c', sortOrder: 5 },

  // ───────────────────── payment_types (3) ─────────────────────
  { category: 'payment_types', key: 'payment', label: 'Payment', color: '#10b981', sortOrder: 1 },
  { category: 'payment_types', key: 'advance', label: 'Advance', color: '#3b82f6', sortOrder: 2 },
  { category: 'payment_types', key: 'refund', label: 'Refund', color: '#ef4444', sortOrder: 3 },

  // ───────────────────── invoice_types (4) ─────────────────────
  { category: 'invoice_types', key: 'invoice', label: 'Invoice', color: '#3b82f6', sortOrder: 1 },
  { category: 'invoice_types', key: 'receipt', label: 'Receipt', color: '#10b981', sortOrder: 2 },
  { category: 'invoice_types', key: 'advance_receipt', label: 'Advance Receipt', color: '#9333ea', sortOrder: 3 },
  { category: 'invoice_types', key: 'final_receipt', label: 'Final Receipt', color: '#0d9488', sortOrder: 4 },

  // ───────────────────── invoice_statuses (4) ─────────────────────
  { category: 'invoice_statuses', key: 'pending', label: 'Pending', color: '#f97316', sortOrder: 1 },
  { category: 'invoice_statuses', key: 'paid', label: 'Paid', color: '#10b981', sortOrder: 2 },
  { category: 'invoice_statuses', key: 'partially_paid', label: 'Partially Paid', color: '#3b82f6', sortOrder: 3 },
  { category: 'invoice_statuses', key: 'overdue', label: 'Overdue', color: '#ef4444', sortOrder: 4 },

  // ───────────────────── lead_sources (7) ─────────────────────
  { category: 'lead_sources', key: 'doctor', label: 'Doctor Referral', color: '#0d9488', sortOrder: 1 },
  { category: 'lead_sources', key: 'school', label: 'School Referral', color: '#2563eb', sortOrder: 2 },
  { category: 'lead_sources', key: 'parent_reference', label: 'Parent Reference', color: '#10b981', sortOrder: 3 },
  { category: 'lead_sources', key: 'social_media', label: 'Social Media', color: '#9333ea', sortOrder: 4 },
  { category: 'lead_sources', key: 'advertisement', label: 'Advertisement', color: '#ec4899', sortOrder: 5 },
  { category: 'lead_sources', key: 'website', label: 'Website', color: '#06b6d4', sortOrder: 6 },
  { category: 'lead_sources', key: 'walk_in', label: 'Walk In', color: '#ea580c', sortOrder: 7 },

  // ───────────────────── lead_statuses (5) ─────────────────────
  { category: 'lead_statuses', key: 'new', label: 'New', color: '#3b82f6', sortOrder: 1 },
  { category: 'lead_statuses', key: 'contacted', label: 'Contacted', color: '#f59e0b', sortOrder: 2 },
  { category: 'lead_statuses', key: 'interested', label: 'Interested', color: '#9333ea', sortOrder: 3 },
  { category: 'lead_statuses', key: 'registered', label: 'Registered', color: '#10b981', sortOrder: 4 },
  { category: 'lead_statuses', key: 'lost', label: 'Lost', color: '#ef4444', sortOrder: 5 },

  // ───────────────────── patient_statuses (3) ─────────────────────
  { category: 'patient_statuses', key: 'active', label: 'Active', color: '#10b981', sortOrder: 1 },
  { category: 'patient_statuses', key: 'inactive', label: 'Inactive', color: '#6b7280', sortOrder: 2 },
  { category: 'patient_statuses', key: 'discharged', label: 'Discharged', color: '#ef4444', sortOrder: 3 },

  // ───────────────────── genders (3) ─────────────────────
  { category: 'genders', key: 'male', label: 'Male', color: '#2563eb', sortOrder: 1 },
  { category: 'genders', key: 'female', label: 'Female', color: '#ec4899', sortOrder: 2 },
  { category: 'genders', key: 'other', label: 'Other', color: '#6b7280', sortOrder: 3 },

  // ───────────────────── employee_departments (4) ─────────────────────
  { category: 'employee_departments', key: 'therapy', label: 'Therapy', color: '#0d9488', sortOrder: 1 },
  { category: 'employee_departments', key: 'admin', label: 'Admin', color: '#2563eb', sortOrder: 2 },
  { category: 'employee_departments', key: 'hr', label: 'HR', color: '#9333ea', sortOrder: 3 },
  { category: 'employee_departments', key: 'accounts', label: 'Accounts', color: '#10b981', sortOrder: 4 },

  // ───────────────────── employee_statuses (4) ─────────────────────
  { category: 'employee_statuses', key: 'active', label: 'Active', color: '#10b981', sortOrder: 1 },
  { category: 'employee_statuses', key: 'resigned', label: 'Resigned', color: '#ca8a04', sortOrder: 2 },
  { category: 'employee_statuses', key: 'terminated', label: 'Terminated', color: '#ef4444', sortOrder: 3 },
  { category: 'employee_statuses', key: 'notice_period', label: 'Notice Period', color: '#3b82f6', sortOrder: 4 },

  // ───────────────────── payroll_statuses (3) ─────────────────────
  { category: 'payroll_statuses', key: 'draft', label: 'Draft', color: '#6b7280', sortOrder: 1 },
  { category: 'payroll_statuses', key: 'processed', label: 'Processed', color: '#3b82f6', sortOrder: 2 },
  { category: 'payroll_statuses', key: 'paid', label: 'Paid', color: '#10b981', sortOrder: 3 },

  // ───────────────────── attendance_statuses (5) ─────────────────────
  { category: 'attendance_statuses', key: 'present', label: 'Present', color: '#10b981', sortOrder: 1 },
  { category: 'attendance_statuses', key: 'absent', label: 'Absent', color: '#ef4444', sortOrder: 2 },
  { category: 'attendance_statuses', key: 'half_day', label: 'Half Day', color: '#ca8a04', sortOrder: 3 },
  { category: 'attendance_statuses', key: 'leave', label: 'Leave', color: '#3b82f6', sortOrder: 4 },
  { category: 'attendance_statuses', key: 'holiday', label: 'Holiday', color: '#6b7280', sortOrder: 5 },

  // ───────────────────── whatsapp_templates (5) ─────────────────────
  { category: 'whatsapp_templates', key: 'appointment_reminder', label: 'Appointment Reminder', color: '#3b82f6', sortOrder: 1 },
  { category: 'whatsapp_templates', key: 'payment_reminder', label: 'Payment Reminder', color: '#10b981', sortOrder: 2 },
  { category: 'whatsapp_templates', key: 'welcome', label: 'Welcome', color: '#0d9488', sortOrder: 3 },
  { category: 'whatsapp_templates', key: 'assessment_report', label: 'Assessment Report', color: '#9333ea', sortOrder: 4 },
  { category: 'whatsapp_templates', key: 'session_completed', label: 'Session Completed', color: '#ea580c', sortOrder: 5 },

  // ───────────────────── whatsapp_statuses (4) ─────────────────────
  { category: 'whatsapp_statuses', key: 'sent', label: 'Sent', color: '#3b82f6', sortOrder: 1 },
  { category: 'whatsapp_statuses', key: 'delivered', label: 'Delivered', color: '#10b981', sortOrder: 2 },
  { category: 'whatsapp_statuses', key: 'read', label: 'Read', color: '#9333ea', sortOrder: 3 },
  { category: 'whatsapp_statuses', key: 'failed', label: 'Failed', color: '#ef4444', sortOrder: 4 },
]

async function seedConfig() {
  console.log('Seeding SystemConfig...')
  let inserted = 0
  let updated = 0

  for (const item of configItems) {
    // organizationId is nullable, and Prisma can't target a NULL inside a
    // compound unique — these global defaults are matched by hand instead.
    const existing = await db.systemConfig.findFirst({
      where: { organizationId: null, category: item.category, key: item.key },
      select: { id: true },
    })
    const result = await db.systemConfig.upsert({
      where: { id: existing?.id ?? '__none__' },
      update: {
        label: item.label,
        color: item.color ?? null,
        sortOrder: item.sortOrder,
        isActive: item.isActive ?? true,
        metadata: item.metadata ?? null,
      },
      create: {
        category: item.category,
        key: item.key,
        label: item.label,
        color: item.color ?? null,
        sortOrder: item.sortOrder,
        isActive: item.isActive ?? true,
        metadata: item.metadata ?? null,
      },
    })
    if (result.createdAt === result.updatedAt) inserted++
    else updated++
  }

  // Group counts for reporting
  const byCat: Record<string, number> = {}
  for (const c of configItems) {
    byCat[c.category] = (byCat[c.category] || 0) + 1
  }

  console.log(`\n✅ Seeded ${configItems.length} SystemConfig items (inserted=${inserted}, updated=${updated})`)
  console.log('\nBy category:')
  for (const [cat, count] of Object.entries(byCat)) {
    console.log(`  ${cat.padEnd(28)} ${count}`)
  }
}

seedConfig()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(() => process.exit(0))
