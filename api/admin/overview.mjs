/* GET /api/admin/overview — dashboard statistics delivered by the Postgres
   stats_overview RPC. Real database values, never hardcoded. */

import { methodGuard, fail, ok } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";
import { db } from "../_lib/db.mjs";
import { parseRange } from "../_lib/range.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "GET")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");

  const { from, to } = parseRange(req.query);

  try {
    const { data, error } = await db().rpc("stats_overview", {
      src: from.toISOString(),
      dst: to.toISOString(),
    });
    if (error) throw error;
    return ok(res, { stats: data, from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    console.error("[admin/overview]", err.message);
    return fail(res, 500, "Could not load statistics.");
  }
}