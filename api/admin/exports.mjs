/* GET /api/admin/exports — filtered CSV / XLSX downloads from real records.
   kind=enquiries|analytics  format=csv|xlsx
   Enquiry export honors date/status/event_type filters. Internal notes are only
   ever included when the exporting administrator is an owner. */

import { methodGuard, fail } from "../_lib/http.mjs";
import { requireAdmin } from "../_lib/auth.mjs";
import { db } from "../_lib/db.mjs";
import { parseRange } from "../_lib/range.mjs";
import { STATUSES } from "../_lib/validate.mjs";
import { toCsv, toXlsx, sendExport, CSV_MIME, XLSX_MIME, attachmentName } from "../_lib/exporters.mjs";
import { recordAudit } from "../_lib/audit.mjs";

const columns = {
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

export default async function handler(req, res) {
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
      const { data, error } = await supa.rpc("stats_overview", {
        src: from.toISOString(),
        dst: to.toISOString(),
      });
      if (error) throw error;

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

    const cols = columns[kind];
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