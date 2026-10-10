import { createClient } from "@supabase/supabase-js";

export function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing environment variable: ${name}`);
  return v.trim();
}

export function hasBackend() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let _service = null;
export function db() {
  if (!hasBackend()) throw new Error("Supabase is not configured");
  if (_service) return _service;
  _service = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, persistRefreshToken: false },
  });
  return _service;
}

export function resetDbClient() {
  _service = null;
}

/**
 * Verify an access token with Supabase Auth and return the authenticated user.
 * Never trusts claims from the browser - this always queries Supabase.
 */
export async function verifyUser(accessToken) {
  if (!accessToken) return null;
  try {
    const supa = db();
    const { data, error } = await supa.auth.admin.getUser(accessToken);
    if (error || !data || !data.user) return null;
    return data.user;
  } catch (err) {
    console.error("[verifyUser]", err.message);
    return null;
  }
}