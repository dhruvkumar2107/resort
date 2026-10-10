/* Admin audit log writes (fire-and-forget, best effort). */

import { db } from "./db.mjs";

export function recordAudit(adminId, action, entityType = null, entityId = null, detail = null) {
  if (!adminId) return;
  try {
    db()
      .from("admin_audit_log")
      .insert({ admin_id: adminId, action, entity_type: entityType, entity_id: entityId, detail: detail || {} })
      .then(() => {})
      .catch(() => {});
  } catch (_) {
    /* never let auditing block a request */
  }
}