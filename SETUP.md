# Akshaya Milan — Production Backend Setup

This adds a persistent database, an authenticated admin dashboard and privacy-conscious
analytics to the static Akshaya Milan site, served from Vercel serverless functions and
Supabase. The public site design is unchanged.

## Architecture at a glance

| Layer | Tech |
| --- | --- |
| Hosting | Vercel (static files + `api/` serverless functions + edge `middleware.js`) |
| Database | Supabase Postgres (`enquiries`, `visitor_sessions`, `page_views`, `admin_users`, `enquiry_status_history`, `submission_rate_limits`, `admin_audit_log`) |
| Auth | Supabase Auth (email + password) for admins only; custom httpOnly cookies `am_at` / `am_rt` |
| Admin | `/admin` dashboard (stat cards, charts, enquiries/leads, exports, team, retention) |
| Analytics | Consent-first; nothing tracked until the visitor accepts the banner |

Key rules:

- The **service role key never enters the browser** — it is used only in server functions.
- **RLS is enabled** on every table with **no anon policies**. Visitors write through
  validated server routes; admins are resolved server-side via `is_admin()`/`is_owner()`.
- **No raw IP addresses are stored.** Rate limiting keeps only `sha256(ip|user-agent)` hashes.
- Anonymous analytics sessions are never linked to enquiries.
- If the database is unavailable, public enquiry forms **fall back to WhatsApp** so
  submissions are never lost.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com) (any region is fine).
2. Open **SQL Editor** and run, in order:
   - `supabase/migrations/0001_initial.sql`
   - `supabase/migrations/0002_stats_rpc.sql`
   - `supabase/migrations/0003_fix_dedupe.sql`
   - `supabase/migrations/0004_dedupe_constraint.sql`

   Or apply them from the CLI with a direct connection string (migrations run inside
   transactions and skip already-applied steps):

   ```bash
   $env:DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres"
   node scripts/db-apply.mjs
   node scripts/db-smoke.mjs   # verifies tables, RLS, dedupe and the stats RPC
   ```
3. Open **Authentication → Providers → Email** and enable **Email** sign-in
   (we only use email/password; keep "Confirm email" enabled if you want confirmation emails
   before the first admin signs in).
4. From **Project Settings → API** copy:
   - Project URL → `SUPABASE_URL`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY` (**never** share this)
   - `anon` public key → `SUPABASE_ANON_KEY`

## 2. Configure Vercel environment variables

Settings → Environment Variables, for Preview and Production:

| Variable | Notes |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret (server-only) |
| `SUPABASE_ANON_KEY` | Optional, anon key |
| `ADMIN_BOOTSTRAP_TOKEN` | Long random secret, e.g. `openssl rand -hex 32` |
| `ANALYTICS_RETENTION_DAYS` | Default `180` |
| `SITE_URL` | `https://akshaya-milan.vercel.app` |

For local development copy `.env.example` → `.env.local` and fill in values for `vercel dev`.

## 3. Bootstrap the first admin (owner)

The dashboard has **no registration page** and no hardcoded credentials. The first admin is
created via a one-time trusted server call that requires the bootstrap token **and** an empty
`admin_users` table:

```bash
curl -X POST https://akshaya-milan.vercel.app/api/auth/setup \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: <ADMIN_BOOTSTRAP_TOKEN>" \
  -d '{"email":"you@example.in","password":"<12+ char password>","display_name":"Admin"}'
```

Expected: `{"ok":true,"message":"Owner account created."}`. Subsequent calls return 403
(an owner already exists). Log in at `https://akshaya-milan.vercel.app/admin/login.html`.

> Keep the bootstrap token secret. Change it in Vercel env vars after setup if you like —
> it is no longer required once an owner exists.

## 4. Deploy

Push to `master` — Vercel auto-deploys. The deploy must run `npm install` (the `vercel.json`
install override was removed). First deploy may take a minute to install
`@supabase/supabase-js` and `exceljs`.

Verify after deploy:

```
GET  /                       -> 200 (public site)
GET  /admin/login.html       -> 200
POST /api/enquiries/submit   -> 503 {"degraded":true} if env missing, later 201 on success
```

Run the integration suite once the project env is wired (requires env vars in your shell):

```bash
$env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run test:integration
```

## 5. How do things work?

### Public enquiry submission
`enquiry.html` (multi-step), the homepage booking form and `contact.html` submit JSON to
`POST /api/enquiries/submit`. Flow: honeypot + `request_time_ms` anti-bot checks → rate limit
(5/hour/IP) → server-side validation → de-duplication (unique `dedupe_key` from
`sha256(phone|message)`, enforced by a UNIQUE constraint on `dedupe_key`
(migration 0004; 0003 converted the initial partial index to a non-partial unique
index, then 0004 moved it to a proper constraint so PostgREST accepts it as an
`on_conflict` target) → upsert. Success is
reported **only** after the DB confirms. Failures: 4xx shows an inline error and allows a
retry; 5xx/network falls back to opening WhatsApp with the same message.

### Admin authentication
`POST /api/auth/login` validates against Supabase Auth and sets two httpOnly cookies
(`am_at` 2h, `am_rt` 14d). `/api/auth/session` refreshes via `setSession` and returns the
admin profile; `/api/auth/logout` revokes the session and clears cookies. Every admin API
route calls `requireAdmin` (token verified with Supabase + `admin_users` + `is_active` +
optional role). The edge `middleware.js` only adds a cookie-presence gate for page UX —
**real auth is always enforced by the APIs**.

Authorization matrix:

| Action | Owner | Staff |
| --- | --- | --- |
| View dashboard / enquiries / analytics / exports | ✓ | ✓ |
| Update enquiry status / notes / assignment | ✓ | ✓ |
| Export with internal notes | ✓ | ✗ |
| Manage team members (add, change role/active) | ✓ | ✗ |
| Purge analytics (retention) | ✓ | ✗ |

### Analytics & privacy
`assets/js/analytics.js` shows a consent banner once. Only on **Accept** does it start sending
page views and engagement beacons to `/api/analytics/track`. `am_consent` records the choice;
each visit gets a pseudonymous `am_session` (30-min sliding). Device/browser/OS are derived
server-side from the User-Agent; raw IPs are never stored. Decline/ignore = no tracking.
`privacy.html` explains the policy and controls. Retention purge is in the dashboard
Settings → Data retention.

### Exports
Reports → Export CSV / Excel builds a workbook server-side (`exceljs`), with
formula-injection protection (cells starting `= + - @` are escaped). Notes are only included
for owner accounts. Files are served as true attachments with `Content-Disposition`.

## 6. Maintenance & security notes

- Rotate `ADMIN_BOOTSTRAP_TOKEN` and any admin passwords via Supabase dashboard.
- Add admins from **Settings → Team** (owner only). Passwords live only in Supabase Auth.
- Backups: enable Supabase **PITR / scheduled backups** for the project.
- The `submission_rate_limits` table only keeps hashes; old rows can be safely deleted.
- Keep `supabase/migrations/` versioned — run new migrations via the SQL Editor in order.

## 7. Local checks

```bash
npm install
npm run check        # syntax + wiring + leak scans
npm test             # 24 unit tests (validate/exporters/ua/range/http)
npm run test:integration   # needs live Supabase env (REST)
node scripts/db-smoke.mjs  # needs DATABASE_URL (direct SQL, RLS/dedupe/stats)
```

## Files you may want to touch

- `assets/js/analytics.js` — banner text, session window
- `admin/js/admin.js` — dashboard UI
- `.env.example` / Vercel env — configuration
- `supabase/migrations/` — schema (repeat migrations in order)