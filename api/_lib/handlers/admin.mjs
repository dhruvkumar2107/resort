/* Shared admin route handlers (see api/admin/[action].mjs). */

import { methodGuard, parseBody, fail, ok, safeInt } from "../http.mjs";
import { requireAdmin } from "../auth.mjs";
import { db, statsRpc } from "../db.mjs";
import { parseRange } from "../range.mjs";
import { STATUSES } from "../validate.mjs";
import { recordAudit } from "../audit.mjs";
import { toCsv, toXlsx, sendExport, CSV_MIME, XLSX_MIME, attachmentName } from "../exporters.mjs";
import { validateEmail, validPassword, validDisplayName } from "../validate-admin.mjs";

/* GET /api/admin/overview — dashboard statistics delivered by the Postgres
   stats_overview RPC. Real database values, never hardcoded. */
export async function overview(req, res) {
  if (!methodGuard(req, res, "GET")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");

  const { from, to } = parseRange(req.query);

  try {
    const data = await statsRpc(from.toISOString(), to.toISOString());
    return ok(res, { stats: data, from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    console.error("[admin/overview]", err.message, err.code || "", err.status || "");
    return fail(res, 500, "Could not load statistics.");
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function staffMap(supa) {
  const { data } = await supa.from("admin_users").select("auth_user_id, display_name, role, is_active");
  const map = new Map();
  for (const row of data || []) map.set(row.auth_user_id, row.display_name);
  return map;
}

/* /api/admin/enquiries — lead management.
   GET  ?id=           -> single enquiry + status history
        ?search=&status=&event_type=&from=&to=&sort=&page=&limit= -> table rows
   POST {id, status?, internal_notes?, assigned_to?, note?} -> update lead */
export async function enquiries(req, res) {
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
    return ok(res, {
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

  return ok(res, { rows, total: count || 0, page, limit, sort });
}

/* /api/admin/team — administrator management.
   GET             -> list admins (name, email, role, active)
   POST {action:add}   {display_name,email,password,role}  (owner only)
   POST {action:update}{id, display_name?, role?, is_active?}  (role/is_active: owner only) */
export async function team(req, res) {
  if (!methodGuard(req, res, "GET", "POST")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");
  const supa = db();
  const isOwner = ctx.admin.role === "owner";

  if (req.method === "GET") {
    const { data: admins, error } = await supa
      .from("admin_users").select("*").order("created_at", { ascending: true });
    if (error) return fail(res, 500, "Could not load the team.");

    const rows = [];
    for (const a of admins || []) {
      const { data: u } = await supa.auth.admin.getUserById(a.auth_user_id).catch(() => ({ data: null }));
      rows.push({
        id: a.id,
        auth_user_id: a.auth_user_id,
        display_name: a.display_name,
        role: a.role,
        is_active: a.is_active,
        created_at: a.created_at,
        email: (u && u.user && u.user.email) || null,
        is_me: a.auth_user_id === ctx.user.id,
      });
    }
    return ok(res, { team: rows, viewer: { role: ctx.admin.role, display_name: ctx.admin.display_name, is_owner: isOwner } });
  }

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }

  if (body.action === "add") {
    if (!isOwner) return fail(res, 403, "Only owners can add team members.");
    const email = String(body.email || "").trim().toLowerCase();
    const display_name = String(body.display_name || "").trim();
    const password = String(body.password || "");
    const role = body.role === "owner" ? "owner" : "staff";
    if (!validateEmail(email)) return fail(res, 422, "A valid email is required.");
    if (!validDisplayName(display_name)) return fail(res, 422, "Display name must be 2-80 characters.");
    if (!validPassword(password)) return fail(res, 422, "Password must be at least 10 characters.");

    try {
      const { data: created, error } = await supa.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { is_akshaya_admin: true },
      });
      if (error) throw error;
      const { error: insErr } = await supa.from("admin_users").insert({
        auth_user_id: created.user.id, display_name, role,
      });
      if (insErr) throw insErr;
      recordAudit(ctx.admin.id, "team_add", "admin_user", created.user.id, { email, role });
      return ok(res, { added: created.user.id });
    } catch (err) {
      console.error("[team add]", err.message);
      return fail(res, 500, "Could not create the staff account.");
    }
  }

  if (body.action === "update") {
    const id = String(body.id || "");
    if (!id) return fail(res, 422, "admin id is required.");
    const { data: target } = await supa.from("admin_users").select("*").eq("id", id).maybeSingle();
    if (!target) return fail(res, 404, "Team member not found.");

    const updates = {};
    if (body.display_name !== undefined) {
      if (!validDisplayName(body.display_name)) return fail(res, 422, "Invalid display name.");
      updates.display_name = String(body.display_name).trim();
    }
    if (body.role !== undefined) {
      if (!["owner", "staff"].includes(body.role)) return fail(res, 422, "Invalid role.");
      if (!isOwner) return fail(res, 403, "Only owners can change roles.");
      updates.role = body.role;
    }
    if (body.is_active !== undefined) {
      if (!isOwner) return fail(res, 403, "Only owners can activate/deactivate team members.");
      updates.is_active = body.is_active === true || body.is_active === "true";
    }
    if (Object.keys(updates).length === 0) return fail(res, 422, "Nothing to update.");

    const { data: updated, error } = await supa
      .from("admin_users").update(updates).eq("id", id).select("*").single();
    if (error) {
      console.error("[team update]", error.message);
      return fail(res, 400, error.message.includes("owner") ? "Only owners can make those changes." : "Could not update the team member.");
    }
    recordAudit(ctx.admin.id, "team_update", "admin_user", id, updates);
    return ok(res, { updated });
  }

  return fail(res, 422, "Unknown action.");
}

const EXPORT_COLUMNS = {
  enquiries: [
    { key: "id", label: "Enquiry ID" },
    { key: "full_name", label: "Name" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "event_type", label: "Event Type" },
    { key: "event_date", label: "Event Date" },
    { key: "guest_count", label: "Guest Count" },
    { key: "message", label: "Message" },
    { key: "created_at", label: "Enquiry Date" },
    { key: "lead_source", label: "Lead Source" },
    { key: "status", label: "Status" },
    { key: "assigned_name", label: "Assigned Staff" },
    { key: "internal_notes", label: "Internal Notes" },
  ],
  analytics: [
    { key: "day", label: "Date" },
    { key: "page_views", label: "Page Views" },
    { key: "sessions", label: "Unique Sessions" },
    { key: "enquiries", label: "Enquiries" },
    { key: "converted", label: "Converted" },
    { key: "conversion_rate", label: "Conversion Rate (%)" },
    { key: "device_desktop", label: "Desktop Sessions" },
    { key: "device_mobile", label: "Mobile Sessions" },
    { key: "device_tablet", label: "Tablet Sessions" },
    { key: "top_landing_pages", label: "Top Landing Pages" },
    { key: "top_referrers", label: "Top Referrers" },
  ],
};

/* GET /api/admin/exports — filtered CSV / XLSX downloads from real records.
   kind=enquiries|analytics  format=csv|xlsx
   Enquiry export honors date/status/event_type filters. Internal notes are only
   ever included when the exporting administrator is an owner. */
export async function exports(req, res) {
  if (!methodGuard(req, res, "GET")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");

  const kind = req.query.kind === "analytics" ? "analytics" : "enquiries";
  const format = req.query.format === "xlsx" ? "xlsx" : "csv";
  const includeNotes = Boolean(req.query.include_notes) && ctx.admin.role === "owner";
  const { from, to } = parseRange(req.query);

  try {
    const supa = db();
    let rows = [];

    if (kind === "enquiries") {
      let q = supa.from("enquiries").select("id,full_name,phone,email,event_type,event_date,guest_count,message,created_at,lead_source,status,assigned_to,internal_notes");
      q = q.gte("created_at", from.toISOString()).lte("created_at", to.toISOString());
      if (req.query.status && STATUSES.includes(req.query.status)) q = q.eq("status", req.query.status);
      if (req.query.event_type) q = q.eq("event_type", String(req.query.event_type).slice(0, 80));
      const { data, error } = await q.order("created_at", { ascending: true });
      if (error) throw error;

      const staffIds = new Set((data || []).map((r) => r.assigned_to).filter(Boolean));
      if (staffIds.size) {
        const { data: admins } = await supa.from("admin_users").select("auth_user_id, display_name").in("auth_user_id", [...staffIds]);
        const map = new Map((admins || []).map((a) => [a.auth_user_id, a.display_name]));
        rows = (data || []).map((r) => ({
          ...r,
          created_at: formatDate(r.created_at),
          event_date: r.event_date || "",
          assigned_name: map.get(r.assigned_to) || "",
          internal_notes: includeNotes ? (r.internal_notes || "") : "(restricted)",
        }));
      } else {
        rows = (data || []).map((r) => ({
          ...r,
          created_at: formatDate(r.created_at),
          event_date: r.event_date || "",
          assigned_name: "",
          internal_notes: includeNotes ? (r.internal_notes || "") : "(restricted)",
        }));
      }
    } else {
      // analytics export: aggregated per-day
      const data = await statsRpc(from.toISOString(), to.toISOString());

      const daily = (data.daily_series || []).map((d) => ({
        day: d.day,
        page_views: d.page_views,
        sessions: d.sessions,
        enquiries: d.enquiries,
        converted: d.converted,
        conversion_rate: d.enquiries ? ((d.converted / d.enquiries) * 100).toFixed(2) : "0.00",
      }));
      const device = data.device_breakdown || {};
      const total = daily.reduce((a, b) => a + Math.round(+b.sessions || 0), 0);
      const totalPv = daily.reduce((a, b) => a + (+b.page_views || 0), 0);
      const totalEnq = daily.reduce((a, b) => a + (+b.enquiries || 0), 0);
      const totalConv = daily.reduce((a, b) => a + (+b.converted || 0), 0);
      rows = daily.map((d) => ({
        ...d,
        device_desktop: device.desktop || 0,
        device_mobile: device.mobile || 0,
        device_tablet: device.tablet || 0,
        top_landing_pages: (data.landing_pages || []).map((l) => `${l.page} (${l.sessions})`).join("; "),
        top_referrers: (data.referrers || []).map((r) => `${r.domain} (${r.sessions})`).join("; "),
      }));
      if (rows.length > 0) {
        rows.push({
          day: "TOTAL", page_views: totalPv, sessions: total, enquiries: totalEnq,
          converted: totalConv,
          conversion_rate: totalEnq ? ((totalConv / totalEnq) * 100).toFixed(2) : "0.00",
          device_desktop: device.desktop || 0, device_mobile: device.mobile || 0, device_tablet: device.tablet || 0,
          top_landing_pages: "", top_referrers: "",
        });
      }
    }

    const cols = EXPORT_COLUMNS[kind];
    const buffer = format === "xlsx" ? await toXlsx(rows, cols) : Buffer.from(toCsv(rows, cols), "utf8");
    const mime = format === "xlsx" ? XLSX_MIME : CSV_MIME;
    const filename = attachmentName(`akshaya-milan-${kind}`, format);

    recordAudit(ctx.admin.id, "export", kind, null, {
      format, from: from.toISOString(), to: to.toISOString(),
      status: req.query.status || null, event_type: req.query.event_type || null, include_notes: includeNotes,
    });

    return sendExport(res, { buffer, mime, filename });
  } catch (err) {
    console.error("[admin/exports]", err.message);
    return fail(res, 500, "Could not generate the export.");
  }
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

/* /api/admin/retention — analytics retention policy.
   GET          -> current threshold + expired record counts (dry run)
   POST {days}  -> purge page_views and visitor_sessions older than N days
                   (owner only) */
export async function retention(req, res) {
  if (!methodGuard(req, res, "GET", "POST")) return;

  const ctx = await requireAdmin(req);
  if (!ctx) return fail(res, 401, "Authentication required.");

  const currentDays = retentionThreshold();
  const threshold = new Date(Date.now() - currentDays * 86400000).toISOString();
  const supa = db();

  if (req.method === "GET") {
    try {
      const { count: sessionsExpired } = await supa
        .from("visitor_sessions")
        .select("*", { count: "exact", head: true })
        .lt("last_seen_at", threshold);
      const { count: pageViewsExpired } = await supa
        .from("page_views")
        .select("*", { count: "exact", head: true })
        .lt("viewed_at", threshold);
      return ok(res, {
        retention_days: currentDays,
        threshold_utc: threshold,
        expired_sessions: sessionsExpired || 0,
        expired_page_views: pageViewsExpired || 0,
      });
    } catch (err) {
      return fail(res, 500, "Could not read retention data.");
    }
  }

  // POST — purge (owner only by default; allow owner+staff per config)
  if (ctx.admin.role !== "owner") return fail(res, 403, "Only owners can run retention purges.");

  let body;
  try { body = await parseBody(req); } catch (_) { return fail(res, 400, "Invalid body."); }
  const days = safeInt(body.days, currentDays, 30, 7300);
  if (days < 30 || days > 7300) return fail(res, 422, "Retention must be between 30 and 7300 days.");
  const cut = new Date(Date.now() - days * 86400000).toISOString();

  try {
    const d1 = await supa.from("page_views").delete().lt("viewed_at", cut);
    const d2 = await supa.from("visitor_sessions").delete().lt("last_seen_at", cut);
    await supa.from("submission_rate_limits").delete().lte("expires_at", new Date().toISOString()).catch(() => {});

    recordAudit(ctx.admin.id, "retention_purge", "analytics", null, { days, deleted_page_views: d1.count, deleted_sessions: d2.count });
    return ok({ days, deleted_page_views: d1.count || 0, deleted_sessions: d2.count || 0 });
  } catch (err) {
    console.error("[admin/retention]", err.message);
    return fail(res, 500, "Retention purge failed.");
  }
}

function retentionThreshold() {
  return safeInt(process.env.ANALYTICS_RETENTION_DAYS, 180, 30, 7300);
}