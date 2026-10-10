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
    const { data, error } = await supa.auth.getUser(accessToken);
    if (error || !data || !data.user) {
      return null;
    }
    return data.user;
  } catch (err) {
    return null;
  }
}

/**
 * Call stats_overview via native fetch (PostgREST RPC). supabase-js's .rpc()
 * path can hit "permission denied for function" in serverless runtimes, while
 * a direct REST call with the service key works; this avoids that variance.
 */
export async function statsRpc(fromISO, toISO) {
  const url = `${requireEnv("SUPABASE_URL")}/rest/v1/rpc/stats_overview`;
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ src: fromISO, dst: toISO }),
  });
  const raw = await resp.text();
  if (!resp.ok) {
    let info = null;
    try { info = JSON.parse(raw); } catch (_) { /* leave null */ }
    const err = new Error(info?.message || `stats_overview failed (HTTP ${resp.status})`);
    err.code = info?.code || `HTTP_${resp.status}`;
    throw err;
  }
  return JSON.parse(raw);
}