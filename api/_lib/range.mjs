/* Date-range parsing shared by admin analytics endpoints.
   Accepted: ?range=today|7|30|custom&from=YYYY-MM-DD&to=YYYY-MM-DD (UTC). */

export function parseRange(query, { maxDays = 366 } = {}) {
  const q = query || {};
  let from, to;
  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  let today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const range = String(q.range || "30");
  if (range === "today") {
    from = new Date(today.toISOString());
    to = end;
  } else if (range === "7") {
    from = new Date(Date.now() - 7 * 86400000);
    to = end;
  } else if (range === "30") {
    from = new Date(Date.now() - 30 * 86400000);
    to = end;
  } else {
    // custom (or default) — explicit from/to win
    from = parseDateParam(q.from) || new Date(Date.now() - 30 * 86400000);
    to = parseDateParam(q.to) || end;
  }

  if (to - from > maxDays * 86400000) {
    from = new Date(to.getTime() - maxDays * 86400000);
  }
  if (to < from) to = new Date(from.getTime() + 86400000);

  return { from, to };
}

function parseDateParam(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(0, 0, 0, 0);
  return d;
}