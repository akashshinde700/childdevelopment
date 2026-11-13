# Full product demo — Playwright audit

Run date: 2026-11-13

## Results

- PASS — Dashboard opens with isolated fictional demo state
- PASS — Patients opens the patients module from the live sidebar
- PASS — Fictional child record appears in the patient list
- PASS — Appointments opens the appointments module from the live sidebar
- PASS — Appointments screen loads with the demo schedule
- PASS — Packages opens the packages module from the live sidebar
- PASS — Package screen shows a clearly fictional demo package
- PASS — Therapy Sessions opens the sessions module from the live sidebar
- PASS — Session page loads fictional patient context
- PASS — Billing & Invoices opens the billing module from the live sidebar
- PASS — Billing page shows an isolated fictional invoice
- PASS — Employees opens the employees module from the live sidebar
- PASS — Team page shows synthetic employee records
- PASS — Attendance opens the attendance module from the live sidebar
- PASS — Attendance screen loads with demo staff
- PASS — Reports opens the reports module from the live sidebar
- PASS — Reports module loads with the synthetic clinic dataset
- PASS — Parent portal opens with the linked fictional child profile
- PASS — No API write requests were attempted (0)
- PASS — No uncaught browser/page console exceptions (0 page, 0 console)

- Protected API calls were intercepted with fictional in-memory fixtures; mutating HTTP methods were blocked.
- Test write attempts: 0. Page exceptions: 0. Application console errors: 0. Dev HMR websocket errors: 0.
- Output: `brag-output/full-product-demo.mp4` (actual React pages, 1280×720, H.264/AAC).

## Accuracy and privacy

This is a **read-only visual product demo**, not a production E2E/security certification. The browser storage includes a fictional local demo role; every `/api/*` GET was intercepted before reaching the application server and all non-GET methods were denied. Names and records are fictional, emails use `.test`, and phone fields use zeros. The parent view switches to a separate fictional local session. No user password was used, no form was submitted, and no database operation was performed.

Live pricing, real authentication, tenant isolation, and persistent data writes were not tested. The video uses the real app frontend with synthetic API fixture data; it must not be represented as production patient data or a live-clinic recording.
