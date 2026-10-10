/* POST /api/enquiries/submit — public enquiry intake.
   Validates server-side, rate-limits, de-duplicates, persists to Supabase and
   only reports success after the database confirms the insert. */

import { methodGuard, parseBody, fail, ok, json, clientIp, userAgent } from "../_lib/http.mjs";
import { db, hasBackend } from "../_lib/db.mjs";
import { validateEnquiry, dedupeKey } from "../_lib/validate.mjs";
import { keyHash, checkRate } from "../_lib/rate-limit.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try {
    body = await parseBody(req);
  } catch (err) {
    return fail(res, 400, "Invalid request body.");
  }

  // Honeypot: hidden field that humans never fill.
  if (body.hp_field && String(body.hp_field).trim() !== "") {
    return ok(res, { accepted: false, reason: "spam", message: "Enquiry could not be submitted." });
  }

  // Without a configured database the site degrades gracefully: the client
  // falls back to the WhatsApp channel so enquiries are never silently lost.
  if (!hasBackend()) {
    return json(res, 503, { ok: false, degraded: true, error: "Backend not configured." });
  }

  const ip = clientIp(req);
  const ua = userAgent(req);
  const rate = await checkRate("enquiry", ip, ua);
  if (!rate.allowed) {
    return json(res, 429, {
      ok: false,
      error: "Too many enquiries. Please wait a minute and try again.",
      retry_after: Math.ceil(rate.retryAfter / 1000),
    });
  }

  const result = validateEnquiry(body);
  if (!result.ok) {
    return json(res, 422, { ok: false, errors: result.errors });
  }

  const d = result.data;
  const row = {
    full_name: d.full_name,
    phone: d.phone,
    email: d.email,
    event_type: d.event_type,
    event_date: d.event_date,
    guest_count: d.guest_count,
    message: d.message,
    lead_source: d.lead_source,
    status: "new",
    consented_to_contact: d.consent,
    submitted_from: d.submitted_from || null,
    request_time_ms: d.request_time_ms || 0,
    services: d.services && d.services.length ? d.services : null,
    range: d.range || null,
    time: d.time || null,
    dedupe_key: dedupeKey(d.phone, d.message || ""),
  };

  if (d.consent === false) {
    return json(res, 422, {
      ok: false,
      errors: { consent: "Please agree to be contacted before submitting." },
    });
  }

  try {
    const { data: inserted, error } = await db()
      .from("enquiries")
      .insert(row, { onConflict: "dedupe_key", ignoreDuplicates: true })
      .select("id, created_at")
      .maybeSingle();

    if (error) throw error;

    // ignoreDuplicates + onConflict: when the exact duplicate already exists
    // no row is returned -> idempotent success.
    if (!inserted || !inserted.id) {
      return json(res, 200, { ok: true, accepted: true, duplicate: true, id: null });
    }

    return json(res, 201, {
      ok: true,
      accepted: true,
      id: inserted.id,
      created_at: inserted.created_at,
      message:
        "Thank you — your enquiry has been received. Our team will contact you within 24 hours.",
    });
  } catch (err) {
    console.error("[enquiries/submit]", err.message);
    return json(res, 500, {
      ok: false,
      degraded: true,
      error: "We could not save your enquiry right now. Please use WhatsApp or call us.",
    });
  }
}