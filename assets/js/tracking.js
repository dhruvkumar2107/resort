/* ==========================================================================
   Akshaya Milan — Third-party tracking (GA4, Meta Pixel, GTM) with Consent Mode v2
   Loads ONLY after user accepts analytics consent.
   ========================================================================== */
(function () {
  "use strict";

  const CONFIG = {
    GA_MEASUREMENT_ID: "",
    META_PIXEL_ID: "",
    GTM_CONTAINER_ID: "",
  };

  let initialized = false;
  let consentGranted = false;

  function init(config) {
    if (initialized) return;
    CONFIG.GA_MEASUREMENT_ID = config.GA_MEASUREMENT_ID || "";
    CONFIG.META_PIXEL_ID = config.META_PIXEL_ID || "";
    CONFIG.GTM_CONTAINER_ID = config.GTM_CONTAINER_ID || "";
    initialized = true;

    if (CONFIG.GTM_CONTAINER_ID) {
      loadGTM();
    } else {
      if (CONFIG.GA_MEASUREMENT_ID) loadGA4();
      if (CONFIG.META_PIXEL_ID) loadMetaPixel();
    }
  }

  function loadGTM() {
    const id = CONFIG.GTM_CONTAINER_ID;
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
    const f = document.getElementsByTagName("script")[0];
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtm.js?id=" + id;
    f.parentNode.insertBefore(script, f);

    const noscript = document.createElement("noscript");
    const iframe = document.createElement("iframe");
    iframe.src = "https://www.googletagmanager.com/ns.html?id=" + id;
    iframe.height = "0";
    iframe.width = "0";
    iframe.style.display = "none";
    iframe.style.visibility = "hidden";
    noscript.appendChild(iframe);
    document.body.insertBefore(noscript, document.body.firstChild);

    setDefaultConsent();
  }

  function loadGA4() {
    const id = CONFIG.GA_MEASUREMENT_ID;
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag("js", new Date());
    gtag("config", id, { send_page_view: false });

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + id;
    document.head.appendChild(script);

    setDefaultConsent();
  }

  function loadMetaPixel() {
    const id = CONFIG.META_PIXEL_ID;
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

    fbq("init", id);
    fbq("track", "PageView");
  }

  function setDefaultConsent() {
    if (!window.gtag) return;
    window.gtag("consent", "default", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      functionality_storage: "granted",
      personalization_storage: "granted",
      security_storage: "granted",
      wait_for_update: 500,
    });
  }

  function grantConsent() {
    if (consentGranted) return;
    consentGranted = true;

    if (window.gtag) {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "granted",
        ad_user_data: "granted",
        ad_personalization: "granted",
      });
    }

    if (CONFIG.GA_MEASUREMENT_ID && window.gtag) {
      window.gtag("config", CONFIG.GA_MEASUREMENT_ID, { send_page_view: true });
    }

    if (CONFIG.META_PIXEL_ID && window.fbq) {
      fbq("consent", "grant");
    }
  }

  function trackEvent(eventName, params) {
    if (window.gtag) {
      window.gtag("event", eventName, params);
    }
    if (window.fbq) {
      const fbEventMap = {
        whatsapp_click: "Contact",
        phone_click: "Contact",
        enquiry_submit: "Lead",
        directions_click: "Contact",
        page_view: "PageView",
      };
      const fbEvent = fbEventMap[eventName] || "CustomEvent";
      fbq("trackCustom", fbEvent, params);
    }
  }

  function trackPageView(path) {
    if (window.gtag) {
      window.gtag("config", CONFIG.GA_MEASUREMENT_ID, {
        page_path: path,
        send_page_view: true,
      });
    }
    if (window.fbq) {
      fbq("track", "PageView");
    }
  }

  window.AM_Tracking = {
    init: init,
    grantConsent: grantConsent,
    trackEvent: trackEvent,
    trackPageView: trackPageView,
  };
})();