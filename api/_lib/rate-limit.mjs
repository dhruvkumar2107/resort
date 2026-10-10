/* Transient anti-spam rate limiting backed by the DB (hashed key only). */

import { createHash } from "node:crypto";
import { db } from "./db.mjs";

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENQUIRIES = 5;
const MAX_TRACKS = 120;
const MAX_LOGINS = 60;

const LIMITS = {
  enquiry: { max: MAX_ENQUIRIES, method: "enquiry" },
  track: { max: MAX_TRACKS, method: "track" },
  login: { max: MAX_LOGINS, method: "login" },
};

export function keyHash(ip, ua) {
  return createHash("sha256")
    .update(`${String(ip)}|${String(ua || "").slice(0, 200)}`)
    .digest("hex");
}

async function prune() {
  try {
    await db()
      .from("submission_rate_limits")
      .delete()
      .lte("expires_at", new Date().toISOString());
  } catch (_) {
    /* best effort */
  }
}

/**
 * Returns { allowed, remaining }. DB errors degrade to "allowed" so a misbehaving
 * database never silently loses real visitor enquiries.
 */
export async function checkRate(scope, ip, ua) {
  const cfg = LIMITS[scope] || LIMITS.enquiry;
  try {
    await prune();
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count, error } = await db()
      .from("submission_rate_limits")
      .select("*", { count: "exact", head: true })
      .eq("key_hash", keyHash(ip, ua))
      .eq("method", cfg.method)
      .gte("bucket", since);
    if (error) throw error;
    if (count >= cfg.max) return { allowed: false, remaining: 0, retryAfter: WINDOW_MS };
    await db().from("submission_rate_limits").insert({
      key_hash: keyHash(ip, ua),
      method: cfg.method,
      expires_at: new Date(Date.now() + WINDOW_MS).toISOString(),
    });
    return { allowed: true, remaining: cfg.max - count - 1 };
  } catch (err) {
    console.error("[checkRate]", err.message);
    return { allowed: true, remaining: 1 };
  }
}