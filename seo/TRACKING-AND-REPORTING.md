# Phase 6 — Tracking & Reporting (Akshaya Milan)

## 1. Set up the four tools

**GA4**
1. Create a property at https://analytics.google.com → Admin → Create Property (name: Akshaya Milan, timezone: India, currency: INR).
2. Add a Web data stream with URL `https://www.akshayamilan.com`. Copy the Measurement ID (`G-XXXXXXX`).
3. Install: either add the gtag snippet just before `</head>` on every page, or (recommended) use Google Tag Manager and add the GA4 tag there.
4. Mark conversions (Admin → Events → Mark as conversion) for the events below.
5. Keep the existing first-party consent banner. Load GA4 only after the visitor clicks **Accept** (Consent Mode v2: set `analytics_storage` to `denied` by default, update to `granted` on accept). This keeps you GDPR/DPDP-aligned.

**Google Search Console**
1. Add property `https://www.akshayamilan.com` (domain property preferred — verify via DNS TXT).
2. Submit `https://www.akshayamilan.com/sitemap.xml`.
3. Use the URL Inspection tool on the homepage and request indexing.
4. Link GSC to GA4 (Admin → Product links).
5. Check the "Pages" report weekly for "Duplicate, Google chose different canonical" (a sign the `.vercel.app` is still reachable).

**Bing Webmaster Tools**
1. Add site at https://www.bing.com/webmasters. Use "Import from Google Search Console" — fastest.
2. Submit the sitemap.

**Microsoft Clarity**
1. Create a project at https://clarity.microsoft.com (free heatmaps + session recordings).
2. Install via the same GTM container as GA4.
3. Review heatmaps on `/`, `/packages` and `/enquiry` monthly for friction on the form.

## 2. Conversion tracking (the metrics that matter)

These are the real business goals — set them as GA4 key events:

| Conversion | Trigger | Implementation |
|---|---|---|
| WhatsApp click | click any `a[href*="wa.me"]` | GTM click trigger → GA4 event `whatsapp_click` |
| Phone click | click any `a[href^="tel:"]` | GTM click trigger → GA4 event `phone_click` |
| Form submit success | `.form-success.show` becomes visible | GTM custom event fired from `main.js` `revealSuccess()` → `enquiry_submit` |
| Map / directions click | click `a[href*="maps.google"]` | GTM click trigger → `directions_click` |
| Enquiry page view | `/enquiry` view | GA4 pageview-based event |

Small change to `assets/js/main.js` (do after GA4 is live) — in `revealSuccess()`:
```js
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({ event: "enquiry_submit" });
```

## 3. Monthly report template (copy each month)

**Reporting month:** ______

### Search Console
| Metric | This month | Last month | Change |
|---|---|---|---|
| Impressions | | | |
| Clicks | | | |
| Avg CTR | | | |
| Avg position | | | |

### Keyword positions (add the exact queries from the keyword list)
| Keyword | Avg position | Clicks | Impressions | Change |
|---|---|---|---|---|
| wedding venues in bengaluru | | | | |
| wedding venue kanakapura road | | | | |
| wedding lawn bengaluru | | | | |
| outdoor wedding venue bengaluru | | | | |
| banquet halls kanakapura road | | | | |
| wedding halls thavarekere | | | | |
| reception venue bengaluru | | | | |
| engagement venue bengaluru | | | | |
| birthday party venue bengaluru | | | | |
| corporate event venue bengaluru | | | | |

### Google Business Profile (Map Pack)
| Metric | This month | Change |
|---|---|---|
| Business profile views | | |
| Searches (discovery + direct) | | |
| Calls | | |
| Direction requests | | |
| Website clicks | | |
| New reviews / total | | / |
| Average rating | | |
| Photo views | | |

### Website conversions (GA4)
| Conversion | This month | Last month |
|---|---|---|
| WhatsApp clicks | | |
| Phone clicks | | |
| Enquiry form submissions | | |
| Directions clicks | | |

### Work done this month
- New pages published:
- Content published:
- Reviews requested / received:
- Directory updates:
- Backlinks earned:
- Technical fixes:

### Issues & blockers
-

### Next month's plan
-

## 4. KPIs / how to judge progress (no ranking promises)
- **Leading indicators:** impressions + clicks in GSC trending up; GBP calls/direction requests up month-over-month.
- **Conversion:** enquiry form submissions + WhatsApp clicks per month.
- **Reviews:** steady growth toward 50+ at 4.5+.
- **Technical:** pages indexed, no canonical conflicts, Core Web Vitals "Good" for `/`.
- Judge SEO on 90-day rolling trends, not week-to-week.
