/* POST /api/analytics/consent — record an explicit consent decision and mirror
   it into a cookie. A declined/withdrawn decision stops tracking entirely. */

import { methodGuard, parseBody, ok, fail, serializeCookie } from "../_lib/http.mjs";

export const CONSENT_COOKIE = "am_consent";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  const decision = String(body.consent || "").toLowerCase();
  if (!["accepted", "declined"].includes(decision)) {
    return fail(res, 422, "Consent must be 'accepted' or 'declined'.");
  }

  const secure = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https";
  res.setHeader("Set-Cookie", serializeCookie(CONSENT_COOKIE, decision, {
    maxAge: 60 * 60 * 24 * 365,
    secure,
    httpOnly: false, // readable by the consent banner script
    sameSite: "Lax",
    path: "/",
  }));

  return ok(res, { consent: decision });
}