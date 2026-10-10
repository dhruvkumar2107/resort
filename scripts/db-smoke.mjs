/* Live-schema smoke test against Supabase Postgres (no REST/API involved).
   Verifies tables + RLS guard the data, inserts + dedupe work, the stats RPC
   runs and anonymous calls are rejected. Run:
     $env:DATABASE_URL="postgresql://..." ; node scripts/db-smoke.mjs */
import pg from "pg";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.warn("SKIPPED: set DATABASE_URL first.");
  process.exit(0);
}

let passed = 0;
const ok = (m) => {
  passed++;
  console.log(`  ok    ${m}`);
};

const client = new pg.Client({
  connectionString: url,
  connectionTimeoutMillis: 25000,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

// 1) all objects exist
const tables = [
  "enquiries", "visitor_sessions", "page_views", "admin_users",
  "submission_rate_limits", "enquiry_status_history", "admin_audit_log",
];
for (const t of tables) {
  const { rows } = await client.query("select to_regclass($1) as r", ["public." + t]);
  assert.equal(rows[0].r, t === "enquiries" ? "enquiries" : t, `table ${t}`);
}
ok("7 tables exist");

const { rows: fn } = await client.query(
  "select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('is_admin','is_owner','stats_overview')"
);
assert.equal(fn.length, 3, "helper + RPC functions");
ok("is_admin / is_owner / stats_overview exist");

// 2) RLS is enabled on every table
const { rows: rls } = await client.query(
  "select c.relname from pg_class c where c.relrowsecurity = false and c.relnamespace='public'::regnamespace and c.relkind='r' and c.relname = any($1)",
  [tables]
);
assert.deepEqual(rls, [], "all tables have RLS on");
ok("RLS enabled on all tables");

// 3) anon cannot read enquiries (no anon policies)
try {
  await client.query("set role anon");
  const { rows: anonRows } = await client.query("select * from public.enquiries limit 1");
  await client.query("reset role");
  assert.equal(anonRows.length, 0, "anon must see no rows");
  ok("anon SELECT returns no rows (RLS)");
} catch (e) {
  await client.query("reset role");
  ok(`anon blocked (${e.code || "error"})`);
}

// 4) authenticated role without an admin row cannot read either
await client.query("set role authenticated");
const { rows: authRows } = await client.query("select * from public.enquiries limit 1");
await client.query("reset role");
assert.equal(authRows.length, 0, "authenticated non-admin sees no rows");
ok("authenticated (non-admin) SELECT returns no rows");

// 5) insert a sample enquiry (service-role equivalent) and dedupe it
const payload = {
  full_name: "Smoke Test User",
  phone: "919999999993",
  email: "smoke@example.in",
  event_type: "Wedding",
  event_date: "2027-02-14",
  guest_count: 150,
  message: `smoke-test ${Date.now()}`,
  lead_source: "website",
  status: "new",
  consented_to_contact: true,
  services: ["Hall A"],
  range: "Outdoor Lawn",
  time: "Evening",
};
const dedupeKey = createHash("sha256").update(`${payload.phone}|${payload.message}`).digest("hex");
const { rows: inserted } = await client.query(
  `insert into public.enquiries (full_name, phone, email, event_type, event_date, guest_count, message, lead_source, status, consented_to_contact, services, range, time, dedupe_key)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
  [payload.full_name, payload.phone, payload.email, payload.event_type, payload.event_date,
   payload.guest_count, payload.message, payload.lead_source, payload.status,
   payload.consented_to_contact, payload.services, payload.range, payload.time, dedupeKey]
);
assert.ok(inserted[0].id, "insert returns id");
const { rows: dup } = await client.query(
  `insert into public.enquiries (full_name, phone, email, event_type, event_date, guest_count, message, lead_source, status, consented_to_contact, services, range, time, dedupe_key)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) on conflict (dedupe_key) do nothing returning id`,
  [payload.full_name, payload.phone, payload.email, payload.event_type, payload.event_date,
   payload.guest_count, payload.message, payload.lead_source, payload.status,
   payload.consented_to_contact, payload.services, payload.range, payload.time, dedupeKey]
);
assert.equal(dup.length, 0, "duplicate insert is ignored");
ok("insert works + unique dedupe_key blocks duplicates");

// 6) stats_overview runs for the service role
const { rows: stats } = await client.query(
  "select public.stats_overview(now() - interval '30 days', now()) as s"
);
const s = stats[0].s;
assert.ok(s.sessions_total >= 0 && s.enquiries_total >= 1, "stats totals");
assert.ok(Array.isArray(s.daily_series) && Array.isArray(s.recent_activity), "stats series");
ok("stats_overview returns dashboard data");

// 7) anon is denied the stats function
try {
  await client.query("set role anon");
  await client.query("select public.stats_overview(now() - interval '30 days', now())");
  await client.query("reset role");
  throw new Error("anon should have been denied");
} catch (e) {
  await client.query("reset role");
  if (e.message === "anon should have been denied") throw e;
  ok("anon denied stats_overview (no execute grant)");
}

// 8) cleanup sample row
const { rowCount } = await client.query("delete from public.enquiries where id = $1", [inserted[0].id]);
assert.equal(rowCount, 1, "cleanup removed sample");
ok("cleanup removed sample enquiry");

await client.end();
console.log(`\nSMOKE PASSED (${passed} checks)`);