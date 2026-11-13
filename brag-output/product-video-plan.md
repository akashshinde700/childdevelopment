# AetherDev Solutions — product video plan

**Format:** 1280 × 720, landscape, H.264/AAC MP4; approximately 23 seconds.

**Source:** the repository's real public landing page and staff sign-in screen, captured in Chromium with Playwright. The video uses real site UI rather than illustrative redraws. On-screen captions are added for a clear, quick product story.

| Beat | Product moment |
|---|---|
| Hook | More time for care; less clinic administration |
| Features | Patients, therapy sessions, appointments, billing, HR and parent portal |
| Setup | The three-step demo-to-go-live process |
| Fit | FAQs for child-development and therapy clinics |
| CTA | Demo inquiry form (shown only; never submitted) |
| Access | Staff sign-in screen (no credentials entered) |
| Close | AetherDev Solutions brand and clinic-management promise |

**Safety and accuracy:** no production data, credentials, login attempt, or form submission. Live pricing is sourced from the database; the sandbox has no generated Prisma Client/test database, so pricing figures were deliberately not invented or shown. See `playwright-audit.md` for test results and scope.

**Audio:** existing promo score reused; attribution and license are in `AUDIT-REPORT.md`.

## Recreate

1. Start the app: `npm run dev -- --hostname 0.0.0.0`.
2. Install Playwright's Chromium and video tools if needed: `npx playwright install chromium` and `npx playwright install ffmpeg`.
3. Run `npm run video:tour` (set `BASE_URL` or `FFMPEG_PATH` to override defaults).
