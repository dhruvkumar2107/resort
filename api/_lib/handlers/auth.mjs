/* Shared authentication route handlers.
   Kept under api/_lib (no default export -> not compiled as a serverless
   function) and dispatched by api/auth/[action].mjs so the Hobby plan limit
   of 12 functions is respected. */

import { methodGuard, parseBody, fail, ok, json, clientIp, userAgent, parseCookies } from "../http.mjs";
import { signIn, setAuthCookies, readSession, clearAuthCookies, requireAdmin, ACCESS_COOKIE, REFRESH_COOKIE } from "../auth.mjs";
import { db, hasBackend } from "../db.mjs";
import { checkRate } from "../rate-limit.mjs";
import { validateEmail, validPassword } from "../validate-admin.mjs";

/* POST /api/auth/login — email + password sign-in for administrators.
   Sets httpOnly session cookies. No public registration exists. */
export async function login(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body.", {}, origin); }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 6) {
    return fail(res, 401, "Invalid email or password.", {}, origin);
  }

  const rate = await checkRate("login", clientIp(req), userAgent(req));
  if (!rate.allowed) {
    return json(res, 429, { ok: false, error: "Too many attempts. Try again in a minute." }, origin);
  }

  const session = await signIn(email, password);
  if (!session) return fail(res, 401, "Invalid email or password.", {}, origin);

  const secure = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https";
  setAuthCookies(res, session, secure);

  return json(res, 200, { ok: true, email }, origin);
}

/* GET /api/auth/session — current session + admin profile (used to gate the UI). */
export async function session(req, res, origin) {
  if (!methodGuard(req, res, "GET")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) {
    return json(res, 200, { ok: true, authed: false }, origin);
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
  }, origin);
}

/* POST /api/auth/logout — revokes the Supabase session and clears cookies. */
export async function logout(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  const secure = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https";

  // Best-effort global sign-out (revokes refresh token on the Auth server).
  try {
    const cookies = parseCookies(req.headers.cookie || "");
    const refresh = cookies[REFRESH_COOKIE];
    if (refresh) {
      const { data } = await db().auth.setSession({
        access_token: cookies[ACCESS_COOKIE] || "",
        refresh_token: refresh,
      });
      if (data && data.session) {
        await db().auth.signOut({ scope: "global" }).catch(() => {});
      }
    }
  } catch (_) { /* ignore */ }

  clearAuthCookies(res, secure);
  return json(res, 200, { ok: true }, origin);
}

/* POST /api/auth/setup — one-time trusted administrator bootstrap.
   No public registration. Only works when:
      1. the ADMIN_BOOTSTRAP_TOKEN env secret is provided in the
         x-bootstrap-token header, AND
      2. no owner exists in admin_users yet.
   After the first account is created, remove ADMIN_BOOTSTRAP_TOKEN from Vercel
   (or delete this function) and create additional staff from the admin panel. */
export async function setup(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN;
  if (!expected) return fail(res, 403, "Bootstrap is disabled on this deployment.", {}, origin);
  const provided = req.headers["x-bootstrap-token"] || "";
  const same = provided.length === expected.length;
  const safe = same ? (provided === expected) : false;
  if (!safe) return fail(res, 403, "Invalid bootstrap token.", {}, origin);

  if (!hasBackend()) return fail(res, 503, "Backend not configured.", {}, origin);

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body.", {}, origin); }

  const email = String(body.email || "").trim().toLowerCase();
  const display_name = String(body.display_name || "").trim().slice(0, 80);
  const password = String(body.password || "");
  if (!validateEmail(email)) return fail(res, 422, "A valid administrator email is required.", {}, origin);
  if (!display_name) return fail(res, 422, "Display name is required.", {}, origin);
  if (!validPassword(password)) return fail(res, 422, "Password must be at least 10 characters.", {}, origin);

  const supa = db();

  // Only the very first bootstrap may create an owner.
  try {
    const { count, error: countErr } = await supa
      .from("admin_users")
      .select("*", { count: "exact", head: true })
      .eq("role", "owner");
    if (countErr) throw countErr;
    if (count > 0) return fail(res, 403, "An owner already exists. Use the admin panel to add staff.", {}, origin);
  } catch (err) {
    return fail(res, 500, "Could not query admin state.", {}, origin);
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

    return ok(res, { created: true, email }, origin);
  } catch (err) {
    console.error("[auth/setup]", err.message);
    return fail(res, 500, "Could not create the administrator account.", {}, origin);
  }
}

/* POST /api/auth/reset-password — sends a Supabase password-recovery email.
   Always returns ok so the endpoint cannot be used to enumerate accounts. */
export async function resetPassword(req, res, origin) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body.", {}, origin); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!validateEmail(email)) return fail(res, 422, "A valid email is required.", {}, origin);

  if (!hasBackend()) return fail(res, 503, "Backend not configured.", {}, origin);

  const rate = await checkRate("login", clientIp(req), userAgent(req));
  if (!rate.allowed) return fail(res, 429, "Too many requests. Try again later.", {}, origin);

  try {
    await db().auth.resetPasswordForEmail(email, {
      redirectTo: (process.env.SITE_URL || "https://www.akshayamilan.com") + "/admin/login",
    });
  } catch (err) {
    console.error("[auth/reset-password]", err.message);
  }

  // Identical response whether or not the account exists.
  return ok(res, {
    message: "If that email belongs to an administrator, a recovery link is on its way.",
  }, origin);
}