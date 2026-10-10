/* GET /api/auth/session — current session + admin profile (used to gate the UI). */

import { methodGuard, json } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "GET")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) {
    return json(res, 200, { ok: true, authed: false });
  }

  return json(res, 200, {
    ok: true,
    authed: true,
    admin: {
      id: ctx.admin.id,
      display_name: ctx.admin.display_name,
      role: ctx.admin.role,
      email: ctx.user.email || null,
    },
  });
}