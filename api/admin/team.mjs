/* /api/admin/team — administrator management.
   GET             -> list admins (name, email, role, active)
   POST {action:add}   {display_name,email,password,role}  (owner only)
   POST {action:update}{id, display_name?, role?, is_active?}  (role/is_active: owner only) */

import { methodGuard, parseBody, fail, ok } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";
import { db } from "../_lib/db.mjs";
import { validateEmail, validPassword, validDisplayName } from "../_lib/validate-admin.mjs";
import { recordAudit } from "../_lib/audit.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "GET", "POST")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");
  const supa = db();
  const isOwner = ctx.admin.role === "owner";

  if (req.method === "GET") {
    const { data: admins, error } = await supa
      .from("admin_users").select("*").order("created_at", { ascending: true });
    if (error) return fail(res, 500, "Could not load the team.");

    const rows = [];
    for (const a of admins || []) {
      const { data: u } = await supa.auth.admin.getUserById(a.auth_user_id).catch(() => ({ data: null }));
      rows.push({
        id: a.id,
        auth_user_id: a.auth_user_id,
        display_name: a.display_name,
        role: a.role,
        is_active: a.is_active,
        created_at: a.created_at,
        email: (u && u.user && u.user.email) || null,
        is_me: a.auth_user_id === ctx.user.id,
      });
    }
    return ok({ team: rows, viewer: { role: ctx.admin.role, display_name: ctx.admin.display_name, is_owner } });
  }

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  if (body.action === "add") {
    if (!isOwner) return fail(res, 403, "Only owners can add team members.");
    const email = String(body.email || "").trim().toLowerCase();
    const display_name = String(body.display_name || "").trim();
    const password = String(body.password || "");
    const role = body.role === "owner" ? "owner" : "staff";
    if (!validateEmail(email)) return fail(res, 422, "A valid email is required.");
    if (!validDisplayName(display_name)) return fail(res, 422, "Display name must be 2-80 characters.");
    if (!validPassword(password)) return fail(res, 422, "Password must be at least 10 characters.");

    try {
      const { data: created, error } = await supa.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { is_akshaya_admin: true },
      });
      if (error) throw error;
      const { error: insErr } = await supa.from("admin_users").insert({
        auth_user_id: created.user.id, display_name, role,
      });
      if (insErr) throw insErr;
      recordAudit(ctx.admin.id, "team_add", "admin_user", created.user.id, { email, role });
      return ok({ added: created.user.id });
    } catch (err) {
      console.error("[team add]", err.message);
      return fail(res, 500, "Could not create the staff account.");
    }
  }

  if (body.action === "update") {
    const id = String(body.id || "");
    if (!id) return fail(res, 422, "admin id is required.");
    const { data: target } = await supa.from("admin_users").select("*").eq("id", id).maybeSingle();
    if (!target) return fail(res, 404, "Team member not found.");

    const updates = {};
    if (body.display_name !== undefined) {
      if (!validDisplayName(body.display_name)) return fail(res, 422, "Invalid display name.");
      updates.display_name = String(body.display_name).trim();
    }
    if (body.role !== undefined) {
      if (!["owner", "staff"].includes(body.role)) return fail(res, 422, "Invalid role.");
      if (!isOwner) return fail(res, 403, "Only owners can change roles.");
      updates.role = body.role;
    }
    if (body.is_active !== undefined) {
      if (!isOwner) return fail(res, 403, "Only owners can activate/deactivate team members.");
      updates.is_active = body.is_active === true || body.is_active === "true";
    }
    if (Object.keys(updates).length === 0) return fail(res, 422, "Nothing to update.");

    const { data: updated, error } = await supa
      .from("admin_users").update(updates).eq("id", id).select("*").single();
    if (error) {
      console.error("[team update]", error.message);
      return fail(res, 400, error.message.includes("owner") ? "Only owners can make those changes." : "Could not update the team member.");
    }
    recordAudit(ctx.admin.id, "team_update", "admin_user", id, updates);
    return ok({ updated });
  }

  return fail(res, 422, "Unknown action.");
}