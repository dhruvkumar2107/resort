/* Shared analytics route handlers (see api/analytics/[action].mjs). */

import { methodGuard, parseBody, ok, fail, serializeCookie, clientIp, userAgent, parseCookies } from "../http.mjs";
import { db, hasBackend } from "../db.mjs";
import { checkRate } from "../rate-limit.mjs";
import { classifyUA, referrerDomain, normalizePath } from "../ua.mjs";

export const CONSENT_COOKIE = "am_consent";
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

/* POST /api/analytics/track — privacy-conscious first-party analytics intake.
   Records a page_view or an engagement (duration) event for a pseudonymous
   session. Nothing is recorded unless consent was explicitly given.
   Device / browser / OS are derived server-side from the User-Agent header.
   IP addresses are never stored. */
export async function track(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  const cookies = parseCookies(req.headers.cookie || "");
  const consent = cookies[CONSENT_COOKIE];
  if (consent !== "accepted") {
    // No consent -> short-circuit without touching analytics tables.
    return ok(res, { tracked: false, reason: "no-consent" }, origin);
  }

  if (!hasBackend()) return ok(res, { tracked: false, reason: "backend-unavailable" }, origin);

  let body;
  try { body = await parseBody(req); } catch (_) { return ok(res, { tracked: false }, origin); }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!SESSION_RE.test(sessionId)) return ok(res, { tracked: false }, origin);

  const path = normalizePath(body.page_path || "", "/");
  if (!path) return ok(res, { tracked: false }, origin);

  const rate = await checkRate("track", clientIp(req), userAgent(req));
  if (!rate.allowed) return ok(res, { tracked: false, reason: "rate-limited" }, origin);

  const { device, browser, os } = classifyUA(userAgent(req));
  const referrer = referrerDomain(req.headers["referer"]);
  const type = body.type === "engagement" ? "engagement" : "page_view";

  try {
    const supa = db();
    if (type === "page_view") {
      const now = new Date().toISOString();
      const { data: seen } = await supa
        .from("visitor_sessions")
        .select("session_id")
        .eq("session_id", sessionId)
        .maybeSingle();

      if (!seen) {
        await supa.from("visitor_sessions").insert({
          session_id: sessionId,
          first_seen_at: now,
          last_seen_at: now,
          landing_page: path,
          referrer_domain: referrer,
          device_category: device,
          browser_category: browser,
          operating_system_category: os,
          consent_status: "accepted",
          analytics_source: "server-derived",
        });
      } else {
        await supa
          .from("visitor_sessions")
          .update({ last_seen_at: now })
          .eq("session_id", sessionId);
      }

      await supa.from("page_views").insert({
        session_id: sessionId,
        page_path: path,
        viewed_at: now,
        referrer_domain: referrer,
      });
      return ok(res, { tracked: true }, origin);
    }

    // engagement -> attach duration to the latest page view for this session/path
    const dur = Number.isFinite(Number(body.duration_seconds))
      ? Math.max(0, Math.min(6 * 3600, Math.round(Number(body.duration_seconds))))
      : null;
    const { data: latest } = await supa
      .from("page_views")
      .select("id")
      .match({ session_id: sessionId, page_path: path })
      .gte("viewed_at", new Date(Date.now() - 7 * 86400000).toISOString())
      .order("viewed_at", { ascending: false })
      .limit(1);
    if (latest && latest[0] && dur !== null) {
      await supa.from("page_views").update({ engagement_duration_seconds: dur }).eq("id", latest[0].id);
    }
    return ok(res, { tracked: true }, origin);
  } catch (err) {
    console.error("[analytics/track]", err.message);
    return ok(res, { tracked: false }, origin);
  }
}

/* POST /api/analytics/consent — record an explicit consent decision and mirror
   it into a cookie. A declined/withdrawn decision stops tracking entirely. */
export async function consent(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body.", {}, origin); }

  const decision = String(body.consent || "").toLowerCase();
  if (!["accepted", "declined"].includes(decision)) {
    return fail(res, 422, "Consent must be 'accepted' or 'declined'.", {}, origin);
  }

  const secure = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https";
  res.setHeader("Set-Cookie", serializeCookie(CONSENT_COOKIE, decision, {
    maxAge: 60 * 60 * 24 * 365,
    secure,
    httpOnly: false, // readable by the consent banner script
    sameSite: "Lax",
    path: "/",
  }));

  return ok(res, { consent: decision }, origin);
}