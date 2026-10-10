/* Unit tests for pure server helpers. Run: npm test */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  normalizePhone,
  normalizeEmail,
  normalizeDate,
  guestCount,
  validateEnquiry,
  dedupeKey,
  STATUSES,
} from "../api/_lib/validate.mjs";
import {
  classifyUA,
  referrerDomain,
  normalizePath,
} from "../api/_lib/ua.mjs";
import { parseRange } from "../api/_lib/range.mjs";
import {
  toCsv,
  toXlsx,
  isoDate,
  attachmentName,
  CSV_MIME,
  XLSX_MIME,
} from "../api/_lib/exporters.mjs";
import {
  parseCookies,
  serializeCookie,
  safeInt,
} from "../api/_lib/http.mjs";

test("normalizePhone handles Indian formats", () => {
  assert.equal(normalizePhone("9845691995"), "919845691995");
  assert.equal(normalizePhone("+91 98456 91995"), "919845691995");
  assert.equal(normalizePhone("919845691995"), "919845691995");
  assert.equal(normalizePhone("09845691995"), "919845691995");
  assert.equal(normalizePhone("98 456-91995"), "919845691995");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(9845691995), "919845691995");
});

test("normalizeEmail validates and lowercases", () => {
  assert.equal(normalizeEmail("  Ravi@Example.COM "), "ravi@example.com");
  assert.equal(normalizeEmail(""), "");
  assert.equal(normalizeEmail("not-an-email"), null);
  assert.equal(normalizeEmail("@x.com"), null);
});

test("normalizeDate accepts only real YYYY-MM-DD", () => {
  assert.equal(normalizeDate("2026-12-31"), "2026-12-31");
  assert.equal(normalizeDate("2026-02-29"), null); // not a leap year
  assert.equal(normalizeDate("2024-02-29"), "2024-02-29");
  assert.equal(normalizeDate("31/12/2026"), null);
  assert.equal(normalizeDate("2026-13-01"), null);
});

test("guestCount bounds", () => {
  assert.equal(guestCount("250"), 250);
  assert.equal(guestCount(50), 50);
  assert.equal(guestCount("0"), null);
  assert.equal(guestCount("abc"), null);
  assert.equal(guestCount("120000"), null);
});

test("validateEnquiry accepts a valid payload", () => {
  const r = validateEnquiry({
    full_name: "Ravi Kumar",
    phone: "+91 9845691995",
    email: "ravi@example.com",
    event_date: "2026-12-12",
    guest_count: "300",
    consent: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.data.phone, "919845691995");
  assert.equal(r.data.consent, true);
  assert.equal(r.data.event_type, "Other");
});

test("validateEnquiry rejects missing name / bad phone", () => {
  const r = validateEnquiry({ full_name: "X", phone: "12345", consent: true });
  assert.equal(r.ok, false);
  assert.ok(r.errors.full_name);
  assert.ok(r.errors.phone);
});

test("validateEnquiry: consent is required signal captured", () => {
  assert.equal(validateEnquiry({ full_name: "A B", phone: "9845691995", consent: false }).data.consent, false);
  assert.equal(validateEnquiry({ full_name: "A B", phone: "9845691995" }).data.consent, false);
  assert.equal(validateEnquiry({ full_name: "A B", phone: "9845691995", consent: "on" }).data.consent, true);
});

test("validateEnquiry cleans services/notes and clamps request_time_ms", () => {
  const r = validateEnquiry({
    full_name: "A B",
    phone: "9845691995",
    services: ["  Hall A  ", "", "   "],
    notes: "  Need parking for 40 cars  ",
    request_time_ms: "999999",
    lead_source: "whatsapp",
  });
  assert.deepEqual(r.data.services, ["Hall A"]);
  assert.equal(r.data.message, "Need parking for 40 cars");
  assert.equal(r.data.request_time_ms, 7200);
  assert.equal(r.data.lead_source, "whatsapp");
});

test("dedupeKey is deterministic and length-64", () => {
  const a = dedupeKey("919845691995", "same message");
  const b = dedupeKey("919845691995", "same message");
  const c = dedupeKey("919845691995", "different");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("STATUSES exported for the UI", () => {
  assert.ok(Array.isArray(STATUSES) && STATUSES.length > 0);
});

test("classifyUA device/browser/os", () => {
  assert.deepEqual(
    classifyUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"),
    { device: "mobile", browser: "safari", os: "ios" }
  );
  assert.deepEqual(
    classifyUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36"),
    { device: "mobile", browser: "chrome", os: "android" }
  );
  const win = classifyUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0");
  assert.deepEqual(win, { device: "desktop", browser: "edge", os: "windows" });
  const mac = classifyUA("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1) AppleWebKit/605.1.15 Version/17.1 Safari/605.1.15");
  assert.deepEqual(mac, { device: "desktop", browser: "safari", os: "macos" });
});

test("referrerDomain strips scheme + www", () => {
  assert.equal(referrerDomain("https://www.google.com/search?q=x"), "google.com");
  assert.equal(referrerDomain("https://twitter.com/"), "twitter.com");
  assert.equal(referrerDomain("not a url"), null);
  assert.equal(referrerDomain(""), null);
});

test("normalizePath rejects traversal and external", () => {
  assert.equal(normalizePath("/index.html"), "/index.html");
  assert.equal(normalizePath("/enquiry.html?x=1#top"), "/enquiry.html");
  assert.equal(normalizePath("../secret"), null);
  assert.equal(normalizePath("https://evil.com/"), null);
  assert.equal(normalizePath("/a//b"), null);
  assert.equal(normalizePath(""), null);
  assert.equal(normalizePath("/" + "x".repeat(400)), null);
});

test("parseRange named ranges", () => {
  const today = parseRange({ range: "today" });
  assert.ok(today.from <= today.to);
  const d7 = parseRange({ range: "7" });
  assert.ok(d7.to - d7.from <= 8 * 86400000);
});

test("parseRange custom dates and maxDays clamp", () => {
  const r = parseRange({ range: "custom", from: "2026-01-01", to: "2026-03-01" }, { maxDays: 366 });
  assert.equal(r.to - r.from, 59 * 86400000);
  const clamped = parseRange({ range: "custom", from: "2020-01-01", to: "2026-03-01" }, { maxDays: 30 });
  assert.ok(clamped.to - clamped.from <= 30 * 86400000);
});

test("parseRange never returns inverted windows", () => {
  const r = parseRange({ range: "custom", from: "2026-03-01", to: "2026-01-01" });
  assert.ok(r.to > r.from);
});

test("toCsv: BOM, quoting and formula injection escape", () => {
  const out = toCsv(
    [{ name: "Ravi", note: 'He said "hi"' }, { name: "=SUM(A1:A2)", note: "-2" }, { name: "@cmd", note: "normal" }],
    [
      { key: "name", label: "Name" },
      { key: "note", label: "Note" },
    ]
  );
  assert.ok(out.startsWith("\uFEFF"));
  assert.ok(out.includes("'=SUM(A1:A2)"));
  assert.ok(out.includes("'-2"));
  assert.ok(out.includes("'@cmd"));
  // no raw formula-leading value ever survives unescaped
  assert.ok(!out.match(/"[=+\-@]/));
  assert.ok(out.includes('"He said ""hi"""'));
});

test("toCsv uses value accessor when provided", () => {
  const out = toCsv([{ a: 1 }], [{ key: "a", label: "A", value: (r) => r.a * 2 }]);
  assert.ok(out.includes('"2"'));
});

test("toXlsx produces a valid buffer", async () => {
  const buf = await toXlsx(
    [{ name: "Ravi", note: "=2+2" }],
    [
      { key: "name", label: "Name" },
      { key: "note", label: "Note" },
    ]
  );
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 0);
  // zip magic: PK
  assert.equal(buf[0], 0x50);
  assert.equal(buf[1], 0x4b);
});

test("isoDate and attachmentName", () => {
  const d = new Date("2026-10-05T12:00:00Z");
  assert.equal(isoDate(d), "2026-10-05");
  assert.match(attachmentName("enquiries", "csv"), /^enquiries-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("mime constants", () => {
  assert.match(CSV_MIME, /^text\/csv/);
  assert.match(XLSX_MIME, /spreadsheetml/);
});

test("parseCookies handles the auth pair", () => {
  const cookies = parseCookies("am_at=abc; am_rt=def; flavor=vanilla");
  assert.equal(cookies.am_at, "abc");
  assert.equal(cookies.am_rt, "def");
  assert.equal(cookies.flavor, "vanilla");
  assert.deepEqual(parseCookies(""), {});
});

test("serializeCookie encodes attrs", () => {
  const s = serializeCookie("am_at", "abc", { httpOnly: true, secure: true, path: "/", maxAge: 3600, sameSite: "Lax" });
  assert.ok(s.includes("am_at=abc"));
  assert.ok(s.includes("HttpOnly"));
  assert.ok(s.includes("Secure"));
  assert.ok(s.includes("Max-Age=3600"));
  assert.ok(s.includes("SameSite=Lax"));
});

test("safeInt falls back when unparsable or out of range", () => {
  assert.equal(safeInt("50", 10, 1, 100), 50);
  assert.equal(safeInt("-5", 10, 1, 100), 10);
  assert.equal(safeInt("999", 10, 1, 100), 10);
  assert.equal(safeInt("abc", 10, 1, 100), 10);
});