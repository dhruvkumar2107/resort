/* POST /api/analytics/track — privacy-conscious first-party analytics intake.
   Records a page_view or an engagement (duration) event for a pseudonymous
   session. Nothing is recorded unless consent was explicitly given.
   Device / browser / OS are derived server-side from the User-Agent header.
   IP addresses are never stored. */

import { methodGuard, parseBody, ok, clientIp, userAgent, parseCookies } from "../_lib/http.mjs";
import { db, hasBackend } from "../_lib/db.mjs";
import { checkRate } from "../_lib/rate-limit.mjs";
import { classifyUA, referrerDomain, normalizePath } from "../_lib/ua.mjs";

export const CONSENT_COOKIE = "am_consent";
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  const cookies = parseCookies(req.headers.cookie || "");
  const consent = cookies[CONSENT_COOKIE];
  if (consent !== "accepted") {
    // No consent -> short-circuit without touching analytics tables.
    return ok(res, { tracked: false, reason: "no-consent" });
  }

  if (!hasBackend()) return ok(res, { tracked: false, reason: "backend-unavailable" });

  let body;
  try { body = await parseBody(req); } catch (_) { return ok(res, { tracked: false }); }

  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!SESSION_RE.test(sessionId)) return ok(res, { tracked: false });

  const path = normalizePath(body.page_path || "", "/");
  if (!path) return ok(res, { tracked: false });

  const rate = await checkRate("track", clientIp(req), userAgent(req));
  if (!rate.allowed) return ok(res, { tracked: false, reason: "rate-limited" });

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
      return ok(res, { tracked: true });
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
    return ok(res, { tracked: true });
  } catch (err) {
    console.error("[analytics/track]", err.message);
    return ok(res, { tracked: false });
  }
}