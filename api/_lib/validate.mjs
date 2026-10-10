/* Server-side validation for enquiry submissions. */
import { createHash } from "node:crypto";

export const STATUSES = [
  "new", "contacted", "follow_up", "site_visit_scheduled", "converted", "lost",
];

const clean = (v, max) =>
  String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 500);

export function normalizePhone(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("+91")) s = s.slice(3);
  else if (s.startsWith("91") && s.length === 12) s = s.slice(2);
  else if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  s = s.replace(/\D/g, "");
  if (!/^\d{10}$/.test(s)) return null;
  return "91" + s;
}

export function normalizeEmail(raw) {
  const v = clean(raw, 254).toLowerCase();
  if (!v) return ""; // email is optional -> empty string means "not provided"
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return null;
  return v;
}

export function normalizeDate(raw) {
  const v = clean(raw, 10);
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2020 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return v;
}

export function guestCount(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 99999) return null;
  return n;
}

/**
 * Validate a complete enquiry payload. Returns { ok, errors, data }.
 */
export function validateEnquiry(body, { requireName = true } = {}) {
  const errors = {};

  const full_name = clean(body.full_name || body.name, 120);
  if (!full_name || (requireName && full_name.length < 2)) {
    errors.full_name = "Please enter your full name.";
  }

  const phone = normalizePhone(body.phone);
  if (!phone) errors.phone = "Please enter a valid 10-digit phone number.";

  const email = normalizeEmail(body.email);
  if (email === null) errors.email = "Please enter a valid email address.";

  const event_type = clean(body.event_type, 80);
  const event_date = normalizeDate(body.event_date || body.date);
  const guests = guestCount(body.guest_count ?? body.guests);
  const message = clean(body.message || body.notes, 2000);
  const services = Array.isArray(body.services)
    ? body.services.map((s) => clean(s, 60)).filter(Boolean).slice(0, 12)
    : [];
  const range = clean(body.range || body.space, 80);
  const time = clean(body.time, 40);

  const consent =
    body.consent === true ||
    body.consent === "true" ||
    body.consent === "on" ||
    body.consent_checkbox === true ||
    body.consent_ok === true;

  const lead_source = EVENT_LEAD_SOURCES.includes(clean(body.lead_source, 40))
    ? clean(body.lead_source, 40)
    : "website";

  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    errors,
    data: {
      full_name: ok ? full_name : null,
      phone: ok ? phone : null,
      email: ok && email && email !== "" ? email : null,
      event_type: event_type || "Other",
      event_date: event_date || null,
      guest_count: guests,
      message: message || null,
      services,
      range: range || null,
      time: time || null,
      consent,
      lead_source,
      // anti-bot / de-dup signals
      hp: clean(body.hp_field, 100),
      request_time_ms: Number.isFinite(Number(body.request_time_ms))
        ? Math.max(0, Math.min(7200, Number(body.request_time_ms)))
        : 0,
      submitted_from: clean(body.submitted_from, 300),
    },
  };
}

export const EVENT_LEAD_SOURCES = ["website", "whatsapp", "referral", "instagram", "walk_in", "ad"];

export function dedupeKey(phone, message) {
  const base = `${String(phone)}|${String(message || "")}`;
  return createHash("sha256").update(base).digest("hex");
}