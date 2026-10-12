/* ==========================================================================
   Akshaya Milan — Admin console application
   ========================================================================== */
(function () {
  "use strict";

  /* ---------------- small utilities ---------------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(sel));

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  }
  function fmtDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }
  function isoUtc(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

  const STATUS_LABELS = {
    new: "New", contacted: "Contacted", follow_up: "Follow up",
    site_visit_scheduled: "Site visit", converted: "Converted", lost: "Lost",
  };

  const C = {
    mud: "#4a3829", mudDark: "#34261d", warm: "#674d3a",
    gold: "#b59a63", goldLight: "#c9b27d", beige: "#e9ddc8",
    ok: "#3f6b4f", err: "#a3402f", mute: "#6e5c4b",
  };

  /* ---------------- api client ---------------- */
  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ credentials: "same-origin" }, opts || {}));
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (res.status === 401) { window.location.replace("/admin/login"); throw new Error("Session expired"); }
    if (!res.ok || (data && data.ok === false && res.status >= 400)) {
      const err = new Error((data && data.error) || "Request failed (" + res.status + ")");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function apiGet(p) { return api(p); }
  function apiPost(p, body) {
    return api(p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
  }

  /* ---------------- toast ---------------- */
  function toast(msg, kind) {
    const zone = $("#toasts");
    const el = document.createElement("div");
    el.className = "toast " + (kind || "");
    el.textContent = msg;
    zone.appendChild(el);
    setTimeout(function () {
      el.style.opacity = "0";
      el.style.transition = "opacity .4s";
      setTimeout(function () { el.remove(); }, 450);
    }, 3800);
  }

  /* ---------------- global state ---------------- */
  const state = {
    admin: null,
    view: "overview",
    range: { preset: "30", from: "", to: "" },
    enq: { page: 1, limit: 25, search: "", status: "", event_type: "", from: "", to: "", sort: "desc" },
    team: [],
    viewerRole: null,
  };

  const charts = {};

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) { if (charts[k]) { charts[k].destroy(); delete charts[k]; } });
  }

  function rangeParams() {
    const p = state.range;
    if (p.preset === "today") return { range: "today" };
    if (p.preset === "custom") return { range: "custom", from: p.from || "", to: p.to || "" };
    return { range: p.preset }; // 7 | 30 | 90
  }

  /* ---------------- nav + view switching ---------------- */
  const NAV = [
    { id: "overview", label: "Overview" },
    { id: "enquiries", label: "Enquiries" },
    { id: "analytics", label: "Visitor Analytics" },
    { id: "reports", label: "Reports & Exports" },
    { id: "team", label: "Team & Permissions" },
    { id: "settings", label: "Settings" },
  ];

  function renderNav() {
    const navEl = $("#nav");
    navEl.innerHTML = NAV.map(function (n) {
      return '<button class="nav-item" data-view="' + n.id + '" aria-pressed="false">' + navIcon(n.id) + "<span>" + n.label + "</span></button>";
    }).join("") +
      '<div class="nav-divider"></div>' +
      '<button class="nav-item" id="nav-logout" aria-pressed="false">' + navIcon("logout") + "<span>Sign out</span></button>";
    $$(".nav-item[data-view]", navEl).forEach(function (btn) {
      btn.addEventListener("click", function () { switchView(btn.dataset.view); });
    });
    $("#nav-logout", navEl).addEventListener("click", doLogout);
  }

  function navIcon(id) {
    const icons = {
      overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="4.5" rx="1.5"/><rect x="13" y="9.5" width="8" height="11.5" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
      enquiries: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 8 9 6 9-6"/></svg>',
      analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 3v18h18"/><path d="M8 15v3M12 11v7M16 7v11M20 4v14"/></svg>',
      reports: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
      team: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.8M17.5 14.4a6.5 6.5 0 0 1 4 5.6"/></svg>',
      settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z"/></svg>',
      logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>',
    };
    return icons[id] || "";
  }

  function switchView(id) {
    state.view = id;
    $$(".view").forEach(function (v) { v.classList.toggle("active", v.id === "view-" + id); });
    $$(".nav-item[data-view]").forEach(function (b) { b.classList.toggle("active", b.dataset.view === id); });
    window.scrollTo({ top: 0 });
    closeSidebar();
    (renderers[id] || function () {})(id);
  }

  /* ---------------- boot ---------------- */
  async function boot() {
    try {
      const d = await apiGet("/api/auth/session");
      if (!d.authed) { window.location.replace("/admin/login"); return; }
      state.admin = d.admin;
      $("#who-name").textContent = d.admin.display_name;
      $("#who-role").textContent = d.admin.role;
      $("#boot-loading").style.display = "none";
      renderNav();
      $("#logout-btn").addEventListener("click", doLogout);
      $("#burger").addEventListener("click", function () {
        $("#sidebar").classList.toggle("open");
        $("#scrim").classList.toggle("show");
      });
      $("#scrim").addEventListener("click", closeSidebar);
      initDrawer();
      switchView("overview");
    } catch (e) {
      window.location.replace("/admin/login");
    }
  }

  function closeSidebar() {
    $("#sidebar").classList.remove("open");
    $("#scrim").classList.remove("show");
  }

  async function doLogout() {
    try { await apiPost("/api/auth/logout"); } catch (e) { /* ignore */ }
    window.location.replace("/admin/login");
  }

  /* ==================================================================
     OVERVIEW
     ================================================================== */
  async function renderOverview() {
    const el = $("#view-overview");
    el.innerHTML = "";
    el.appendChild(rangeToolbar("overview"));
    el.appendChild(loadingBox());
    bindRangeToolbar(el, function () { renderOverview(); });

    try {
      const d = await apiGet("/api/admin/overview?" + qs(rangeParams()));
      el.innerHTML = "";
      el.appendChild(rangeToolbar("overview"));
      bindRangeToolbar(el, function () { renderOverview(); });
      const s = d.stats || {};
      el.appendChild(cards(s));
      el.appendChild(activityCard(s.recent_activity || []));
    } catch (e) {
      el.innerHTML = scopeError(e.message);
    }
  }

  function cards(s) {
    const status = s.enquiries_status || {};
    const defs = [
      { label: "Unique Sessions", value: s.sessions_window, hint: "distinct anonymous sessions · all-time " + (s.sessions_total || 0) },
      { label: "Page Views", value: s.page_views_window, hint: "all-time " + (s.page_views_total || 0) },
      { label: "Enquiries", value: s.enquiries_window, hint: "in this period" },
      { label: "New Enquiries", value: status.new || 0, hint: "awaiting first contact" },
      { label: "Contacted", value: status.contacted || 0, hint: "" },
      { label: "Site Visits", value: status.site_visit_scheduled || 0, hint: "scheduled" },
      { label: "Converted", value: status.converted || 0, hint: "" },
      { label: "Conversion Rate", value: (s.conversion_rate == null ? 0 : s.conversion_rate) + "%", hint: "converted / total enquiries", serif: true },
      { label: "Visitors Today", value: s.sessions_today, hint: "unique sessions · UTC day" },
      { label: "Last 7 Days", value: s.sessions_7d, hint: "unique sessions" },
      { label: "Last 30 Days", value: s.sessions_30d, hint: "unique sessions" },
    ];
    return '<div class="cards">' + defs.map(function (c) {
      return '<div class="stat-card"><div class="label">' + esc(c.label) + '</div><div class="value">' + esc(c.value) + '</div>' +
        (c.hint ? '<div class="hint">' + esc(c.hint) + "</div>" : "") + "</div>";
    }).join("") + "</div>";
  }

  function activityCard(recent) {
    const rows = (recent || []).slice(0, 12).map(function (r) {
      return "<tr><td>" + esc(fmtDateTime(r.time)) + "</td><td>" + esc(r.path) + "</td>" +
        "<td>" + esc(r.device || "—") + "</td><td class='muted'>" + esc(r.referrer || "direct") + "</td>" +
        "<td class='muted'>" + esc(String(r.session_id).slice(0, 10)) + "</td></tr>";
    }).join("");
    return '<div class="card"><h3>Recent activity</h3><div class="table-wrap"><table class="am-table" style="min-width:640px">' +
      "<thead><tr><th>Time</th><th>Page</th><th>Device</th><th>Referrer</th><th>Session</th></tr></thead>" +
      "<tbody>" + (rows || '<tr><td colspan="5" class="empty">No page views yet. Analytics are only recorded after a visitor accepts the consent prompt.</td></tr>') + "</tbody></table></div></div>";
  }

  /* ==================================================================
     ANALYTICS
     ================================================================== */
  async function renderAnalytics() {
    const el = $("#view-analytics");
    el.innerHTML = "";
    el.appendChild(rangeToolbar("analytics"));
    el.appendChild(loadingBox());
    bindRangeToolbar(el, function () { renderAnalytics(); });
    destroyCharts();

    try {
      const d = await apiGet("/api/admin/overview?" + qs(rangeParams()));
      el.innerHTML = "";
      el.appendChild(rangeToolbar("analytics"));
      bindRangeToolbar(el, function () { renderAnalytics(); });
      const s = d.stats || {};
      el.appendChild(chartsHtml(s));
      el.appendChild(listsHtml(s));
    } catch (e) {
      el.innerHTML = scopeError(e.message);
    }
  }

  function chartsHtml(s) {
    return '<div class="grid-2">' +
      '<div class="card"><h3>Visitors & page views by day</h3><div class="chart-box" id="cb-sessions"><canvas id="ch-sessions"></canvas><div class="chart-missing">Chart library unavailable.</div></div></div>' +
      '<div class="card"><h3>Enquiries & conversions by day</h3><div class="chart-box" id="cb-enq"><canvas id="ch-enq"></canvas><div class="chart-missing">Chart library unavailable.</div></div></div>' +
      '<div class="card"><h3>Devices</h3><div class="chart-box" id="cb-dev"><canvas id="ch-dev"></canvas><div class="chart-missing">Chart library unavailable.</div></div></div>' +
      '<div class="card"><h3>Enquiries by event type</h3><div class="chart-box" id="cb-event"><canvas id="ch-event"></canvas><div class="chart-missing">Chart library unavailable.</div></div></div>' +
      "</div>" + makeChartScripts(s);
  }

  function makeChartScripts(s) {
    const days = (s.daily_series || []).map(function (x) { return x.day; });
    const series = (s.daily_series || []).map(function (x) { return x.sessions; });
    const pv = (s.daily_series || []).map(function (x) { return x.page_views; });
    const enq = (s.daily_series || []).map(function (x) { return x.enquiries; });
    const conv = (s.daily_series || []).map(function (x) { return x.converted; });
    const devices = s.device_breakdown || {};
    const events = s.enquiries_by_event || [];

    const gridColor = "rgba(110,92,75,0.14)";
    const tickColor = C.mute;
    return '<script>window.__amChartData && window.__amChartData(' +
      JSON.stringify({
        days: days, sessions: series, pageViews: pv,
        enquiries: enq, converted: conv,
        devices: [
          { label: "Desktop", value: devices.desktop || 0 },
          { label: "Mobile", value: devices.mobile || 0 },
          { label: "Tablet", value: devices.tablet || 0 },
          { label: "Unknown", value: devices.unknown || 0 },
        ],
        events: events.map(function (x) { return { label: x.event_type, value: x.enquiries }; }),
        palette: { mud: C.mud, gold: C.gold, goldLight: C.goldLight, warm: C.warm, ok: C.ok, beige: C.beige, grid: gridColor, tick: tickColor },
      }) + ");</script>";
  }

  window.__amChartData = function (d) {
    if (typeof Chart === "undefined") {
      $$(".chart-box").forEach(function (b) { b.classList.add("no-chart"); });
      return;
    }
    Chart.defaults.font.family = "Manrope, sans-serif";
    Chart.defaults.color = d.palette.tick;
    Chart.defaults.borderColor = d.palette.grid;

    if (d.days.length) {
      charts.sessions = new Chart($("#ch-sessions"), {
        type: "bar",
        data: { labels: d.days, datasets: [
          { label: "Sessions", data: d.sessions, backgroundColor: d.palette.goldLight, borderRadius: 4 },
          { label: "Page views", data: d.pageViews, backgroundColor: d.palette.mud, borderRadius: 4 },
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true } } }, scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
      charts.enquiries = new Chart($("#ch-enq"), {
        type: "line",
        data: { labels: d.days, datasets: [
          { label: "Enquiries", data: d.enquiries, borderColor: d.palette.gold, backgroundColor: d.palette.gold, tension: 0.3, spanGaps: true },
          { label: "Converted", data: d.converted, borderColor: d.palette.ok, backgroundColor: d.palette.ok, tension: 0.3, spanGaps: true },
        ]},
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { usePointStyle: true } } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
      });
    }

    charts.devices = new Chart($("#ch-dev"), {
      type: "doughnut",
      data: { labels: d.devices.map(function (x) { return x.label; }), datasets: [{ data: d.devices.map(function (x) { return x.value; }), backgroundColor: [d.palette.mud, d.palette.gold, d.palette.warm, d.palette.beige], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { usePointStyle: true } } } },
    });

    charts.events = new Chart($("#ch-event"), {
      type: "bar",
      data: { labels: d.events.map(function (x) { return x.label; }), datasets: [{ label: "Enquiries", data: d.events.map(function (x) { return x.value; }), backgroundColor: d.palette.goldLight, borderRadius: 4 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } },
    });
  };

  function listsHtml(s) {
    const landing = (s.landing_pages || []).map(function (l) {
      return '<div class="list-row"><span class="k">' + esc(l.page) + '</span><span class="v">' + esc(l.sessions) + " sessions</span></div>";
    }).join("");
    const referrers = (s.referrers || []).map(function (r) {
      return '<div class="list-row"><span class="k">' + esc(r.domain) + '</span><span class="v">' + esc(r.sessions) + " sessions</span></div>";
    }).join("");
    const consent = s.consent_breakdown || {};
    return '<div class="grid-2">' +
      '<div class="card"><h3>Top landing pages</h3><div class="list-block">' + (landing || '<div class="empty">No data yet.</div>') + "</div></div>" +
      '<div class="card"><h3>Referral sources</h3><div class="list-block">' + (referrers || '<div class="empty">No data yet.</div>') + "</div></div>" +
      '<div class="card"><h3>Consent state</h3><div class="list-block">' +
      '<div class="list-row"><span class="k">Opted in</span><span class="v">' + esc(consent.accepted || 0) + " sessions</span></div>" +
      '<div class="list-row"><span class="k">Opted out / not asked</span><span class="v">' + esc((consent.declined || 0) + (consent.withdrawn || 0)) + " sessions</span></div>" +
      '<p class="chart-note">Anonymous browsing records are only created after a visitor opts in. "Sessions" are pseudonymous IDs, never identified people.</p></div></div>' +
      "</div>";
  }

  /* ---------------- shared toolbar ---------------- */
  function rangeToolbar(viewName) {
    const r = state.range;
    return '<div class="toolbar">' +
      '<div class="field"><label for="rng-preset">Period</label><select id="rng-preset">' +
      '<option value="today"' + (r.preset === "today" ? " selected" : "") + ">Today</option>" +
      '<option value="7"' + (r.preset === "7" ? " selected" : "") + ">Last 7 days</option>" +
      '<option value="30"' + (r.preset === "30" ? " selected" : "") + ">Last 30 days</option>" +
      '<option value="90"' + (r.preset === "90" ? " selected" : "") + ">Last 90 days</option>" +
      '<option value="custom"' + (r.preset === "custom" ? " selected" : "") + ">Custom range</option></select></div>" +
      '<div class="field" id="rng-from-wrap" style="display:none"><label for="rng-from">From</label><input id="rng-from" type="date" value="' + esc(r.from) + '" /></div>' +
      '<div class="field" id="rng-to-wrap" style="display:none"><label for="rng-to">To</label><input id="rng-to" type="date" value="' + esc(r.to) + '" /></div>' +
      '<div class="actions"><button class="btn btn-outline" id="rng-apply">Apply</button></div>' +
      (viewName === "overview" ? "" : "") +
      "</div>";
  }

  function bindRangeToolbar(container, cb) {
    const preset = $("#rng-preset", container);
    if (!preset) return;
    const fromWrap = $("#rng-from-wrap", container);
    const toWrap = $("#rng-to-wrap", container);
    function toggleCustom() {
      const c = preset.value === "custom";
      fromWrap.style.display = c ? "" : "none";
      toWrap.style.display = c ? "" : "none";
    }
    preset.addEventListener("change", toggleCustom);
    toggleCustom();
    $("#rng-apply", container).addEventListener("click", function () {
      state.range.preset = preset.value;
      if (preset.value === "custom") {
        const f = $("#rng-from", container).value;
        const t = $("#rng-to", container).value;
        if (!f || !t) { toast("Choose both dates for a custom range.", "err"); return; }
        state.range.from = f;
        state.range.to = t;
      }
      cb();
    });
  }

  function qs(params) {
    return Object.keys(params)
      .filter(function (k) { return params[k] !== "" && params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); })
      .join("&");
  }

  function loadingBox() { return '<div class="loading">Loading…</div>'; }
  function scopeError(msg) {
    return '<div class="card"><div class="empty">Could not load this view — ' + esc(msg) + "</div></div>";
  }

  /* ==================================================================
     ENQUIRIES
     ================================================================== */
  async function renderEnquiries(force) {
    const el = $("#view-enquiries");
    el.innerHTML = "";
    el.appendChild(enquiriesToolbar());
    el.appendChild(loadingBox());

    try {
      await loadEnquiriesTable(el);
      bindEnquiriesEvents(el);
    } catch (e) {
      el.innerHTML = scopeError(e.message);
    }
  }

  function enquiriesToolbar() {
    const f = state.enq;
    return '<div class="toolbar">' +
      '<div class="field grow"><label for="enq-search">Search</label><input id="enq-search" type="text" placeholder="Name, phone or email…" value="' + esc(f.search) + '" /></div>' +
      '<div class="field"><label for="enq-status">Status</label><select id="enq-status"><option value="">All statuses</option>' +
      Object.keys(STATUS_LABELS).map(function (k) { return '<option value="' + k + '"' + (f.status === k ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>"; }).join("") +
      "</select></div>" +
      '<div class="field"><label for="enq-event">Event type</label><select id="enq-event"><option value="">All events</option>' +
      ["Wedding", "Reception", "Engagement", "Birthday", "Corporate", "Corporate Event", "Other"].map(function (e) {
        return '<option value="' + esc(e) + '"' + (f.event_type === e ? " selected" : "") + ">" + esc(e) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label for="enq-sort">Sort</label><select id="enq-sort">' +
      '<option value="desc"' + (f.sort === "desc" ? " selected" : "") + ">Newest first</option>" +
      '<option value="asc"' + (f.sort === "asc" ? " selected" : "") + ">Oldest first</option></select></div>" +
      '<div class="actions"><button class="btn btn-gold" id="enq-filter">Apply</button>' +
      '<button class="btn btn-outline" id="enq-reset">Reset</button></div>' +
      "</div>";
  }

  function bindEnquiriesEvents(el) {
    $("#enq-filter", el).addEventListener("click", function () {
      state.enq.search = $("#enq-search", el).value.trim();
      state.enq.status = $("#enq-status", el).value;
      state.enq.event_type = $("#enq-event", el).value;
      state.enq.sort = $("#enq-sort", el).value;
      state.enq.page = 1;
      renderEnquiries();
    });
    $("#enq-search", el).addEventListener("keydown", function (e) {
      if (e.key === "Enter") { $(".actions", el) && $("#enq-filter", el).click(); }
    });
    $("#enq-reset", el).addEventListener("click", function () {
      state.enq = { page: 1, limit: 25, search: "", status: "", event_type: "", from: "", to: "", sort: "desc" };
      renderEnquiries();
    });
  }

  async function loadEnquiriesTable(el) {
    const f = state.enq;
    const params = { search: f.search, status: f.status, event_type: f.event_type, sort: f.sort, page: f.page, limit: f.limit };
    const d = await apiGet("/api/admin/enquiries?" + qs(params));
    const rows = d.rows || [];
    const total = d.total || 0;
    const pages = Math.max(1, Math.ceil(total / f.limit));

    const head = '<div class="toolbar" style="margin-bottom:2px"><div style="font-size:13px;color:var(--am-mute)"><strong>' + total + "</strong> enquiry" + (total === 1 ? "" : "ies") + "</div>" +
      '<span class="spacer" style="flex:1"></span>' +
      '<button class="btn btn-outline btn-sm" id="enq-export-csv">Export CSV</button>' +
      '<button class="btn btn-outline btn-sm" id="enq-export-xlsx">Export Excel</button></div>';

    const body = rows.map(function (r) {
      return "<tr>" +
        "<td class='muted'>" + esc(fmtDate(r.created_at)) + "</td>" +
        "<td><strong>" + esc(r.full_name) + "</strong></td>" +
        "<td><a href='tel:" + esc(r.phone) + "'>" + esc(r.phone) + "</a></td>" +
        "<td class='muted'>" + esc(r.email || "—") + "</td>" +
        "<td>" + esc(r.event_type || "—") + "</td>" +
        "<td class='muted'>" + esc(r.event_date || "—") + "</td>" +
        "<td>" + esc(r.guest_count || "—") + "</td>" +
        '<td><span class="badge badge-' + esc(r.status) + '">' + (STATUS_LABELS[r.status] || r.status) + "</span></td>" +
        "<td class='muted'>" + esc(r.assigned_name || "—") + "</td>" +
        '<td><div class="row-actions"><button class="btn btn-dark btn-sm" data-open="' + esc(r.id) + '">View</button></div></td>' +
        "</tr>";
    }).join("");

    const paginate = '<div class="pagination"><span class="info">Page ' + f.page + " of " + pages + "</span>" +
      '<div style="display:flex;gap:8px"><button class="btn btn-outline btn-sm" id="enq-prev"' + (f.page <= 1 ? " disabled" : "") + ">← Prev</button>" +
      '<button class="btn btn-outline btn-sm" id="enq-next"' + (f.page >= pages ? " disabled" : "") + ">Next →</button></div></div>";

    el.innerHTML =
      (el.querySelector(".toolbar") ? el.querySelector(".toolbar").outerHTML : "") +
      head +
      '<div class="table-wrap"><table class="am-table">' +
      "<thead><tr><th>Date</th><th>Customer</th><th>Phone</th><th>Email</th><th>Event</th><th>Event date</th><th>Guests</th><th>Status</th><th>Assigned</th><th></th></tr></thead>" +
      "<tbody>" + (body || '<tr><td colspan="10" class="empty">No enquiries match your filters.</td></tr>') + "</tbody></table></div>" +
      paginate;

    if (f.page > 1) $("#enq-prev", el).addEventListener("click", function () { state.enq.page--; renderEnquiries(); });
    if (f.page < pages) $("#enq-next", el).addEventListener("click", function () { state.enq.page++; renderEnquiries(); });

    $$("[data-open]", el).forEach(function (b) { b.addEventListener("click", function () { openDrawer(b.dataset.open); }); });

    $("#enq-export-csv", el).addEventListener("click", function () { exportFile("enquiries", "csv"); });
    $("#enq-export-xlsx", el).addEventListener("click", function () { exportFile("enquiries", "xlsx"); });
  }

  /* ---------------- enquiry drawer ---------------- */
  function initDrawer() {
    $("#drawer-close").addEventListener("click", closeDrawer);
    $("#drawer-scrim").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  }
  function openDrawer(id) { $("#enquiry-drawer").classList.add("open"); $("#drawer-scrim").classList.add("show"); loadDrawer(id); }
  function closeDrawer() { $("#enquiry-drawer").classList.remove("open"); $("#drawer-scrim").classList.remove("show"); }

  async function loadDrawer(id) {
    const body = $("#drawer-body");
    body.innerHTML = '<div class="loading">Loading…</div>';
    try {
      const d = await apiGet("/api/admin/enquiries?id=" + encodeURIComponent(id));
      const e = d.enquiry || {};
      body.innerHTML = drawerHtml(e, d.history || []);
      const sel = $("#d-status", body);
      if (sel) sel.addEventListener("change", function () { $("#save-wrap", body).style.display = ""; });
      $("#d-save", body).addEventListener("click", function () { saveDrawer(e.id); });
    } catch (err) {
      body.innerHTML = scopeError(err.message);
    }
  }

  function drawerHtml(e, history) {
    const waMsg = "Hi Akshaya Milan, following up on an enquiry from " + e.full_name + " (" + e.phone + ").";
    const historyHtml = history.map(function (h) {
      return '<div class="history-item"><div>' + (h.from_status ? "Changed from <strong>" + esc(STATUS_LABELS[h.from_status]) + "</strong> to <strong>" + esc(STATUS_LABELS[h.to_status]) + "</strong>" : "Set to <strong>" + esc(STATUS_LABELS[h.to_status]) + "</strong>") +
        (h.note ? " — " + esc(h.note) : "") + '</div><div class="muted" style="font-size:12px">' + esc(fmtDateTime(h.changed_at)) + "</div></div>";
    }).join("");

    return "<h4>Customer</h4>" +
      '<dl class="kv">' +
      "<dt>Name</dt><dd>" + esc(e.full_name) + "</dd>" +
      "<dt>Phone</dt><dd>" + esc(e.phone || "—") + "</dd>" +
      "<dt>Email</dt><dd>" + esc(e.email || "—") + "</dd>" +
      "<dt>Submitted</dt><dd>" + esc(fmtDateTime(e.created_at)) + "</dd>" +
      "<dt>Lead source</dt><dd>" + esc(e.lead_source || "website") + "</dd>" +
      "</dl>" +
      '<div class="contact-row">' +
      '<a class="btn btn-outline btn-sm" href="tel:' + esc(e.phone) + '">Call</a>' +
      '<a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="https://wa.me/919845691995?text=' + encodeURIComponent(waMsg) + '">WhatsApp</a>' +
      (e.email ? '<a class="btn btn-outline btn-sm" href="mailto:' + esc(e.email) + '">Email</a>' : "") +
      "</div>" +
      "<h4>Event</h4>" +
      '<dl class="kv">' +
      "<dt>Type</dt><dd>" + esc(e.event_type || "—") + "</dd>" +
      "<dt>Event date</dt><dd>" + esc(e.event_date || "—") + "</dd>" +
      "<dt>Guests</dt><dd>" + esc(e.guest_count || "—") + "</dd>" +
      "<dt>Preferred space</dt><dd>" + esc(e.range || "—") + "</dd>" +
      "<dt>Preferred time</dt><dd>" + esc(e.time || "—") + "</dd>" +
      "<dt>Services</dt><dd>" + esc(e.services && e.services.length ? e.services.join(", ") : "—") + "</dd>" +
      "<dt>Message</dt><dd>" + esc(e.message || "—") + "</dd>" +
      "</dl>" +
      "<h4>Manage</h4>" +
      '<div class="field"><label for="d-status">Status</label><select id="d-status">' +
      Object.keys(STATUS_LABELS).map(function (k) {
        return '<option value="' + k + '"' + (e.status === k ? " selected" : "") + ">" + STATUS_LABELS[k] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label for="d-assign">Assigned staff</label><select id="d-assign">' +
      '<option value="">Unassigned</option>' +
      state.team.map(function (t) {
        return '<option value="' + esc(t.auth_user_id) + '"' + (e.assigned_to === t.auth_user_id ? " selected" : "") + ">" + esc(t.display_name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label for="d-notes">Internal notes (staff only)</label><textarea id="d-notes" rows="3">' + esc(e.internal_notes || "") + "</textarea></div>" +
      '<div class="field"><label for="d-note">Status-change note (optional)</label><input id="d-note" type="text" placeholder="e.g. Site visit confirmed for Sunday" /></div>' +
      '<div id="save-wrap" style="display:none"><button class="btn btn-gold" id="d-save">Save changes</button>' +
      '<button class="btn btn-outline" id="d-cancel" style="margin-left:8px">Cancel</button></div>' +
      (historyHtml ? "<h4>Status history</h4>" + historyHtml : "");
  }

  async function saveDrawer(id) {
    const body = $("#drawer-body");
    const payload = {
      id: id,
      status: $("#d-status", body).value,
      assigned_to: $("#d-assign", body).value || null,
      internal_notes: $("#d-notes", body).value,
      note: $("#d-note", body).value,
    };
    if (!$("#save-wrap", body) || $("#save-wrap", body).style.display === "") {
      $("#save-wrap", body).style.display = "none";
    }
    try {
      await apiPost("/api/admin/enquiries", payload);
      toast("Enquiry updated.");
      closeDrawer();
      renderEnquiries();
    } catch (e) {
      toast(e.message, "err");
    }
  }

  /* ==================================================================
     REPORTS & EXPORTS
     ================================================================== */
  async function renderReports() {
    const el = $("#view-reports");
    const owner = state.admin && state.admin.role === "owner";
    el.innerHTML =
      '<div class="view-head"><h2>Reports & Exports</h2><p>Download real, filtered records from the database in CSV or Excel format.</p></div>' +
      '<div class="report-card"><div><h3>Enquiries export</h3><p>All enquiry fields (name, phone, email, event, dates, message, status, assigned staff). Respects the filters applied on the Enquiries page.</p>' +
      (owner ? '<small style="color:var(--am-mute)">Internal notes can be included below (owner only).</small>' : '<small style="color:var(--am-mute)">Internal notes are never exported for staff accounts.</small>') +
      "</div><div class='report-actions'>" +
      "<label class='field' style='flex-direction:row;align-items:center;gap:8px;margin:0'><input type='checkbox' id='rep-notes' " + (owner ? "" : "disabled") + " /> <span>Include internal notes</span></label>" +
      '<button class="btn btn-gold" id="rep-enq-csv">CSV</button><button class="btn btn-gold" id="rep-enq-xlsx">Excel</button></div></div>' +
      '<div class="report-card"><div><h3>Analytics export</h3><p>Daily aggregates: page views, unique sessions, enquiries, conversions, device totals, top landing pages and referral sources for the selected period.</p></div>' +
      '<div class="report-actions"><button class="btn btn-gold" id="rep-an-csv">CSV</button><button class="btn btn-gold" id="rep-an-xlsx">Excel</button></div></div>' +
      '<div class="card"><h3>Privacy note</h3><p style="margin:0;color:var(--am-mute);font-size:13.5px">Exports contain lead contact details you are entitled to process for responding to enquiries. Anonymous analytics contain no IP addresses, fingerprints or personal identifiers — sessions are pseudonymous and are never linked to an individual.</p></div>';
    $("#rep-enq-csv", el).addEventListener("click", function () { exportFile("enquiries", "csv"); });
    $("#rep-enq-xlsx", el).addEventListener("click", function () { exportFile("enquiries", "xlsx"); });
    $("#rep-an-csv", el).addEventListener("click", function () { exportFile("analytics", "csv"); });
    $("#rep-an-xlsx", el).addEventListener("click", function () { exportFile("analytics", "xlsx"); });
  }

  function exportFile(kind, format) {
    const params = Object.assign(
      { kind: kind, format: format },
      kind === "analytics" ? rangeParams() : {
        search: state.enq.search, status: state.enq.status,
        event_type: state.enq.event_type, range: "custom",
        from: state.enq.from || isoUtc(daysAgo(365)),
        to: state.enq.to || isoUtc(new Date()),
      }
    );
    if (kind === "enquiries" && $("#rep-notes") && $("#rep-notes").checked) params.include_notes = "1";
    const url = "/api/admin/exports?" + qs(params);
    toast("Preparing " + format.toUpperCase() + " export…");
    fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("Export failed");
        return r.blob();
      })
      .then(function (blob) {
        const a = document.createElement("a");
        const p = new URLSearchParams(params);
        a.href = URL.createObjectURL(blob);
        a.download = "akshaya-milan-" + kind + "." + format;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        toast("Export downloaded.");
      })
      .catch(function (e) { toast(e.message || "Export failed.", "err"); });
  }

  /* ==================================================================
     TEAM & PERMISSIONS
     ================================================================== */
  async function renderTeam() {
    const el = $("#view-team");
    el.innerHTML = "";
    el.appendChild(loadingBox());
    try {
      const d = await apiGet("/api/admin/team");
      state.team = d.team || [];
      renderTeamBody(el, d);
    } catch (e) {
      el.innerHTML = scopeError(e.message);
    }
  }

  function renderTeamBody(el, d) {
    const owner = d.viewer.is_owner;
    el.innerHTML =
      '<div class="view-head"><h2>Team & Permissions</h2><p>Administrators who can view enquiries and analytics. Roles and activity changes are owner-only.</p></div>' +
      '<div class="table-wrap"><table class="am-table" style="min-width:640px">' +
      "<thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>" +
      (d.team.map(function (t) {
        return "<tr>" +
          "<td><strong>" + esc(t.display_name) + "</strong>" + (t.is_me ? ' <span class="badge badge-contacted">you</span>' : "") + "</td>" +
          "<td class='muted'>" + esc(t.email || "—") + "</td>" +
          '<td><span class="badge badge-' + (t.role === "owner" ? "converted" : "contacted") + '">' + esc(t.role) + "</span></td>" +
          "<td>" + (t.is_active ? '<span class="badge badge-contacted">active</span>' : '<span class="badge badge-lost">inactive</span>') + "</td>" +
          "<td class='muted'>" + esc(fmtDate(t.created_at)) + "</td>" +
          "<td>" + (owner && !t.is_me ? '<div class="row-actions">' +
            '<button class="btn btn-outline btn-sm" data-toggle-active="' + esc(t.id) + '">' + (t.is_active ? "Deactivate" : "Activate") + "</button>" +
            '<button class="btn btn-outline btn-sm" data-toggle-role="' + esc(t.id) + '" data-role="' + esc(t.role) + '">' + (t.role === "owner" ? "Demote" : "Promote") + "</button></div>" : "") + "</td></tr>";
      }).join("")) +
      "</tbody></table></div>" +
      (owner ? teamAddForm() : '<p class="chart-note">Only owners can add or modify team members.</p>');
    bindTeamEvents(el, d);
  }

  function teamAddForm() {
    return '<div class="card" style="margin-top:20px"><h3>Add a team member</h3>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px">' +
      '<div class="field"><label>Display name</label><input id="t-name" type="text" /></div>' +
      '<div class="field"><label>Email</label><input id="t-email" type="email" /></div>' +
      '<div class="field"><label>Role</label><select id="t-role"><option value="staff">Staff</option><option value="owner">Owner</option></select></div>' +
      '<div class="field"><label>Temporary password (min 10 chars)</label><input id="t-pass" type="password" autocomplete="new-password" /></div>' +
      '<div class="field"><button class="btn btn-gold" id="t-add" style="align-self:end">Add member</button></div>' +
      "</div></div>";
  }

  function bindTeamEvents(el, d) {
    $("#t-add", el) && $("#t-add", el).addEventListener("click", async function () {
      const body = {
        action: "add",
        display_name: $("#t-name", el).value.trim(),
        email: $("#t-email", el).value.trim(),
        role: $("#t-role", el).value,
        password: $("#t-pass", el).value,
      };
      if (!body.display_name || !body.email || body.password.length < 10) {
        toast("Provide a name, email and a password of at least 10 characters.", "err");
        return;
      }
      try {
        await apiPost("/api/admin/team", body);
        toast("Team member added.");
        renderTeam();
      } catch (e) { toast(e.message, "err"); }
    });

    $$("[data-toggle-active]", el).forEach(function (b) {
      b.addEventListener("click", function () {
        updateMember(b.dataset.toggleActive, { action: "update", id: b.dataset.toggleActive, is_active: b.textContent.trim() === "Activate" });
      });
    });
    $$("[data-toggle-role]", el).forEach(function (b) {
      b.addEventListener("click", function () {
        updateMember(b.dataset.toggleRole, { action: "update", id: b.dataset.toggleRole, role: b.dataset.role === "owner" ? "staff" : "owner" });
      });
    });
  }

  async function updateMember(id, body) {
    if (!confirm("Are you sure you want to make this change?")) return;
    try {
      await apiPost("/api/admin/team", body);
      toast("Team updated.");
      renderTeam();
    } catch (e) { toast(e.message, "err"); }
  }

  /* ==================================================================
     SETTINGS
     ================================================================== */
  async function renderSettings() {
    const el = $("#view-settings");
    el.innerHTML = '<div class="view-head"><h2>Settings</h2><p>Retention, privacy and account information.</p></div>' + loadingBox();
    try {
      const s = await apiGet("/api/admin/retention");
      renderSettingsBody(el, s);
    } catch (e) {
      el.innerHTML = scopeError(e.message);
    }
  }

  function renderSettingsBody(el, s) {
    const owner = state.admin && state.admin.role === "owner";
    el.innerHTML =
      '<div class="card"><h3>Analytics retention</h3>' +
      '<div class="setting-row"><div><h4>Retention policy</h4><p>Anonymous page views and sessions older than <strong>' + esc(s.retention_days) + " days</strong> (before " + esc(fmtDate(s.threshold_utc)) + ") are eligible for deletion.</p></div></div>" +
      '<div class="setting-row"><div><h4>Records awaiting deletion</h4><p>' + esc(s.expired_page_views) + " page views and " + esc(s.expired_sessions) + " sessions currently exceed the retention window.</p></div>" +
      (owner ? '<button class="btn btn-danger" id="set-purge">Delete expired now</button>' : '<span class="badge badge-lost">owner only</span>') + "</div>" +
      "<p class='chart-note'>Retention is a configurable privacy control. The default of 180 days can be tuned with the <code>ANALYTICS_RETENTION_DAYS</code> environment variable (30–7300).</p></div>" +
      '<div class="card"><h3>Consent & privacy</h3>' +
      '<div class="setting-row"><div><h4>Visitor tracking</h4><p>First-party, consent-gated analytics. No IP addresses, no fingerprints, no third-party trackers. Anonymous sessions are never linked to enquiries or identities.</p></div></div>' +
      '<div class="setting-row"><div><h4>Public privacy notice</h4><p>Explains what is collected and why, with simple opt-out controls.</p></div>' +
      '<a class="btn btn-outline btn-sm" target="_blank" href="/privacy">Read the notice</a></div></div>' +
      '<div class="card"><h3>Your account</h3>' +
      '<div class="setting-row"><div><h4>' + esc(state.admin.display_name) + "</h4><p>" + esc(state.admin.email) + " · role: " + esc(state.admin.role) + "</p></div>" +
      '<a class="btn btn-outline btn-sm" href="/admin/reset-password">Reset password</a></div></div>';

    if (owner) {
      const d = $("#set-purge", el);
      d.addEventListener("click", function () {
        if (!confirm("Delete all analytics records older than the retention window? This cannot be undone.")) return;
        apiPost("/api/admin/retention", { days: Number(s.retention_days) })
          .then(function (r) { toast("Purged " + r.deleted_page_views + " page views and " + r.deleted_sessions + " sessions."); renderSettings(); })
          .catch(function (e) { toast(e.message, "err"); });
      });
    }
  }

  /* ---------------- renderer registry & boot ---------------- */
  const renderers = {
    overview: function () { renderOverview(); },
    analytics: function () { renderAnalytics(); },
    enquiries: function () { renderEnquiries(); },
    reports: function () { renderReports(); },
    team: function () { renderTeam(); },
    settings: function () { renderSettings(); },
  };

  document.addEventListener("DOMContentLoaded", boot);
})();