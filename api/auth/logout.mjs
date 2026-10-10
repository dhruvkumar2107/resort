/* POST /api/auth/logout — revokes the Supabase session and clears cookies. */

import { methodGuard, json } from "../_lib/http.mjs";
import { readSession, clearAuthCookies, ACCESS_COOKIE, REFRESH_COOKIE } from "../_lib/auth.mjs";
import { parseCookies } from "../_lib/http.mjs";
import { db } from "../_lib/db.mjs";

export default async function handler(req, res) {
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
  return json(res, 200, { ok: true });
}