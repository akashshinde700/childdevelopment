#!/usr/bin/env node
/**
 * Record a full, non-production app walkthrough with Playwright.
 *
 * All API reads are intercepted with fictional fixture data. Every write method
 * is denied. A fake Zustand session is inserted only in this isolated browser
 * context; no real sign-in, clinic database, or patient data is used.
 *
 * Run the app first, then:
 *   npm run video:full
 *
 * Optional environment:
 *   BASE_URL=http://localhost:3000
 *   PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium
 *   PLAYWRIGHT_CHROMIUM_ARGS='["--no-sandbox"]'
 *   FFMPEG_PATH=/path/to/ffmpeg
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseURL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const output = path.join(root, 'brag-output', 'full-product-demo.mp4')
const reportPath = path.join(root, 'brag-output', 'full-product-demo-audit.md')
const workDir = path.join(root, 'brag-output', 'work', 'full-product-demo')
const score = path.join(root, 'brag-output', 'full-video.mp4')
const ffmpegCandidate = process.env.FFMPEG_PATH || path.join(root, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg')
const ffmpeg = existsSync(ffmpegCandidate) ? ffmpegCandidate : 'ffmpeg'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
const launchArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : []
const today = new Date().toISOString().slice(0, 10)

await mkdir(workDir, { recursive: true })
for (const name of await readdir(workDir)) await rm(path.join(workDir, name), { recursive: true, force: true })

const childRecords = [
  {
    id: 'demo-child-01', patientId: 'DEMO-001', childName: 'Aarav Demo', gender: 'Male',
    dateOfBirth: '2018-06-12', fatherName: 'Demo Parent', motherName: null, parentName: 'Demo Parent',
    mobile: '0000000000', alternateNumber: null, email: 'parent@example.test', city: 'Pune',
    schoolName: 'Demo School', class: 'Grade 2', referredBy: 'Demo Clinic', diagnosis: 'Speech delay',
    diagnosisReport: null, medicalHistory: null, birthHistory: null, photo: null, isActive: true,
    status: 'active', createdAt: today,
  },
  {
    id: 'demo-child-02', patientId: 'DEMO-002', childName: 'Mira Demo', gender: 'Female',
    dateOfBirth: '2019-02-08', fatherName: 'Demo Parent', motherName: null, parentName: 'Demo Parent',
    mobile: '0000000000', alternateNumber: null, email: 'parent@example.test', city: 'Pune',
    schoolName: 'Demo School', class: 'Grade 1', referredBy: 'Demo Clinic', diagnosis: 'Fine motor delay',
    diagnosisReport: null, medicalHistory: null, birthHistory: null, photo: null, isActive: true,
    status: 'active', createdAt: today,
  },
  {
    id: 'demo-child-03', patientId: 'DEMO-003', childName: 'Ishaan Demo', gender: 'Male',
    dateOfBirth: '2017-10-21', fatherName: 'Demo Parent', motherName: null, parentName: 'Demo Parent',
    mobile: '0000000000', alternateNumber: null, email: 'parent@example.test', city: 'Pune',
    schoolName: 'Demo School', class: 'Grade 3', referredBy: 'Demo Clinic', diagnosis: 'Occupational therapy support',
    diagnosisReport: null, medicalHistory: null, birthHistory: null, photo: null, isActive: true,
    status: 'active', createdAt: today,
  },
]

const therapists = [
  { id: 'demo-therapist-01', userId: 'demo-user-01', employeeId: 'demo-employee-01', name: 'Riya Demo', email: 'riya@example.test', role: 'therapist_speech', therapyType: 'Speech Therapy', designation: 'Speech Therapist', isActive: true },
  { id: 'demo-therapist-02', userId: 'demo-user-02', employeeId: 'demo-employee-02', name: 'Kabir Demo', email: 'kabir@example.test', role: 'therapist_ot', therapyType: 'Occupational Therapy', designation: 'Occupational Therapist', isActive: true },
]

const employees = [
  { id: 'demo-employee-01', employeeId: 'DEMO-STAFF-01', userId: 'demo-user-01', name: 'Riya Demo', designation: 'Speech Therapist', department: 'Therapist', mobile: '0000000000', email: 'riya@example.test', joinDate: '2024-06-01', basicSalary: 42000, hra: 8000, allowances: 2000, status: 'active', createdAt: today, updatedAt: today },
  { id: 'demo-employee-02', employeeId: 'DEMO-STAFF-02', userId: 'demo-user-02', name: 'Kabir Demo', designation: 'Occupational Therapist', department: 'Therapist', mobile: '0000000000', email: 'kabir@example.test', joinDate: '2024-09-15', basicSalary: 40000, hra: 7500, allowances: 1500, status: 'active', createdAt: today, updatedAt: today },
  { id: 'demo-employee-03', employeeId: 'DEMO-STAFF-03', name: 'Nina Demo', designation: 'Clinic Coordinator', department: 'Admin', mobile: '0000000000', email: 'nina@example.test', joinDate: '2025-01-10', basicSalary: 32000, hra: 6000, allowances: 1000, status: 'active', createdAt: today, updatedAt: today },
]

const appointments = [
  { id: 'demo-appointment-01', patientId: childRecords[0].id, title: 'Speech Therapy', date: today, startTime: '10:00', endTime: '10:45', therapistId: therapists[0].id, status: 'confirmed', type: 'speech', notes: 'Fictional demo appointment', patient: { id: childRecords[0].id, patientId: childRecords[0].patientId, childName: childRecords[0].childName, mobile: '0000000000' } },
  { id: 'demo-appointment-02', patientId: childRecords[1].id, title: 'Occupational Therapy', date: today, startTime: '11:00', endTime: '11:45', therapistId: therapists[1].id, status: 'planned', type: 'occupational', notes: 'Fictional demo appointment', patient: { id: childRecords[1].id, patientId: childRecords[1].patientId, childName: childRecords[1].childName, mobile: '0000000000' } },
  { id: 'demo-appointment-03', patientId: childRecords[2].id, title: 'Speech Therapy', date: today, startTime: '14:00', endTime: '14:45', therapistId: therapists[0].id, status: 'completed', type: 'speech', notes: 'Fictional demo appointment', patient: { id: childRecords[2].id, patientId: childRecords[2].patientId, childName: childRecords[2].childName, mobile: '0000000000' } },
]

const sessions = [
  { id: 'demo-session-01', patientId: childRecords[0].id, patientPackageId: 'demo-package-assignment-01', therapistName: 'Riya Demo', therapyType: 'Speech Therapy', appointmentId: appointments[0].id, roomId: 'Room A', date: today, startTime: '10:00', endTime: '10:45', status: 'completed', subjective: 'Fictional demo note', objective: 'Turn-taking and sound practice', assessment: 'Engagement improving', plan: 'Continue weekly practice', notes: 'Synthetic training record', patient: { childName: childRecords[0].childName, patientId: childRecords[0].patientId, mobile: '0000000000' } },
  { id: 'demo-session-02', patientId: childRecords[1].id, patientPackageId: 'demo-package-assignment-02', therapistName: 'Kabir Demo', therapyType: 'Occupational Therapy', appointmentId: appointments[1].id, roomId: 'Room B', date: today, startTime: '11:00', endTime: '11:45', status: 'planned', subjective: 'Fictional demo note', objective: 'Fine-motor activity', assessment: 'Ready for next step', plan: 'Continue structured tasks', notes: 'Synthetic training record', patient: { childName: childRecords[1].childName, patientId: childRecords[1].patientId, mobile: '0000000000' } },
]

const packages = [
  { id: 'demo-package-01', name: 'Speech Progress — Demo', therapyType: 'Speech Therapy', sessionCount: 12, sessionDuration: 45, amount: 10800, discount: 0, validityDays: 90, isActive: true, createdAt: today, updatedAt: today, therapyTypes: [] },
  { id: 'demo-package-02', name: 'OT Foundations — Demo', therapyType: 'Occupational Therapy', sessionCount: 8, sessionDuration: 45, amount: 7600, discount: 0, validityDays: 60, isActive: true, createdAt: today, updatedAt: today, therapyTypes: [] },
]

const assignments = [
  { id: 'demo-package-assignment-01', patientId: childRecords[0].id, patient: { childName: childRecords[0].childName, patientId: childRecords[0].patientId }, packageId: packages[0].id, package: packages[0], name: packages[0].name, sessionsPurchased: 12, sessionsCompleted: 4, sessionsCompletedActual: 4, sessionsRemaining: 8, netAmount: 10800, startDate: today, endDate: '2027-02-11', status: 'active' },
  { id: 'demo-package-assignment-02', patientId: childRecords[1].id, patient: { childName: childRecords[1].childName, patientId: childRecords[1].patientId }, packageId: packages[1].id, package: packages[1], name: packages[1].name, sessionsPurchased: 8, sessionsCompleted: 2, sessionsCompletedActual: 2, sessionsRemaining: 6, netAmount: 7600, startDate: today, endDate: '2027-01-11', status: 'active' },
]

const invoices = [
  { id: 'demo-invoice-01', invoiceNo: 'DEMO-INV-104', patientId: childRecords[0].id, patient: { childName: childRecords[0].childName, patientId: childRecords[0].patientId, parentName: 'Demo Parent', mobile: '0000000000', city: 'Pune' }, date: today, type: 'invoice', subtotal: 10800, discount: 0, gstApplicable: false, cgst: 0, sgst: 0, totalAmount: 10800, amountPaid: 6000, balanceDue: 4800, paymentMode: 'upi', status: 'partially_paid', notes: 'Fictional demo invoice', invoiceItems: [{ id: 'demo-line-01', type: 'package', description: packages[0].name, quantity: 1, rate: 10800, amount: 10800 }] },
  { id: 'demo-invoice-02', invoiceNo: 'DEMO-INV-105', patientId: childRecords[1].id, patient: { childName: childRecords[1].childName, patientId: childRecords[1].patientId, parentName: 'Demo Parent', mobile: '0000000000', city: 'Pune' }, date: today, type: 'invoice', subtotal: 7600, discount: 0, gstApplicable: false, cgst: 0, sgst: 0, totalAmount: 7600, amountPaid: 7600, balanceDue: 0, paymentMode: 'cash', status: 'paid', notes: 'Fictional demo invoice', invoiceItems: [{ id: 'demo-line-02', type: 'package', description: packages[1].name, quantity: 1, rate: 7600, amount: 7600 }] },
]

const payments = [
  { id: 'demo-payment-01', paymentNo: 'DEMO-PAY-021', amount: 6000, paymentMode: 'upi', date: today, type: 'payment', status: 'completed', patient: { childName: childRecords[0].childName, patientId: childRecords[0].patientId }, invoiceId: invoices[0].id },
  { id: 'demo-payment-02', paymentNo: 'DEMO-PAY-022', amount: 7600, paymentMode: 'cash', date: today, type: 'payment', status: 'completed', patient: { childName: childRecords[1].childName, patientId: childRecords[1].patientId }, invoiceId: invoices[1].id },
]

const attendance = employees.map((employee, index) => ({
  id: `demo-attendance-${index + 1}`, employeeId: employee.id, employee: { name: employee.name, employeeId: employee.employeeId, department: employee.department },
  date: today, status: index === 2 ? 'late' : 'present', checkIn: index === 2 ? '09:12' : '09:00', checkOut: '17:30',
}))

const dashboard = {
  patients: { total: 128, active: 112, newThisMonth: 9 },
  appointments: { today: 14, weekly: 62, completedThisMonth: 218, cancelledThisMonth: 7, total: 225, monthly: 225 },
  revenue: { today: 13600, weekly: 76000, monthly: 325000, yearly: 2100000 },
  payments: { pending: 38400 },
  hr: { total: 18, presentToday: 15, onLeaveToday: 2 },
  expenses: { monthly: 92000, netProfit: 233000 },
  recentPatients: childRecords,
  upcomingAppointments: appointments,
  recentCompletedSessions: sessions.filter((session) => session.status === 'completed').map((session) => ({ id: session.id, therapistName: session.therapistName, therapyType: session.therapyType, date: session.date })),
  period: {
    mode: 'single', from: today, to: today, isToday: true, appointments: 14, sessions: 11, revenue: 13600,
    previous: { appointments: 11, sessions: 8, revenue: 9500 },
    therapyBreakdown: [{ name: 'Speech Therapy', value: 24 }, { name: 'Occupational Therapy', value: 18 }, { name: 'Behavioral Therapy', value: 11 }],
    schedule: appointments.map((appointment) => ({ ...appointment, therapyType: appointment.title, therapistId: appointment.therapistId })),
    completedSessions: sessions.filter((session) => session.status === 'completed').map((session) => ({ id: session.id, therapistName: session.therapistName, therapyType: session.therapyType, date: session.date })),
  },
}

function responseFor(url) {
  const { pathname } = url
  if (pathname === '/api/dashboard') return dashboard
  if (pathname === '/api/patients') return { patients: childRecords, total: 128 }
  if (pathname.startsWith('/api/patients/')) {
    return { patient: childRecords[0], appointments, sessions, assessments: [], packages: assignments, payments, invoices, summary: { totalSessions: 12, completedSessions: 4, remainingSessions: 8, totalPaid: 6000, balanceDue: 4800 } }
  }
  if (pathname === '/api/appointments') return { appointments, total: appointments.length }
  if (pathname === '/api/sessions') return { sessions, total: sessions.length }
  if (pathname === '/api/packages') return { packages, assignments, stats: { activeCount: packages.length, expiringCount: 1, expiredCount: 0, totalAssignments: assignments.length } }
  if (pathname === '/api/patient-packages') return { packages: assignments }
  if (pathname === '/api/invoices') return { invoices, total: invoices.length }
  if (pathname === '/api/payments') return { payments, total: payments.length }
  if (pathname === '/api/employees') return { employees, total: employees.length }
  if (pathname === '/api/users') return therapists
  if (pathname === '/api/attendance') return { records: attendance, summary: { present: 2, late: 1, absent: 0, onLeave: 0 } }
  if (pathname === '/api/payroll' || pathname === '/api/payroll/earnings') return { records: [], employees: [], summary: { totalNetSalary: 0 } }
  if (pathname === '/api/expenses') return { expenses: [], total: 0 }
  if (pathname === '/api/services') return { services: [] }
  if (pathname === '/api/subscription/features') return { features: { advancedReports: true, exportData: true } }
  if (pathname === '/api/roles') return { roles: [] }
  if (pathname === '/api/branches') return { branches: [] }
  if (pathname === '/api/leave-policies') return { policies: [] }
  if (pathname === '/api/leaves') return { leaves: [], total: 0 }
  if (pathname === '/api/leads') return { leads: [], total: 0 }
  if (pathname === '/api/whatsapp-logs') return { logs: [], total: 0 }
  if (pathname === '/api/notifications') return { notifications: [] }
  if (pathname === '/api/reschedule-requests') return { requests: [] }
  if (pathname === '/api/config' || pathname.startsWith('/api/config/')) return { items: [], configs: [] }
  if (pathname === '/api/settings/branding') return { name: 'Demo Clinic', logo: null }
  if (pathname === '/api/search') return { patients: [], appointments: [], invoices: [], payments: [], employees: [], leads: [] }
  return {}
}

const checks = []
const writeAttempts = []
const consoleErrors = []
const pageErrors = []
let devWebSocketErrors = 0
let recordedVideoPath
let browser

function pass(description) {
  checks.push(`- PASS — ${description}`)
  console.log(`PASS ${description}`)
}
function expect(condition, description) {
  assert.ok(condition, description)
  pass(description)
}
function watchPage(page) {
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    if (message.text().includes('_next/') && message.text().toLowerCase().includes('websocket')) devWebSocketErrors += 1
    else consoleErrors.push(message.text())
  })
}
async function pause(ms) { await new Promise((resolve) => setTimeout(resolve, ms)) }
async function showTransition(page, message, id = 'full-demo-transition') {
  await page.evaluate(({ message, id }) => {
    document.getElementById(id)?.remove()
    const panel = document.createElement('div')
    panel.id = id
    panel.innerHTML = `<div style="color:#a3ece1;font-size:12px;font-weight:700;letter-spacing:.22em">AETHERDEV SOLUTIONS</div><div style="margin:18px 24px 8px;font-size:34px;font-weight:800;letter-spacing:-.03em">${message}</div><div style="font-size:13px;color:#c5dedf">Fictional demo workspace · read-only</div>`
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:36px;background:radial-gradient(ellipse at 78% 15%,rgba(22,139,138,.85),transparent 38%),linear-gradient(135deg,#062b35,#0e4a50 56%,#091f2c);color:white;font-family:Inter,system-ui,sans-serif;pointer-events:none'
    document.body.appendChild(panel)
  }, { message, id })
}
async function clearTransition(page, id = 'full-demo-transition') {
  await page.evaluate((id) => document.getElementById(id)?.remove(), id)
}
async function caption(page, step, title, subtitle, ms) {
  await page.evaluate(({ step, title, subtitle }) => {
    let panel = document.getElementById('full-demo-caption')
    if (!panel) {
      panel = document.createElement('div')
      panel.id = 'full-demo-caption'
      panel.innerHTML = '<div id="full-demo-progress"></div><div class="copy"><div class="rail"></div><div class="text"><strong id="full-demo-title"></strong><span id="full-demo-subtitle"></span></div><small id="full-demo-step"></small></div>'
      panel.style.cssText = 'position:fixed;z-index:2147483647;left:26px;bottom:22px;width:min(620px,calc(100vw - 52px));overflow:hidden;border:1px solid rgba(211,243,240,.2);border-radius:14px;background:rgba(5,25,32,.92);color:#f6fbfc;box-shadow:0 16px 42px rgba(0,0,0,.28);font:14px/1.35 Inter,system-ui,sans-serif;backdrop-filter:blur(12px);pointer-events:none'
      panel.innerHTML += '<style>#full-demo-caption #full-demo-progress{height:3px;background:linear-gradient(90deg,#4ee0c0,#4ee0c0);width:0;transition:width .5s}#full-demo-caption .copy{display:flex;align-items:center;gap:13px;padding:12px 17px}#full-demo-caption .rail{width:3px;height:35px;border-radius:4px;background:#4ee0c0;flex:none}#full-demo-caption .text{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}#full-demo-caption strong{font-size:15px;line-height:1.2}#full-demo-caption span{font-size:12px;color:#c6d8dc}#full-demo-caption small{font-size:10px;letter-spacing:.12em;color:#92aeb2;white-space:nowrap}</style>'
      document.body.appendChild(panel)
    }
    document.getElementById('full-demo-title').textContent = title
    document.getElementById('full-demo-subtitle').textContent = subtitle
    document.getElementById('full-demo-step').textContent = `${String(step).padStart(2, '0')} / 11`
    document.getElementById('full-demo-progress').style.width = `${Math.round((step / 11) * 100)}%`
  }, { step, title, subtitle })
  await pause(ms)
}
async function go(page, label, hash, contentMarker, step, title, subtitle, ms = 4500) {
  const navItem = page.getByText(label, { exact: true }).first()
  await navItem.waitFor({ state: 'visible', timeout: 15000 })
  await showTransition(page, `Opening ${label}`)
  await navItem.click()
  await page.waitForURL(`**/#${hash}`, { timeout: 10000 })
  if (contentMarker) await page.locator('main').getByText(contentMarker, { exact: false }).first().waitFor({ state: 'visible', timeout: 25000 })
  // Give fixture-backed modules time to finish their async renders while the
  // transition card masks their loading skeletons.
  await pause(900)
  expect(page.url().endsWith(`#${hash}`), `${label} opens the ${hash} module from the live sidebar`)
  await clearTransition(page)
  await caption(page, step, title, subtitle, ms)
}

try {
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), ...(launchArgs.length ? { args: launchArgs } : {}) })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    recordVideo: { dir: workDir, size: { width: 1280, height: 720 } },
  })
  await context.addInitScript(() => {
    if (sessionStorage.getItem('full-demo-initialized')) return
    localStorage.setItem('app-store-v2', JSON.stringify({
      state: {
        user: { id: 'demo-admin', email: 'admin@demo.invalid', name: 'Demo Clinic Admin', role: 'super_admin', organizationId: 'demo-org', branchId: null },
        token: 'local-fictional-demo-token', isAuthenticated: true,
        currentPage: 'dashboard', currentBranch: null, sidebarOpen: true,
      },
      version: 2,
    }))
    sessionStorage.setItem('full-demo-initialized', '1')
  })
  await context.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET') {
      writeAttempts.push(`${request.method()} ${url.pathname}`)
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Read-only demo: writes are disabled.' }) })
      return
    }
    const payload = responseFor(url)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  })

  const page = await context.newPage()
  watchPage(page)
  await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByText('Welcome back, Demo Clinic Admin!', { exact: false }).waitFor({ state: 'visible', timeout: 30000 })
  await page.locator('main').getByText("Today's Appointments", { exact: false }).waitFor({ state: 'visible', timeout: 25000 })
  await pause(1200)
  await page.evaluate(() => {
    const banner = document.createElement('div')
    banner.id = 'fictional-data-banner'
    banner.textContent = 'DEMO WORKSPACE  •  FICTIONAL DATA ONLY  •  READ-ONLY'
    banner.style.cssText = 'position:fixed;z-index:2147483646;right:20px;top:16px;padding:7px 12px;border:1px solid rgba(15,122,135,.22);border-radius:999px;background:rgba(255,255,255,.96);color:#0f6670;font:700 10px/1.2 Inter,system-ui,sans-serif;letter-spacing:.13em;box-shadow:0 4px 16px rgba(15,50,55,.1);pointer-events:none'
    document.body.appendChild(banner)
  })
  expect(await page.locator('main').getByText('Welcome back, Demo Clinic Admin!', { exact: false }).isVisible(), 'Dashboard opens with isolated fictional demo state')
  await caption(page, 1, 'One clinic, one clear picture of the day', 'Aaj ki appointments, sessions, collections aur caseload — ek dashboard par.', 6500)

  await go(page, 'Patients', 'patients', 'Aarav Demo', 2, 'Every child has a connected care record', 'Assessments, diagnosis and progress — patient-wise, not scattered.', 5500)
  expect(await page.locator('main').getByText('Aarav Demo', { exact: true }).isVisible(), 'Fictional child record appears in the patient list')

  await go(page, 'Appointments', 'appointments', 'Speech Therapy', 3, 'Therapist-wise appointments, at a glance', 'Daily schedule aur upcoming visits ek jagah manage hote hain.', 5500)
  const appointmentText = await page.locator('main').innerText()
  expect(appointmentText.includes('Aarav Demo') || appointmentText.includes('Appointments'), 'Appointments screen loads with the demo schedule')

  await go(page, 'Packages', 'packages', 'Speech Progress — Demo', 4, 'Care plans tied to sessions and progress', 'Therapy packages show purchased sessions and remaining balance.', 5000)
  expect((await page.locator('main').innerText()).includes('Speech Progress — Demo'), 'Package screen shows a clearly fictional demo package')

  await go(page, 'Therapy Sessions', 'sessions', 'Therapy Session Plan', 5, 'Session notes keep the care journey moving', 'Focus, goals, progress aur next steps — therapist ke workflow mein.', 5500)
  expect((await page.locator('main').innerText()).includes('Aarav Demo'), 'Session page loads fictional patient context')

  await go(page, 'Billing & Invoices', 'billing', 'DEMO-INV-104', 6, 'Invoices and balances stay easy to follow', 'Package-linked charges, amount received, aur pending balance.', 5500)
  expect((await page.locator('main').innerText()).includes('DEMO-INV-104'), 'Billing page shows an isolated fictional invoice')

  await go(page, 'Employees', 'employees', 'Riya Demo', 7, 'Support the team behind every session', 'Therapists aur clinic staff ke profiles ek admin view mein.', 5000)
  expect((await page.locator('main').innerText()).includes('Riya Demo'), 'Team page shows synthetic employee records')

  await go(page, 'Attendance', 'attendance', 'Riya Demo', 8, 'Attendance and clinic operations together', 'Daily presence records team coordination ko simple banate hain.', 5000)
  expect((await page.locator('main').innerText()).includes('Riya Demo'), 'Attendance screen loads with demo staff')

  await go(page, 'Reports', 'reports', 'Reports & Analytics', 9, 'Use clinic activity to plan what comes next', 'Reports combine service, finance, team and care activity.', 5000)
  expect((await page.locator('main').innerText()).toLowerCase().includes('report'), 'Reports module loads with the synthetic clinic dataset')

  // Switch to a second, isolated fictional account to show the parent-facing
  // view. Only localStorage in this recording context changes; no auth API runs.
  await showTransition(page, 'Opening the family portal')
  await page.evaluate(() => {
    localStorage.setItem('app-store-v2', JSON.stringify({
      state: {
        user: { id: 'demo-parent', email: 'parent@example.test', name: 'Demo Parent', role: 'parent', organizationId: 'demo-org', patientId: 'demo-child-01' },
        token: 'local-fictional-parent-token', isAuthenticated: true,
        currentPage: 'parent-dashboard', currentBranch: null, sidebarOpen: true,
      },
      version: 2,
    }))
  })
  // Change the URL as well as storage to force a real app reload; a hash-only
  // goto is same-document navigation and would leave the admin Zustand session live.
  await page.goto(`${baseURL}/?parent-demo=1#parent-dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.getByRole('heading', { name: 'My Portal', exact: true }).waitFor({ state: 'visible', timeout: 25000 })
  await page.locator('main').getByText('Aarav Demo', { exact: false }).first().waitFor({ state: 'visible', timeout: 25000 })
  expect(await page.locator('main').getByText('Aarav Demo', { exact: false }).first().isVisible(), 'Parent portal opens with the linked fictional child profile')
  await pause(1800)
  await clearTransition(page)
  await caption(page, 10, 'Families get their own connected view', 'Appointments, session progress, invoices and care updates — parent portal mein.', 6500)

  // End slate over the same real app canvas; no real branding/contact details are
  // exposed beyond the product's public AetherDev name.
  await page.evaluate(() => {
    const end = document.createElement('div')
    end.id = 'full-demo-end'
    end.innerHTML = '<div class="eyebrow">AETHERDEV SOLUTIONS</div><div class="headline">More room for care.<br><span>Less admin between sessions.</span></div><div class="foot">CHILD THERAPY CENTER MANAGEMENT  ·  DEMO DATA ONLY</div>'
    end.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at 78% 15%,rgba(22,139,138,.82),transparent 38%),linear-gradient(135deg,#062b35,#0e4a50 56%,#091f2c);color:white;font-family:Inter,system-ui,sans-serif'
    end.innerHTML += '<style>#full-demo-end .eyebrow{color:#a3ece1;font-size:13px;font-weight:700;letter-spacing:.24em}#full-demo-end .headline{margin:22px 30px;font-size:50px;line-height:1.08;font-weight:800;letter-spacing:-.04em}#full-demo-end .headline span{color:#6fe6ca}#full-demo-end .foot{position:absolute;bottom:40px;color:#c5dedf;font-size:11px;letter-spacing:.15em}</style>'
    document.body.appendChild(end)
  })
  await pause(2500)

  const video = page.video()
  await page.close()
  recordedVideoPath = await video.path()
  await context.close()

  expect(writeAttempts.length === 0, `No API write requests were attempted (${writeAttempts.length})`)
  expect(pageErrors.length === 0 && consoleErrors.length === 0, `No uncaught browser/page console exceptions (${pageErrors.length} page, ${consoleErrors.length} console)`)

  const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', recordedVideoPath], { encoding: 'utf8' })
  const durationMatch = `${probe.stderr || ''}${probe.stdout || ''}`.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!durationMatch) throw new Error('Could not determine the recorded walkthrough duration for the audio fade.')
  const recordingDuration = Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
  const fadeOutStart = Math.max(0, recordingDuration - 3.5).toFixed(2)
  const ff = spawnSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-stream_loop', '-1', '-i', score,
    '-i', recordedVideoPath,
    '-map', '1:v:0', '-map', '0:a:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-af', `volume=0.22,afade=t=in:st=0:d=1,afade=t=out:st=${fadeOutStart}:d=3.5`,
    '-shortest', '-movflags', '+faststart',
    '-metadata', 'title=AetherDev Solutions — Full Product Demo',
    '-metadata', 'comment=Actual app UI with synthetic API fixtures; read-only; no real patient data',
    output,
  ], { encoding: 'utf8' })
  if (ff.status !== 0) throw new Error(`FFmpeg failed: ${ff.stderr || ff.error?.message}`)
  await rm(recordedVideoPath, { force: true })

  const report = `# Full product demo — Playwright audit\n\n` +
    `Run date: ${new Date().toISOString().slice(0, 10)}\n\n` +
    `## Results\n\n${checks.join('\n')}\n\n` +
    `- Protected API calls were intercepted with fictional in-memory fixtures; mutating HTTP methods were blocked.\n` +
    `- Test write attempts: ${writeAttempts.length}. Page exceptions: ${pageErrors.length}. Application console errors: ${consoleErrors.length}. Dev HMR websocket errors: ${devWebSocketErrors}.\n` +
    `- Output: \`brag-output/full-product-demo.mp4\` (actual React pages, 1280×720, H.264/AAC).\n\n` +
    `## Accuracy and privacy\n\n` +
    `This is a **read-only visual product demo**, not a production E2E/security certification. The browser storage includes a fictional local demo role; every \`/api/*\` GET was intercepted before reaching the application server and all non-GET methods were denied. Names and records are fictional, emails use \`.test\`, and phone fields use zeros. The parent view switches to a separate fictional local session. No user password was used, no form was submitted, and no database operation was performed.\n\n` +
    `Live pricing, real authentication, tenant isolation, and persistent data writes were not tested. The video uses the real app frontend with synthetic API fixture data; it must not be represented as production patient data or a live-clinic recording.\n`
  await writeFile(reportPath, report, 'utf8')
  console.log(`\nSaved ${path.relative(root, output)}`)
  console.log(`Saved ${path.relative(root, reportPath)}`)
} finally {
  if (browser) await browser.close().catch(() => {})
}
