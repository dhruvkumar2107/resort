/* Dynamic analytics routes for the two analytics endpoints:
   /api/analytics/<action>. */

import * as handlers from "../_lib/handlers/analytics.mjs";
import { fail, corsPreflight } from "../_lib/http.mjs";

const ALLOWED_ORIGINS = [
  "https://www.akshayamilan.com",
  "https://akshayamilan.com",
];
const MAP = { track: "track", consent: "consent" };

export default function handler(req, res) {
  const origin = req.headers.origin;
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  if (req.method === "OPTIONS") {
    return corsPreflight(res, allowOrigin);
  }

  const action = actionOf(req) || String((req.query && req.query.action) || "");
  mergeQuery(req);
  const fn = MAP[action];
  if (!fn) return fail(res, 404, "Not found.", {}, allowOrigin);
  return handlers[fn](req, res, allowOrigin);
}

function actionOf(req) {
  try {
    return new URL(req.url, "http://x").pathname.split("/").filter(Boolean).pop() || "";
  } catch (_) {
    return "";
  }
}

function mergeQuery(req) {
  req.query = { ...(req.query || {}) };
  try {
    const url = new URL(req.url, "http://x");
    for (const [k, v] of url.searchParams) req.query[k] = v;
  } catch (_) { /* keep req.query as-is */ }
}