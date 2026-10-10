/* Dynamic admin routes so all five admin endpoints share one serverless
   function slot: /api/admin/<action>. */

import * as handlers from "../_lib/handlers/admin.mjs";
import { fail } from "../_lib/http.mjs";

const MAP = {
  overview: "overview",
  enquiries: "enquiries",
  team: "team",
  exports: "exports",
  retention: "retention",
};

export default function handler(req, res) {
  const action = actionOf(req) || String((req.query && req.query.action) || "");
  mergeQuery(req);
  const fn = MAP[action];
  if (!fn) return fail(res, 404, "Not found.");
  return handlers[fn](req, res);
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