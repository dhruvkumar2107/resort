/* POST /api/auth/reset-password — sends a Supabase password-recovery email.
   Always returns ok so the endpoint cannot be used to enumerate accounts. */

import { methodGuard, parseBody, fail, ok, clientIp, userAgent } from "../_lib/http.mjs";
import { db, hasBackend } from "../_lib/db.mjs";
import { validateEmail } from "../_lib/validate-admin.mjs";
import { checkRate } from "../_lib/rate-limit.mjs";

export default async function handler(req, res) {
  if (!methodGuard(req, res, "POST")) return;

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  const email = String(body.email || "").trim().toLowerCase();
  if (!validateEmail(email)) return fail(res, 422, "A valid email is required.");

  if (!hasBackend()) return fail(res, 503, "Backend not configured.");

  const rate = await checkRate("login", clientIp(req), userAgent(req));
  if (!rate.allowed) return fail(res, 429, "Too many requests. Try again later.");

  try {
    await db().auth.admin.resetPasswordForEmail(email, {
      redirectTo: (process.env.SITE_URL || "https://akshaya-milan.vercel.app") + "/admin/login.html",
    });
  } catch (err) {
    console.error("[auth/reset-password]", err.message);
  }

  // Identical response whether or not the account exists.
  return ok(res, {
    message: "If that email belongs to an administrator, a recovery link is on its way.",
  });
}