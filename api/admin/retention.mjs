/* /api/admin/retention — analytics retention policy.
   GET          -> current threshold + expired record counts (dry run)
   POST {days}  -> purge page_views and visitor_sessions older than N days
                   (owner only) */

import { methodGuard, parseBody, fail, ok, safeInt } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";
import { db } from "../_lib/db.mjs";
import { recordAudit } from "../_lib/audit.mjs";

function thresholdDays() {
  return safeInt(process.env.ANALYTICS_RETENTION_DAYS, 180, 30, 7300);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, "GET", "POST")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");

  const currentDays = thresholdDays();
  const threshold = new Date(Date.now() - currentDays * 86400000).toISOString();
  const supa = db();

  if (req.method === "GET") {
    try {
      const { count: sessionsExpired } = await supa
        .from("visitor_sessions")
        .select("*", { count: "exact", head: true })
        .lt("last_seen_at", threshold);
      const { count: pageViewsExpired } = await supa
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .lt("viewed_at", threshold);
      return ok({
        retention_days: currentDays,
        threshold_utc: threshold,
        expired_sessions: sessionsExpired || 0,
        expired_page_views: pageViewsExpired || 0,
      });
    } catch (err) {
      return fail(res, 500, "Could not read retention data.");
    }
  }

  // POST — purge (owner only by default; allow owner+staff per config)
  if (ctx.admin.role !== "owner") return fail(res, 403, "Only owners can run retention purges.");

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }
  const days = safeInt(body.days, currentDays, 30, 7300);
  if (days < 30 || days > 7300) return fail(res, 422, "Retention must be between 30 and 7300 days.");
  const cut = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const d1 = await supa.from("page_views").delete().lt("viewed_at", cut);
    const d2 = await supa.from("visitor_sessions").delete().lt("last_seen_at", cut);
    await supa.from("submission_rate_limits").delete().lte("expires_at", new Date().toISOString()).catch(() => {});

    recordAudit(ctx.admin.id, "retention_purge", "analytics", null, { days, deleted_page_views: d1.count, deleted_sessions: d2.count });
    return ok({ days, deleted_page_views: d1.count || 0, deleted_sessions: d2.count || 0 });
  } catch (err) {
    console.error("[admin/retention]", err.message);
    return fail(res, 500, "Retention purge failed.");
  }
}