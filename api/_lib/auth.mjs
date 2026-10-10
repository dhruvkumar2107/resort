import { parseCookies, serializeCookie } from "./http.mjs";
import { db, verifyUser } from "./db.mjs";

export const ACCESS_COOKIE = "am_at";
export const REFRESH_COOKIE = "am_rt";
const ACCESS_TTL = 60 * 60 * 2;      // 2h
const REFRESH_TTL = 60 * 60 * 24 * 14; // 14d

/**
 * Login with Supabase Auth ("email and password"). Returns the session or null.
 */
export async function signIn(email, password) {
  const supa = db();
  const { data, error } = await supa.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return data.session;
}

export function setAuthCookies(res, session, secure) {
  res.setHeader("Set-Cookie", [
    serializeCookie(ACCESS_COOKIE, session.access_token, {
      maxAge: ACCESS_TTL, secure, httpOnly: true, sameSite: "Lax", path: "/",
    }),
    serializeCookie(REFRESH_COOKIE, session.refresh_token, {
      maxAge: REFRESH_TTL, secure, httpOnly: true, sameSite: "Lax", path: "/",
    }),
  ]);
}

export function clearAuthCookies(res, secure) {
  res.setHeader("Set-Cookie", [
    serializeCookie(ACCESS_COOKIE, "", { maxAge: 0, secure, httpOnly: true, sameSite: "Lax", path: "/" }),
    serializeCookie(REFRESH_COOKIE, "", { maxAge: 0, secure, httpOnly: true, sameSite: "Lax", path: "/" }),
  ]);
}

/**
 * Resolve the session from request cookies. Uses setSession so a near-expired
 * access token is transparently refreshed against Supabase (and its result
 * returns fresh cookies the caller can set).
 * Returns { session, setCookies } or null when there is no valid session.
 */
export async function readSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const access = cookies[ACCESS_COOKIE];
  const refresh = cookies[REFRESH_COOKIE];
  if (!access && !refresh) return null;

  try {
    const supa = db();
    const { data, error } = await supa.auth.setSession({
      access_token: access || "",
      refresh_token: refresh || "",
    });
    if (error || !data.session) {
      return null;
    }
    const cookiesToSet =
      data.session.access_token === access && data.session.refresh_token === refresh
        ? []
        : data.session;
    return { session: data.session, freshSession: cookiesToSet || null };
  } catch (err) {
    console.error("[readSession]", err.message);
    return null;
  }
}

/**
 * Require an authenticated administrator. Validates the token with Supabase
 * Auth, then looks the admin up in admin_users. Role enforcement is server-side.
 * Returns { admin, user, session, freshSession } or null.
 */
export async function requireAdmin(req, opts = {}) {
  const { role } = opts;
  const ctx = await readSession(req);
  if (!ctx) return null;
  const user = await verifyUser(ctx.session.access_token);
  if (!user) return null;

  try {
    const { data: admin, error } = await db()
      .from("admin_users")
      .select("*")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error || !admin || !admin.is_active) return null;
    if (role && admin.role !== role) return null;
    return { admin, user, session: ctx.session, freshSession: ctx.freshSession };
  } catch (err) {
    console.error("[requireAdmin]", err.message);
    return null;
  }
}