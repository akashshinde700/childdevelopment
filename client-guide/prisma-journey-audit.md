# Sandbox patient journey — partial recording and audit

## Scope and setup

The recordings show the actual clinic UI connected to a separate experimental SQLite database through Prisma's driver adapter, not the project's original MySQL database. The original repository's MySQL schema and application database code were not changed. The SQLite schema was adapted and created using a custom DMMF-derived script, **not** a verified Prisma migration; SQLite behaviour, foreign keys, indexes and query compatibility may differ from MySQL. Do not treat this as a production-equivalent audit. All people, accounts and amounts are fictional. The isolated environment is still running for unfinished work.

## Recorded actions and results

- A fictional patient was registered through the UI; `POST /api/patients` returned 201 and the patient appeared in the list.
- A consultation appointment for the same patient was created through the UI; `POST /api/appointments` returned 201. No therapist was assigned to this appointment.
- A four-session package template was created (`POST /api/packages` 201), then assigned to the patient without scheduling package sessions (`PATCH /api/packages` 201).
- A separate planned therapy session was created for the patient and package (`POST /api/sessions` 201); it was not marked completed. The fictional therapist account/employee was seeded separately, not created in the recording.
- A ₹4,000 package invoice with ₹1,500 entered as cash payment was created (`POST /api/invoices` 201). The UI showed partially paid and ₹2,500 balance. This was a fictional entry, not a real transaction. Invoice details were opened; receipt generation/printing was not verified.
- Parent credentials were created and parent login succeeded. The parent portal showed the appointment, package and invoice summary. A reschedule request for the consultation was submitted (`POST .../reschedule-request` 201) and the UI showed it awaiting clinic confirmation. Clinic approval and actual rescheduling were not tested.

## Observations requiring follow-up

- In the parent overview, “Next Appointment” displayed 12:00 AM for a session whose appointment list showed 11:00–11:45. Reproduce against the unmodified MySQL application before classifying or fixing this as a production defect.
- Parent login triggered a `403` response to `/api/dashboard`, while the parent portal itself loaded. The cause and user-visible effect need further investigation.
- The invoice creation screen displayed package due ₹4,000 but its separate payment summary said pending ₹0 before the invoice was created. The fields may represent different concepts; verify their intended meaning before calling this a defect.

## Video and limitations

`prisma-actual-journey-partial.mp4` combines six actual-screen chapters and Hindi narration (4:14). Chapter files are in `prisma-chapters/`. Samples of the recorded screens were visually inspected, and the combined file was decoded with FFmpeg without errors; an automated volume check detected audio. Full playback/listening review has **not** been performed. Narration is placed approximately by scene; there is no verified synchronized subtitle track.

This is **not** the requested full training video or a full audit. Still missing: complete field-by-field module instruction; editing, cancellation, rescheduling approval and correction cases; session completion; receipt/print verification; parent review; receptionist, therapist, admin and accounts daily workflows; comprehensive responsive/overflow checks; full playback and audio review; and synced Hindi captions. The full workflow must be retested on a proper isolated MySQL-backed environment before production conclusions are made.

## Edited actual-screen version and additional viewport checks

`actual-journey-improved.mp4` (2:15) trims repeated logins and loading screens and has shorter scene-specific Hindi narration plus an optional Hindi subtitle track; chapter clips and timings are in `improved-chapters/CHAPTERS.md`. Subtitle cues are estimated proportionally within each narrated segment, **not** forced-aligned or human-verified; narration and captions may not precisely match each action or syllable. FFmpeg decoded the file without errors and reports H.264 video, AAC audio and a Hindi subtitle stream; full playback/listening and caption review are still pending. This is a shorter edit of the same partial workflows, not new completed workflows.

On the experimental SQLite sandbox, Chromium measured Dashboard, Patients, Appointments, Packages, Sessions and Billing at viewport widths 320, 375, 768 and 1280 pixels, height 800. Document width matched viewport in all 24 checks. Main-area scroll width exceeded client width for Dashboard at 320 (348 vs 320), Patients at 320/375/768 (631/320, 631/375, 843/768), and Sessions at 320 (370 vs 320). The main area has `overflow-x: auto`, so some horizontal scrolling is available; nested scrollable tables also exist. At 320px the Patients header actions extend beyond the visible right edge, and the Sessions screen shows overlapping/obscured content in the initial viewport; further interaction testing is needed. The sandbox's fixed warning banner itself covers part of the lower mobile viewport and is not part of the original app. Screenshots at 320 and 1280 were captured for each page; the 320 Dashboard, Patients, Sessions and Packages screenshots were visually sampled. No browser `pageerror` events were recorded during these checks. Form validation, keyboard, screen reader, additional states and other pages were not comprehensively tested.

## Added workflow recordings (subsequent pass)

The expanded video `actual-journey-expanded.mp4` (2:55) adds three actual-screen clips to the edited walkthrough:

- Staff accepted the parent's reschedule request in Appointments with a reason. The API returned 200 for the appointment update. A subsequent sandbox database read showed request status `approved` and the appointment moved to 21 Nov at 11:00; parent portal showed the new time.
- The planned speech session was marked complete through the session UI with a fictional note. The API returned 200; a sandbox database read showed both the linked session and appointment completed, and the package counter at 1 of 4. This one case is not evidence that all completion/reversal paths work.
- The parent selected a five-star rating, entered a fictional review, and submitted it. The review endpoint returned 200 and the UI showed the review and confirmation.

The earlier sections of this report describe the state before these additional tests. Receipt printing, workflow corrections, role-wise training, and comprehensive audit remain unfinished. Print Settings opened for INV-0001, but neither invoice printing nor a payment receipt was generated or verified. The SQLite conversion remains experimental. The expanded MP4 has scene narration and an optional estimated Hindi subtitle track; FFmpeg successfully decoded it, but no full listening, forced alignment or end-to-end playback review was performed.

## Further workflow recordings and checks

The later `actual-journey-training.mp4` (5:02) appends actual-screen clips, with Hindi narration and estimated subtitle cues, to the previous expanded video:

- The billing screen's **Save PDF** / **Without Header/Footer** flow downloaded INV-0001. The resulting one-page PDF was rendered and visually sampled: ₹4,000 total, ₹1,500 paid and ₹2,500 due. It is an invoice, not a separate receipt.
- The fictional patient's city was edited through the Patients form; the PUT returned 200 and its response included the changed city.
- Fictional receptionist, therapist and clinic-admin accounts navigated to their shown menus. This is navigation coverage, not a full daily role-workflow or permission audit. Receptionist requests to `/api/employees` and `/api/sessions`, and therapist requests to `/api/employees` and `/api/payments`, returned 403 while browsing; whether those responses are expected or cause an actionable defect needs investigation. The project's built-in `UserRole` list does not include a fixed accounts role; a custom role may exist, but was not configured or verified.
- A separate fictional patient's appointment was cancelled through the UI with a reason; the update returned 200 and the list showed Cancelled.
- A separate fictional receipt-type billing entry (INV-0002, ₹500 paid for a seeded demonstration service) was created and its PDF downloaded. The PDF is headed **INVOICE**, with invoice type **Receipt**, and shows ₹500 paid and ₹0 balance. A direct read of the sandbox SQLite database found **zero Payment rows linked to INV-0002**, despite the invoice's paid amount; investigate whether this is an intended design or a discrepancy and reproduce on the unmodified MySQL-backed application. The PDF itself is image-based and was visually sampled, not text-extracted. It is a separate test, not the original Meera package's final receipt.

The newer video was decoded without errors by FFmpeg, but full manual listening/playback, exact subtitle alignment and mobile playback testing are still incomplete. Screen navigation for roles is not a substitute for tested day-in-the-life workflows; editing and cancellation cover only one example each. Many fields, variants, billing corrections and permissions remain untested. The MySQL original is unchanged; the isolated SQLite sandbox remains in use for any unfinished work.

## Further module overview recordings

`clinic-screen-training.mp4` (6:53) appends actual sandbox screens for Patient History, Assessments, Employees, Attendance, Leave, Expenses, Reports, Settings, User Management and Payroll. The assessment, employee, leave and expense forms were opened and inspected, then closed without submitting; no corresponding records or payroll were created or processed in these clips. These are overviews, not field-by-field verified procedures or complete daily role workflows. Several brief segments freeze the last actual screen while narration finishes; they are not continuous screen captures of the entire narrated period.

The combined file decoded with FFmpeg and contains video, audio and an optional Hindi subtitle stream. Captions were timed by proportional text length within each narration clip, not aligned by listening. The new module captures had no page errors or HTTP responses of 400 or above recorded, but navigation alone does not prove saves, permissions, values or exports work. Human audio listening, comprehensive playback, exact captions and responsive playback testing are still required. Earlier sections preserve the results and limitations of the earlier versions.

## Saved-form tests (later pass)

`clinic-training-saved-tests.mp4` (7:48) appends actual recordings of four saves to the prior overview. The earlier overview says those forms were not saved **at that time**; the new clips show subsequent saves in the same isolated fictional-data sandbox.

- Assessment: preconfigured fictional assessment type, patient Meera Demo, 24 November at 13:30 and Neha Demo. POST returned 201, and the list showed Scheduled. SQLite re-read confirmed the saved values.
- Employee: fictional Kiran Demo was created; POST returned 201, the list showed EMP-0004, and a SQLite re-read confirmed the record and that no login was created.
- Leave: one-day casual leave request for Kiran Demo was created; POST returned 201, list and SQLite re-read showed Pending, not approved.
- Expense: fictional Demo Vendor, ₹300, cash, was created; POST returned 201, list and SQLite re-read showed Pending, not approved or an actual payment.
- A new browser session revisited all four pages after the writes and found the corresponding rows. These checks used one happy path for each form; edits, invalid inputs, approvals, payroll processing, permission enforcement and alternate states are not comprehensively tested.

The video decodes with FFmpeg and contains H.264, AAC and a Hindi subtitle stream. Subtitle cues remain estimated and the complete audio/playback has not been reviewed by a person. This is an improved partial actual-screen walkthrough, **not** the fully verified, detailed course originally requested. The SQLite sandbox was used; these results do not validate the original MySQL backend. The original repository's MySQL schema and database code remain unchanged.

## Approval, validation and playback checks (latest pass)

`clinic-training-updated.mp4` (8:30) appends three actual-screen examples. A test leave was reset to pending directly in the isolated SQLite database for re-recording, then approved through the UI: the endpoint returned 200, the row showed Approved and remaining balance 11, and a SQLite read confirmed approved status. This does not validate other leave balances or employee permissions.

**High-priority expense discrepancy:** a fictional ₹300 pending expense with zero GST was approved via the actual UI. The PUT returned 200, but the UI and SQLite record then showed `amount = 300`, `gst = 0`, and `totalAmount = 0`. This was reproduced in the experimental SQLite sandbox. Review of the unmodified source `src/app/api/expenses/route.ts` lines 136–145 shows `totalAmount` is recalculated from `data.amount` and `data.gst`, defaulting both to zero, even on a status-only update. That code path is database-independent, but it has **not** been reproduced on a MySQL deployment and should be verified and fixed before relying on expense approvals. No application code was modified in this video task.

Submitting a blank new-patient form displayed required-field messages for name, gender, date of birth and mobile; the browser recorded no patient POST. This is one negative case, not comprehensive input validation.

Headless Chromium started the updated MP4 at viewport widths 320, 375, 768 and 1280 (height 800); playback time advanced to about 4 seconds and document width matched each viewport. Playback was muted, only the opening seconds were exercised, and embedded subtitle tracks were not exposed by the browser's HTML video element in this test (`textTracks.length = 0`). The standalone SRT is provided, but its approximate timings and player compatibility need manual verification. Full human audio listening, full-duration playback and complete role-by-role task testing remain undone. SQLite remains an experimental approximation, not production MySQL.

## Subsequent expense fix (sandbox verification)

The expense PUT handler preserves the total for status-only updates, recalculates partial amount/GST updates using the persisted counterpart, accepts zero, rejects invalid monetary values, and ignores a client-supplied total. `scripts/test-expense-updates.mjs` passed against isolated SQLite: approval, rejection, partial updates, zero, and invalid inputs. UI verification approved a fictional ₹300 expense; its ₹300 total remained visible after approval and reload. The earlier warning footage documents pre-fix behavior. No existing records were repaired. This synthetic subset and custom SQLite schema are not the user's complete database or validation of MySQL migrations or production data. MySQL integration and historical-record review remain necessary.

`clinic-training-fixed.mp4` appends the retest. FFmpeg decoded the whole file, but full human playback/audio review and accurate subtitle timing are unfinished; browser subtitle support remains unverified. This is not a complete beginner course or comprehensive database audit.
