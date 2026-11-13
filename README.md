# AetherDev Solutions — LIVE (legacy) snapshot

Read-only snapshot of the code **currently running in production** at
`https://www.aetherdevsolutions.in`, taken so that the live system is no longer
a single point of failure.

## Why this repo exists

The production server had **no git repository at all**. The application was
deployed by SFTP file-copy (`deploy.py` + paramiko), so the only copy of this
code was the server's own disk — no history, no branches, no rollback, no
backup. This repo is that missing backup.

## What this is / is not

- **Is:** the source as deployed (`src/`, `prisma/`, `scripts/`, config files).
- **Is not:** a place to develop. Active development happens in the newer
  rewrite. Treat this as reference for business logic that the rewrite has not
  reimplemented yet.

## Deliberately excluded

Never fetched from the server, and ignored here:

- `.env` — database URL, SMTP credentials, platform admin password
- `public/uploads/` — patient documents, employee documents, expense bills
- `.sessions/`, `.platform-sessions/`, `.platform-otp/` — live session + OTP state
- `node_modules/`, `.next/`

## Production shape (for reference)

- Next.js standalone, run under PM2 as process `aetherdev`
- Listens on port **5000** (port 3000 on that host belongs to another site)
- MySQL, schema applied with `prisma db push` (no migration history)
- Root: `/home/aetherdevsolutions/htdocs/www.aetherdevsolutions.in`

## Known issues in this snapshot

- `prisma/seed-users.ts` and `prisma/seed.ts` contain hardcoded demo passwords
  (`admin123`, `therapist123`, …). If either was ever run against the
  production database, those accounts are live with those passwords and must
  be changed.
- Runtime data (`.sessions/`, `.platform-sessions/`, `.platform-otp/`,
  `public/uploads/`) is written under `.next/standalone/` (the process cwd),
  so an in-place `next build` deletes it. `deploy.py` builds in a staging dir
  and copies that data across; never rebuild in htdocs by hand.

## Deploying

`deploy.py` reads credentials from `deploy_config.json` (gitignored).

    python deploy.py --check      # read-only live status
    python deploy.py              # staged build, swap, restart, auto-rollback on failure
    python deploy.py --rollback   # restore the previous release
