/* POST /api/auth/setup — one-time trusted administrator bootstrap.
   No public registration. Only works when:
     1. the ADMIN_BOOTSTRAP_TOKEN env secret is provided in the
        x-bootstrap-token header, AND
     2. no owner exists in admin_users yet.
   After the first account is created, remove ADMIN_BOOTSTRAP_TOKEN from Vercel
   (or delete this function) and create additional staff from the admin panel. */

import { methodGuard, parseBody, fail, ok } from "../_lib/http.mjs";
import { db, hasBackend } from "../_lib/db.mjs";
import { validateEmail, validPassword } from "../_lib/validate-admin.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected) return fail(res, 403, "Bootstrap is disabled on this deployment.");
  const provided = req.headers["x-bootstrap-token"] || "";
  const same = provided.length === expected.length;
  const safe = same ? (provided === expected) : false;
  if (!safe) return fail(res, 403, "Invalid bootstrap token.");

  if (!hasBackend()) return fail(res, 503, "Backend not configured.");

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  const email = String(body.email || "").trim().toLowerCase();
  const display_name = String(body.display_name || "").trim().slice(0, 80);
  const password = String(body.password || "");
  if (!validateEmail(email)) return fail(res, 422, "A valid administrator email is required.");
  if (!display_name) return fail(res, 422, "Display name is required.");
  if (!validPassword(password)) return fail(res, 422, "Password must be at least 10 characters.");

  const supa = db();

  // Only the very first bootstrap may create an owner.
  try {
    const { count, error: countErr } = await supa
      .from("admin_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner");
    if (countErr) throw countErr;
    if (count > 0) return fail(res, 403, "An owner already exists. Use the admin panel to add staff.");
  } catch (err) {
    return fail(res, 500, "Could not query admin state.");
  }

  try {
    const { data: created, error: createErr } = await supa.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { is_akshaya_admin: true },
    });
    if (createErr) throw createErr;
    if (!created || !created.user) throw new Error("No user returned");

    const { error: adminErr } = await supa.from("admin_users").insert({
      auth_user_id: created.user.id,
      display_name,
      role: "owner",
    });
    if (adminErr) throw adminErr;

    return ok(res, { created: true, email });
  } catch (err) {
    console.error("[auth/setup]", err.message);
    return fail(res, 500, "Could not create the administrator account.");
  }
}