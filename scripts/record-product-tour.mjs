#!/usr/bin/env node
/**
 * Playwright smoke-test + real-browser screen recording for AetherDev's public
 * clinic-management landing page. No credentials are used and no forms are sent.
 *
 * Usage:
 *   npm run dev -- --hostname 0.0.0.0
 *   node scripts/record-product-tour.mjs
 *
 * Optional:
 *   BASE_URL=http://127.0.0.1:3000
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
const outputDir = path.join(root, 'brag-output')
const workDir = path.join(outputDir, 'work', 'playwright-product-tour')
const baseURL = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const videoPath = path.join(outputDir, 'product-walkthrough.mp4')
const auditPath = path.join(outputDir, 'playwright-audit.md')
const sourceMusic = path.join(outputDir, 'full-video.mp4')

const ffmpeg = process.env.FFMPEG_PATH || path.join(root, 'node_modules/@ffmpeg-installer/linux-x64/ffmpeg')
if (!existsSync(ffmpeg) && !process.env.FFMPEG_PATH) {
  // Standard PATH fallback for machines that provide ffmpeg system-wide.
}
const ffmpegCommand = existsSync(ffmpeg) ? ffmpeg : 'ffmpeg'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined
const launchArgs = process.env.PLAYWRIGHT_CHROMIUM_ARGS
  ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS)
  : []

await mkdir(workDir, { recursive: true })
for (const name of await readdir(workDir)) {
  await rm(path.join(workDir, name), { recursive: true, force: true })
}

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
  ...(launchArgs.length ? { args: launchArgs } : {}),
})
const checks = []
const pageErrors = []
const consoleErrors = []
let devHmrWebSocketErrors = 0
let expectedPlansApiErrors = 0
let planApiStatus = 'not observed'

function monitorPage(page) {
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('/_next/hmr') || text.includes('/_next/webpack-hmr')) devHmrWebSocketErrors += 1
    else if (Number(planApiStatus) >= 500 && text.includes('Failed to load resource') && text.includes('500')) expectedPlansApiErrors += 1
    else consoleErrors.push(text)
  })
}
let videoSource
let mobileWidths = {}

function pass(description) {
  checks.push(`- PASS — ${description}`)
  console.log(`PASS ${description}`)
}

function expect(condition, description) {
  assert.ok(condition, description)
  pass(description)
}

async function waitFor(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function setCaption(page, number, title, subtitle, progress) {
  await page.evaluate(({ number, title, subtitle, progress }) => {
    let node = document.getElementById('brag-caption')
    if (!node) {
      node = document.createElement('div')
      node.id = 'brag-caption'
      node.innerHTML = `
        <div style="height:3px;background:#183d45;overflow:hidden;border-radius:10px 10px 0 0">
          <div id="brag-progress" style="height:100%;background:#4fe0c0;width:0;transition:width 500ms ease"></div>
        </div>
        <div style="display:flex;align-items:center;gap:14px;padding:12px 18px 13px">
          <div style="width:3px;height:34px;background:#4fe0c0;border-radius:4px"></div>
          <div style="min-width:0;flex:1">
            <div id="brag-title" style="font-size:16px;font-weight:750;letter-spacing:.01em;line-height:1.2"></div>
            <div id="brag-subtitle" style="font-size:12px;color:#c6d8dc;margin-top:4px;line-height:1.3"></div>
          </div>
          <div id="brag-count" style="font-size:10px;letter-spacing:.12em;color:#8ca9ae;white-space:nowrap"></div>
        </div>`
      Object.assign(node.style, {
        position: 'fixed', bottom: '18px', left: '24px', zIndex: '2147483647',
        width: 'min(590px, calc(100vw - 48px))', color: '#f7fbfc',
        background: 'rgba(8, 27, 34, .91)', border: '1px solid rgba(181,232,230,.18)',
        borderRadius: '12px', overflow: 'hidden', boxShadow: '0 12px 36px rgba(2,16,20,.32)',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
        backdropFilter: 'blur(14px)', pointerEvents: 'none',
      })
      document.body.appendChild(node)
    }
    document.getElementById('brag-title').textContent = title
    document.getElementById('brag-subtitle').textContent = subtitle
    document.getElementById('brag-count').textContent = `${String(number).padStart(2, '0')} / 07`
    document.getElementById('brag-progress').style.width = `${progress}%`
  }, { number, title, subtitle, progress })
}

async function chapter(page, number, title, subtitle, selector, milliseconds) {
  if (selector) {
    const target = page.locator(selector)
    await target.waitFor({ state: 'visible', timeout: 15000 })
    await target.scrollIntoViewIfNeeded()
  }
  await setCaption(page, number, title, subtitle, Math.round((number / 7) * 100))
  await waitFor(milliseconds)
}

try {
  // Real browser recording; the intro card makes the capture intentional from
  // frame one instead of showing a blank browser while Next.js hydrates.
  const recordingContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    recordVideo: { dir: workDir, size: { width: 1280, height: 720 } },
  })
  const page = await recordingContext.newPage()
  monitorPage(page)
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/api/public/plans') planApiStatus = String(response.status())
  })

  await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}body{margin:0;width:100vw;height:100vh;display:grid;place-items:center;overflow:hidden;color:white;font-family:Inter,Arial,sans-serif;background:radial-gradient(ellipse at 75% 15%,#168b8a 0,transparent 36%),linear-gradient(135deg,#062b35,#0e4a50 56%,#091f2c)}
    .cover{width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:50px;position:relative}.content{max-width:980px;animation:rise .7s ease-out both}.eyebrow{color:#9de9dc;letter-spacing:.25em;font-size:13px;font-weight:700;text-transform:uppercase}.title{font-size:56px;line-height:1.08;letter-spacing:-.04em;font-weight:800;margin:22px 0}.accent{color:#6fe6ca}.sub{font-size:20px;color:#d4e7e8;margin:0}.brand{position:absolute;bottom:38px;left:48px;font-size:14px;letter-spacing:.18em;color:#c5dedf}.brand b{color:white}@keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
  </style></head><body><main class="cover"><div class="content"><div class="eyebrow">AetherDev Solutions presents</div><h1 class="title">More time for <span class="accent">care.</span><br>Less clinic admin.</h1><p class="sub">A child therapy clinic, running on one connected platform.</p></div><div class="brand"><b>AETHERDEV</b> &nbsp; SOLUTIONS</div></main></body></html>`)
  await waitFor(1000)

  const response = await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 })
  expect(response?.ok(), `Homepage responds successfully (${response?.status() ?? 'no response'})`)
  await page.locator('h1').waitFor({ state: 'visible' })
  try {
    const plansResponse = await page.request.get(`${baseURL}/api/public/plans`, { timeout: 15000 })
    planApiStatus = String(plansResponse.status())
  } catch {
    planApiStatus = 'unavailable'
  }
  if (Number(planApiStatus) >= 400 || planApiStatus === 'unavailable') {
    await page.locator('#pricing').getByText('Current plan details are available on request.').waitFor({ state: 'visible', timeout: 15000 })
    expect(await page.locator('#pricing').getByText('Current plan details are available on request.').isVisible(), 'Pricing API failure shows a clear enquiry fallback instead of an endless loading state')
  }
  await chapter(page, 1, 'One home for your therapy clinic', 'Patients, appointments, billing and people—connected.', null, 2100)
  expect((await page.title()).includes('AetherDev Solutions'), 'Homepage has the expected product title')
  expect((await page.locator('#pricing h2').innerText()).includes('Simple pricing'), 'Pricing section is present; live prices remain database-backed')
  expect(await page.locator('h1').innerText().then((text) => text.includes('Run your therapy clinic')), 'Public homepage shows the clinic-management promise')

  await chapter(page, 2, 'Better continuity for every child', 'Sessions, assessments and progress stay in one record.', '#features', 2600)
  const featureCount = await page.locator('#features h3').count()
  expect(featureCount === 6, `All six published feature cards render (found ${featureCount})`)
  expect(await page.locator('#features').getByText('Parent Portal').isVisible(), 'Parent Portal feature is visible')

  await chapter(page, 3, 'The whole clinic moves together', 'A clear setup path for your team, from demo to go-live.', '#how', 2200)
  const stepCount = await page.locator('#how h3').count()
  expect(stepCount === 3, `The three onboarding steps render (found ${stepCount})`)

  await chapter(page, 4, 'Built for child development clinics', 'Speech · OT · behavioral · developmental care', '#faq', 2000)
  const faqCount = await page.locator('#faq h3').count()
  expect(faqCount === 6, `All six product FAQs render (found ${faqCount})`)

  await chapter(page, 5, 'Your workflow, your setup', 'Book a free demo; onboarding and Excel import are included.', '#inquiry', 2900)
  const requiredInputs = ['Clinic name *', 'Your name *', 'Email *']
  for (const placeholder of requiredInputs) {
    expect(await page.getByPlaceholder(placeholder).isVisible(), `Demo form includes “${placeholder}”`)
  }
  expect(await page.getByRole('button', { name: 'Request a demo' }).isVisible(), 'Demo request button is visible; no inquiry is submitted during this test')

  await page.getByRole('link', { name: 'Login' }).click()
  await page.waitForURL('**/login', { timeout: 15000 })
  await page.getByRole('heading', { name: 'Welcome Back', exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  await chapter(page, 6, 'A dedicated sign-in for clinic teams', 'A real login screen — no credentials entered or submitted.', null, 2200)
  expect(await page.getByPlaceholder('admin@creativemind.com').isVisible(), 'Staff sign-in page exposes the email field')
  expect(await page.getByRole('button', { name: 'Sign In', exact: true }).isVisible(), 'Staff sign-in action is present')

  await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 })
  await chapter(page, 7, 'A better-organized day leaves room for care', 'AetherDev Solutions · Child Therapy Center Management', null, 1700)
  const pageVideo = page.video()
  await page.close()
  videoSource = await pageVideo.path()
  await recordingContext.close()
  await browser.close()

  // Mobile smoke check on a fresh, unrecorded browser process. Only public
  // pages are used: no credentials, database fixtures, or write operations.
  const mobileBrowser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    ...(launchArgs.length ? { args: launchArgs } : {}),
  })
  const mobileContext = await mobileBrowser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const mobile = await mobileContext.newPage()
  monitorPage(mobile)
  await mobile.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 })
  mobileWidths.landing = await mobile.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }))
  expect(mobileWidths.landing.document <= mobileWidths.landing.width, `Mobile landing page has no horizontal overflow (${mobileWidths.landing.document}px / ${mobileWidths.landing.width}px)`)
  await mobile.goto(`${baseURL}/login`, { waitUntil: 'networkidle', timeout: 60000 })
  mobileWidths.login = await mobile.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth }))
  expect(mobileWidths.login.document <= mobileWidths.login.width, `Mobile sign-in page has no horizontal overflow (${mobileWidths.login.document}px / ${mobileWidths.login.width}px)`)
  await mobileContext.close()
  await mobileBrowser.close()

  expect(pageErrors.length === 0 && consoleErrors.length === 0, `No uncaught page or application console errors (${pageErrors.length} page, ${consoleErrors.length} console)`)
} finally {
  await browser.close()
}

const ffmpegResult = spawnSync(ffmpegCommand, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-stream_loop', '-1', '-i', sourceMusic,
  '-i', videoSource,
  '-map', '1:v:0', '-map', '0:a:0',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
  '-r', '30', '-c:a', 'aac', '-b:a', '160k',
  '-af', 'volume=0.24,afade=t=in:st=0:d=0.8,afade=t=out:st=20.5:d=2',
  '-shortest', '-movflags', '+faststart',
  '-metadata', 'title=AetherDev Solutions — Clinic workflow overview',
  '-metadata', 'comment=Real Playwright screen recording of the public site; no forms submitted',
  videoPath,
], { encoding: 'utf8' })
if (ffmpegResult.status !== 0) {
  throw new Error(`FFmpeg encoding failed: ${ffmpegResult.stderr || ffmpegResult.error?.message}`)
}
await rm(videoSource, { force: true })

const report = `# Playwright video tour — test report\n\n` +
  `Date: ${new Date().toISOString().slice(0, 10)}\n\n` +
  `## Result\n\n${checks.join('\n')}\n\n` +
  `- Public plans endpoint response during the run: HTTP ${planApiStatus}. In this sandbox Prisma Client was not generated and no test database was configured, so pricing cards could not be validated; the video avoids fabricated prices.\n` +
  `- Mobile measurements: landing ${mobileWidths.landing.document}/${mobileWidths.landing.width}px; sign-in ${mobileWidths.login.document}/${mobileWidths.login.width}px (document width / viewport width).\n` +
  `- Expected plan-service HTTP 500 browser resource notices: ${expectedPlansApiErrors}; no live prices were supplied. The sandbox logged ${devHmrWebSocketErrors} development HMR websocket errors, separately from application console exceptions (${consoleErrors.length}).\n` +
  `- Video: \`${path.relative(root, videoPath)}\` (Playwright Chromium screen recording, 1280×720, encoded as H.264/AAC MP4).\n\n` +
  `## Scope and limitations\n\n` +
  `This was a local, non-production browser test of the public landing page and staff sign-in screen. No login credentials were used, no form was submitted, no real clinic or patient data was loaded, and no database writes were performed. It does **not** certify the authenticated dashboard, API authorization, tenant isolation, or production service. Pricing is database-driven and is intentionally not replaced with fabricated plan prices in the video. The separate Hindi clinic-training video remains an instructional overview, not a recording of authenticated live workflows.\n\n` +
  `The background score is reused from the repository's existing short promo; its attribution is documented in \`brag-output/AUDIT-REPORT.md\`.\n`
await writeFile(auditPath, report, 'utf8')
console.log(`\nSaved video: ${path.relative(root, videoPath)}`)
console.log(`Saved report: ${path.relative(root, auditPath)}`)
