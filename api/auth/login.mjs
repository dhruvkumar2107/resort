/* POST /api/auth/login — email + password sign-in for administrators.
   Sets httpOnly session cookies. No public registration exists. */

import { methodGuard, parseBody, fail, json, clientIp, userAgent } from "../_lib/http.mjs";
import { signIn, setAuthCookies } from "../_lib/auth.mjs";
import { checkRate } from "../_lib/rate-limit.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || password.length < 6) {
    return fail(res, 401, "Invalid email or password.");
  }

  const rate = await checkRate("login", clientIp(req), userAgent(req));
  if (!rate.allowed) {
    return json(res, 429, { ok: false, error: "Too many attempts. Try again in a minute." });
  }

  const session = await signIn(email, password);
  if (!session) return fail(res, 401, "Invalid email or password.");

  const secure = (req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() === "https";
  setAuthCookies(res, session, secure);

  return json(res, 200, { ok: true, email });
}