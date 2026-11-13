import { db } from './db'

export type NotificationType = 'appointment' | 'assessment' | 'payment' | 'package' | 'hr' | 'expense' | 'general'

interface CreateNotificationInput {
  userId: string
  type: NotificationType
  title: string
  message: string
  link?: string
}

// Every helper below takes organizationId as its first argument and scopes
// its user lookup to that organization. Without this, name/role matches ran
// GLOBALLY — e.g. clinic B's "Dr. Priya" would receive clinic A's
// appointment notifications. Cross-tenant notification delivery is a data
// leak (patient names appear in notification messages).

export async function createNotification(organizationId: string | null, input: CreateNotificationInput) {
  try {
    await db.notification.create({ data: { ...input, organizationId } })
  } catch (err) {
    // Notifications are best-effort — never let a notify failure fail the
    // parent request (e.g. creating an appointment must succeed even if the
    // notification insert fails for some reason).
    console.error('Failed to create notification:', err)
  }
  // Fire the mobile push in parallel with (not blocking) the in-app row —
  // every notification path in this file funnels through here, so this one
  // spot covers the whole app's push matrix (appointments, payments,
  // packages, HR, expenses, general) with no per-route changes needed.
  sendPushForUser(input.userId, input.title, input.message, input.link).catch((err) =>
    console.error('Failed to send push notification:', err)
  )
}

async function sendPushForUser(userId: string, title: string, body: string, link?: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { pushToken: true } })
  const pushToken = user?.pushToken
  if (!pushToken || !pushToken.startsWith('ExponentPushToken')) return

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: pushToken,
      title,
      body,
      data: link ? { link } : undefined,
      sound: 'default',
    }),
  })
}

// Notify the parent linked to a patient, if a parent-role account exists for them.
export async function notifyPatientParent(organizationId: string | null, patientId: string, input: Omit<CreateNotificationInput, 'userId'>) {
  const parent = await db.user.findFirst({ where: { role: 'parent', patientId, organizationId } })
  if (parent) await createNotification(organizationId, { ...input, userId: parent.id })
}

// Notify a therapist by their display name (Appointment.therapistId stores the name, not a User id).
export async function notifyTherapistByName(organizationId: string | null, therapistName: string | null | undefined, input: Omit<CreateNotificationInput, 'userId'>) {
  if (!therapistName) return
  const therapist = await db.user.findFirst({ where: { name: therapistName, role: { startsWith: 'therapist' }, organizationId } })
  if (therapist) await createNotification(organizationId, { ...input, userId: therapist.id })
}

// Notify every user account holding any of the given roles (e.g. admin +
// receptionist for front-office events like a new lead coming in).
export async function notifyRoles(organizationId: string | null, roles: string[], input: Omit<CreateNotificationInput, 'userId'>) {
  const users = await db.user.findMany({ where: { role: { in: roles }, organizationId }, select: { id: true } })
  await Promise.all(users.map((u) => createNotification(organizationId, { ...input, userId: u.id })))
}

// Notify an employee's login account, if one exists. There's no direct
// Employee<->User foreign key (see the same fuzzy-match pattern used at
// login in api/auth/login/route.ts) — most employees don't have a portal
// login at all, so this is a best-effort no-op when none is found.
export async function notifyEmployeeByName(organizationId: string | null, employeeName: string | null | undefined, input: Omit<CreateNotificationInput, 'userId'>) {
  if (!employeeName) return
  let user = await db.user.findFirst({ where: { name: { equals: employeeName }, organizationId } })
  if (!user) {
    user = await db.user.findFirst({ where: { name: { contains: employeeName.trim() }, organizationId } })
  }
  if (user) await createNotification(organizationId, { ...input, userId: user.id })
}
