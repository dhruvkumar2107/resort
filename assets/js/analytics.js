/* ==========================================================================
   Akshaya Milan — Privacy-conscious first-party analytics + consent banner.

   What this does:
   - Generates a random pseudonymous session id (never a name/email/device id).
   - Shows a small consent banner; NOTHING is tracked until the visitor opts in.
   - Records consent via /api/analytics/consent and page views / engagement via
     /api/analytics/track (validated, rate-limited, derivations done server-side).
   - Never sends IP addresses, names, emails, phone numbers or fingerprints.
   ========================================================================== */
(function () {
  "use strict";

  const CONSENT_KEY = "am_consent";
  const SESSION_KEY = "am_session";

  function newSession() {
    let id;
    try {
      id = (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) || undefined;
    } catch (e) { id = undefined; }
    if (!id) id = "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    return id;
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setSessionCookie(id) {
    document.cookie = SESSION_KEY + "=" + encodeURIComponent(id) + "; path=/; max-age=1800; SameSite=Lax";
  }

  function consentIs() {
    const v = getCookie(CONSENT_KEY);
    return ["accepted", "declined"].indexOf(v) !== -1 ? v : null;
  }

  function beacon(url, payload) {
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([JSON.stringify(payload)], { type: "application/json" }));
        return;
      }
    } catch (e) { /* ignore */ }
    try {
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
        keepalive: true,
      }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  function currentPath() {
    return (location.pathname || "/").slice(0, 300);
  }

  /* ---------- consent banner ---------- */
  function ensureBanner() {
    if (document.getElementById("am-consent-banner")) return;
    var privacyHref = document.querySelector('[href="privacy.html"], [href="/privacy.html"]')
      ? document.querySelector('[href="privacy.html"], [href="/privacy.html"]').getAttribute("href")
      : "privacy.html";

    var styles =
      "#am-consent-banner{" +
      "position:fixed;left:14px;right:14px;bottom:14px;z-index:9000;" +
      "max-width:520px;margin:0 auto;background:#34261d;color:#e9ddc8;" +
      "border:1px solid rgba(181,154,99,.45);border-radius:14px;" +
      "box-shadow:0 14px 40px rgba(0,0,0,.28);padding:18px 20px;" +
      "font-family:Manrope,system-ui,sans-serif;font-size:13.5px;line-height:1.5;" +
      "transition:opacity .3s, transform .3s;}" +
      "#am-consent-banner p{margin:0 0 12px;}" +
      "#am-consent-banner a{color:#c9b27d;}" +
      "#am-consent-actions{display:flex;flex-wrap:wrap;gap:8px;}" +
      ".am-consent-btn{border:1px solid #b59a63;background:#b59a63;color:#fff;" +
      "border-radius:9px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;}" +
      ".am-consent-btn:hover{background:#9c824a;}" +
      ".am-consent-btn.ghost{background:transparent;color:#e9ddc8;}" +
      "@media(max-width:520px){#am-consent-banner{left:10px;right:10px;bottom:10px;}}";

    var styleEl = document.createElement("style");
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);

    var banner = document.createElement("div");
    banner.id = "am-consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML =
      "<p><strong>Help us improve.</strong> We use lightweight, first-party analytics to understand which pages are useful. We collect <em>no</em> personal data — no IP addresses, names or locations — and we never track you across other sites.</p>" +
      "<div id='am-consent-actions'>" +
      "<button type='button' class='am-consent-btn' data-decision='accepted'>Accept analytics</button>" +
      "<button type='button' class='am-consent-btn ghost' data-decision='declined'>Decline</button>" +
      '<a href="' + privacyHref + '" style="align-self:center;font-size:13px">Our privacy notice →</a>' +
      "</div>";
    document.body.appendChild(banner);

    banner.querySelectorAll("[data-decision]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setConsent(btn.dataset.decision);
        hideBanner();
      });
    });
  }

  function hideBanner() {
    var b = document.getElementById("am-consent-banner");
    if (!b) return;
    b.style.opacity = "0";
    b.style.transform = "translateY(8px)";
    setTimeout(function () { b.remove(); }, 320);
  }

  function setConsent(decision) {
    fetch("/api/analytics/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consent: decision }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(function () {
      // Fallback cookie in case the API is unreachable.
      document.cookie = CONSENT_KEY + "=" + decision + "; path=/; max-age=" + 60 * 60 * 24 * 365 + "; SameSite=Lax";
    });
  }

  /* ---------- tracking ---------- */
  let session = getCookie(SESSION_KEY);
  const startTs = Date.now();

  function pageView() {
    if (!session) { session = newSession(); setSessionCookie(session); }
    beacon("/api/analytics/track", { type: "page_view", session_id: session, page_path: currentPath() });
  }

  function engagement() {
    if (!session) return;
    beacon("/api/analytics/track", {
      type: "engagement",
      session_id: session,
      page_path: currentPath(),
      duration_seconds: Math.round((Date.now() - startTs) / 1000),
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") engagement();
  });
  window.addEventListener("pagehide", engagement);
  window.addEventListener("beforeunload", engagement);

  /* ---------- boot ---------- */
  window.addEventListener("load", function () {
    if (session) setSessionCookie(session); // slide the window
    const decision = consentIs();
    if (decision === "accepted") pageView();
    else if (decision === null) ensureBanner();
    // declined -> nothing is tracked and no banner is shown again.
  });
})();