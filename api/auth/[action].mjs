/* Dynamic auth routes so all five auth endpoints share one serverless
   function slot: /api/auth/<action>. */

import * as handlers from "../_lib/handlers/auth.mjs";
import { fail } from "../_lib/http.mjs";

const MAP = {
  login: "login",
  session: "session",
  logout: "logout",
  setup: "setup",
  "reset-password": "resetPassword",
};

export default function handler(req, res) {
  const action = actionOf(req) || String((req.query && req.query.action) || "");
  mergeQuery(req);
  const key = MAP[action];
  const fn = key ? handlers[key] : null;
  if (!fn) return fail(res, 404, "Not found.");
  return fn(req, res);
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