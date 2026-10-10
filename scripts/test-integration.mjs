/* End-to-end integration test against a LIVE Supabase project.
   Requires the same env vars used by the API:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
   Optional (improves the RLS check): SUPABASE_ANON_KEY (the public publishable key).
   Skips with a warning when env is missing. Example:
       $env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..." ; npm run test:integration

   Covers: RLS blocks direct client reads, enquiry insert + dedupe,
   stats RPC runs, rate-limit + audit tables usable, sample cleanup. */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.warn(
    "SKIPPED: integration tests need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."
  );
  process.exit(0);
}

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
// A client with a non-privileged key: the real anon key when provided, else a
// bogus key (both must be blocked from direct reads — anon by RLS, bogus by auth).
const lowPriv = createClient(url, anonKey || "anon-placeholder-does-not-exist", {
  auth: { autoRefreshToken: false, persistSession: false },
});

let passed = 0;
const ok = (m) => {
  passed++;
  console.log(`  ok    ${m}`);
};

console.log("== Integration test: " + new URL(url).host + " ==");

// 1) stats RPC is callable by service role
const { data: stats, error: statsErr } = await service.rpc("stats_overview", {
  src: new Date(Date.now() - 30 * 86400000).toISOString(),
  dst: new Date().toISOString(),
});
assert.ok(!statsErr, `stats_overview error: ${statsErr?.message}`);
assert.ok(stats && typeof stats === "object", "stats_overview returned an object");
ok("stats_overview RPC runs");

// 2) RLS: direct client read of enquiries is blocked.
// PostgREST returns an empty array (not an error) when RLS filters a read,
// so "no rows AND no error" is the expected safe outcome; an error is fine too.
const direct = await lowPriv.from("enquiries").select("*").limit(1);
const leaked = Array.isArray(direct.data) ? direct.data.length : direct.data ? 1 : 0;
assert.ok(direct.error || leaked === 0, "RLS must block direct anon reads of enquiries");
ok("direct client reads of enquiries are blocked");

// 3) insert a sample enquiry, then dedupe the exact duplicate
function payloadKey(p) {
  return `${p.phone}|${p.message}`;
}
const payload = {
  full_name: "Integration Test User",
  phone: "919999999991",
  email: "it@example.in",
  event_type: "Wedding",
  event_date: "2027-01-01",
  guest_count: 250,
  message: `integration-test ${Date.now()}`,
  consented_to_contact: true,
  lead_source: "website",
  services: ["Hall A"],
};
payload.dedupe_key = createHash("sha256").update(payloadKey(payload)).digest("hex");

const { data: inserted, error: insErr } = await service
  .from("enquiries")
  .insert({ ...payload, dedupe_key: payload.dedupe_key })
  .select("id")
  .maybeSingle();
assert.ok(!insErr, `insert error: ${insErr?.message}`);
assert.ok(inserted && inserted.id, "insert returned an id");
ok("service-role insert works");

const { data: dupRow, error: dupErr } = await service
  .from("enquiries")
  .upsert({ ...payload, dedupe_key: payload.dedupe_key }, { onConflict: "dedupe_key", ignoreDuplicates: true })
  .select("id")
  .maybeSingle();
assert.ok(!dupErr, `dedupe insert error: ${dupErr?.message}`);
assert.equal(dupRow, null, "duplicate row was ignored (idempotent, mirrors the API)");
ok("duplicate enquiry is ignored (unique dedupe_key)");

// 4) rate-limit + audit + status-history tables exist and are usable
for (const table of ["submission_rate_limits", "admin_audit_log", "enquiry_status_history"]) {
  const { error } = await service.from(table).select("id").limit(1);
  assert.ok(!error, `${table}: ${error?.message}`);
}
ok("rate-limit + audit + status-history tables usable");

// 5) cleanup the sample row so the DB is left clean
const { error: delErr } = await service.from("enquiries").delete().eq("id", inserted.id);
assert.ok(!delErr, `cleanup delete error: ${delErr?.message}`);
ok("cleanup removed sample enquiry");

console.log(`\nINTEGRATION PASSED (${passed} checks)`);