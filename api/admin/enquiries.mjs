/* /api/admin/enquiries — lead management.
   GET  ?id=           -> single enquiry + status history
        ?search=&status=&event_type=&from=&to=&sort=&page=&limit= -> table rows
   POST {id, status?, internal_notes?, assigned_to?, note?} -> update lead */

import { methodGuard, parseBody, fail, ok, safeInt } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";
import { db } from "../_lib/db.mjs";
import { parseRange } from "../_lib/range.mjs";
import { STATUSES } from "../_lib/validate.mjs";
import { recordAudit } from "../_lib/audit.mjs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function staffMap(supa) {
  const { data } = await supa.from("admin_users").select("auth_user_id, display_name, role, is_active");
  const map = new Map();
  for (const row of data || []) map.set(row.auth_user_id, row.display_name);
  return map;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, "GET", "POST")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");
  const supa = db();

  if (req.method === "POST") {
    let body;
    try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

    const id = String(body.id || "");
    if (!id) return fail(res, 422, "Enquiry id is required.");

    const { data: existing } = await supa.from("enquiries").select("*").eq("id", id).maybeSingle();
    if (!existing) return fail(res, 404, "Enquiry not found.");

    const updates = {};
    let toStatus = null;

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) return fail(res, 422, "Invalid status.");
      updates.status = body.status;
      toStatus = body.status; // history recorded below
    }
    if (body.internal_notes !== undefined) {
      updates.internal_notes = String(body.internal_notes).slice(0, 4000);
    }
    if (body.assigned_to !== undefined) {
      if (body.assigned_to === null || body.assigned_to === "") {
        updates.assigned_to = null;
      } else {
        // verify the target is a real auth user (avoid bad references)
        const { data: target } = await supa.from("admin_users")
          .select("auth_user_id").eq("auth_user_id", body.assigned_to).maybeSingle();
        if (!target) return fail(res, 422, "Unknown staff member.");
        updates.assigned_to = body.assigned_to;
      }
    }

    if (Object.keys(updates).length === 0) return fail(res, 422, "Nothing to update.");

    updates.updated_at = new Date().toISOString();
    const { data: updated, error } = await supa
      .from("enquiries").update(updates).eq("id", id).select("*").single();
    if (error) { console.error("[enquiries update]", error.message); return fail(res, 500, "Could not update enquiry."); }

    // Status history + audit (best effort).
    if (toStatus && toStatus !== existing.status) {
      const note = String(body.note || "").slice(0, 1000) || null;
      await supa.from("enquiry_status_history").insert({
        enquiry_id: id,
        from_status: existing.status,
        to_status: toStatus,
        note,
        changed_by: ctx.admin.id,
      }).catch(() => {});
    }
    recordAudit(ctx.admin.id, "enquiry_update", "enquiry", id, { status: toStatus, assigned_to: updates.assigned_to ?? undefined });

    return ok(res, { enquiry: updated });
  }

  // ---- GET ----
  const id = req.query.id;
  if (id) {
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return fail(res, 422, "Invalid id.");
    const { data: enquiry, error } = await supa
      .from("enquiries").select("*").eq("id", id).maybeSingle();
    if (error) return fail(res, 500, "Could not load enquiry.");
    if (!enquiry) return fail(res, 404, "Enquiry not found.");

    const { data: history } = await supa.from("enquiry_status_history")
      .select("*").eq("enquiry_id", id).order("changed_at", { ascending: false }).limit(30);

    const staff = await staffMap(supa);
    return ok({
      enquiry: { ...enquiry, assigned_name: staff.get(enquiry.assigned_to) || null },
      history: history || [],
    });
  }

  // ---- list ----
  const page = safeInt(req.query.page, 1, 1, 10000);
  const limit = safeInt(req.query.limit, 25, 1, 100);
  const sort = String(req.query.sort || "desc") === "asc" ? "asc" : "desc";

  let query = supa.from("enquiries").select("id,created_at,full_name,phone,email,event_type,event_date,guest_count,status,assigned_to,lead_source", { count: "exact" });

  if (req.query.search) {
    const s = String(req.query.search).trim().slice(0, 80);
    if (s) {
      const like = `%${s}%`;
      query = query.or(`full_name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
    }
  }
  if (req.query.status) {
    if (STATUSES.includes(req.query.status)) query = query.eq("status", req.query.status);
  }
  if (req.query.event_type) {
    query = query.eq("event_type", String(req.query.event_type).slice(0, 80));
  }
  if (req.query.date_from || req.query.date_to) {
    const { from, to } = parseRange({ from: req.query.date_from, to: req.query.date_to, range: "custom" });
    query = query.gte("created_at", from.toISOString()).lte("created_at", to.toISOString());
  }

  query = query.order("created_at", { ascending: sort === "asc" });
  query = query.range((page - 1) * limit, page * limit - 1);

  const { data, count, error } = await query;
  if (error) { console.error("[enquiries list]", error.message); return fail(res, 500, "Could not load enquiries."); }

  const staff = await staffMap(supa);
  const rows = (data || []).map((r) => ({ ...r, assigned_name: staff.get(r.assigned_to) || null }));

  return ok({ rows, total: count || 0, page, limit, sort });
}