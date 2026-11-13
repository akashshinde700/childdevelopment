# Playwright video tour — test report

Date: 2026-11-13

## Result

- PASS — Homepage responds successfully (200)
- PASS — Pricing API failure shows a clear enquiry fallback instead of an endless loading state
- PASS — Homepage has the expected product title
- PASS — Pricing section is present; live prices remain database-backed
- PASS — Public homepage shows the clinic-management promise
- PASS — All six published feature cards render (found 6)
- PASS — Parent Portal feature is visible
- PASS — The three onboarding steps render (found 3)
- PASS — All six product FAQs render (found 6)
- PASS — Demo form includes “Clinic name *”
- PASS — Demo form includes “Your name *”
- PASS — Demo form includes “Email *”
- PASS — Demo request button is visible; no inquiry is submitted during this test
- PASS — Staff sign-in page exposes the email field
- PASS — Staff sign-in action is present
- PASS — Mobile landing page has no horizontal overflow (390px / 390px)
- PASS — Mobile sign-in page has no horizontal overflow (390px / 390px)
- PASS — No uncaught page or application console errors (0 page, 0 console)

- Public plans endpoint response during the run: HTTP 500. In this sandbox Prisma Client was not generated and no test database was configured, so pricing cards could not be validated; the video avoids fabricated prices.
- Mobile measurements: landing 390/390px; sign-in 390/390px (document width / viewport width).
- Expected plan-service HTTP 500 browser resource notices: 3; no live prices were supplied. The sandbox logged 0 development HMR websocket errors, separately from application console exceptions (0).
- Video: `brag-output/product-walkthrough.mp4` (Playwright Chromium screen recording, 1280×720, encoded as H.264/AAC MP4).

## Scope and limitations

This was a local, non-production browser test of the public landing page and staff sign-in screen. No login credentials were used, no form was submitted, no real clinic or patient data was loaded, and no database writes were performed. It does **not** certify the authenticated dashboard, API authorization, tenant isolation, or production service. Pricing is database-driven and is intentionally not replaced with fabricated plan prices in the video. The separate Hindi clinic-training video remains an instructional overview, not a recording of authenticated live workflows.

The background score is reused from the repository's existing short promo; its attribution is documented in `brag-output/AUDIT-REPORT.md`.
