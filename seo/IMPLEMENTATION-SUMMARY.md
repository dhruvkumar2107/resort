# SEO Implementation Summary — Akshaya Milan

Site: https://www.akshayamilan.com · Market: Bengaluru, Karnataka · Domain owner-confirmed.
This document is the final deliverable. Companion files: `CHANGELOG-SEO.md`, `seo/LOCAL-SEO-CHECKLIST.md`, `seo/CONTENT-PLAN.md`, `seo/BACKLINK-PLAN.md`, `seo/TRACKING-AND-REPORTING.md`.

## 1. Original issues found (audit)

**Technical / indexing**
- Canonicals, Open Graph images and sitemap pointed at the staging alias `akshaya-milan.vercel.app`, not the live domain.
- No `<meta name="description">` on most pages; several titles generic or repeated the brand only.
- `sitemap.xml` missing `lastmod`, and no image sitemap.
- `robots.txt` allowed everything and had no sitemap reference to the real domain.
- No 301 handling for the old `.vercel.app` URL or non-www → www.
- URLs used `.html` extensions; no clean-URL structure.
- No custom 404 page.
- Images: large JPGs (up to ~585 KB each), no `width`/`height` (layout shift), hero served as a CSS background with no modern-format fallback.
- Only a thin `EventVenue` JSON-LD block on the homepage; no breadcrumbs, FAQ or ContactPage schema.

**On-page / content**
- No dedicated landing pages for the high-intent venue searches (open-air wedding, marriage hall, convention hall, reception hall, engagement, corporate, birthday).
- Weak internal linking (footer "Celebrations" links all pointed to `/venues`).
- Email address used an unconfirmed domain (`akshayamilan.in`).
- Contact page used a generic map query instead of a place embed.
- Unverified claims on `about.html` (event count, years, star rating) — left in place but **not** turned into review schema.

## 2. Fixes implemented

**Phase 1 — Technical SEO**
- Real domain applied across canonicals, OG/Twitter, sitemap, config and docs.
- Unique title + meta description on every indexable page (keyword + Bengaluru, within length limits).
- Rewrote `robots.txt` and `sitemap.xml` (correct domain, `lastmod`, image sitemap).
- `cleanUrls: true` + 301 redirects (`akshaya-milan.vercel.app` and `akshayamilan.com` → `https://www.akshayamilan.com`) with `X-Robots-Tag: noindex` on the alias.
- All internal links, canonicals, OG and JSON-LD URLs moved to clean URLs.
- Custom on-brand `404.html` (`noindex`) with recovery links.
- WebP conversion of 18 photos (~36% smaller) served via `<picture>` with JPG fallback; hero + page-hero backgrounds use `image-set()`; typed WebP/JPEG hero preload.
- Intrinsic `width`/`height` on every `<img>` (CLS).
- Accessible nav/forms/buttons preserved (skip-link, aria labels, focus states, mobile action bar).

**Phase 2 — On-page SEO**
- One H1 per page; logical H2/H3; descriptive headings.
- Contextual internal links; descriptive alt text on all images.
- Full social sharing metadata; canonical consistency.
- Breadcrumb navigation on every inner page.
- Call/WhatsApp/visit CTAs on every page.

**Phase 5 — Structured data (JSON-LD)**
- Homepage `@graph`: EventVenue + Organization + WebSite.
- BreadcrumbList on all inner + new pages.
- FAQPage on packages and all 8 service pages.
- ContactPage on contact.
- All 27 JSON-LD blocks validate (parsed clean).

**Phase 3 — New service pages** (see section 3): 8 individually written landing pages built on verified facts only (capacity, spaces, services, hours, phones). No invented prices, capacities, awards or testimonials.

**Phases 6, 7, 8** delivered as owner-ready checklists and plans (see companion files): GBP steps, review system, content calendar, 30 backlink targets + 10 outreach emails, GA4/GSC/Bing/Clarity setup and a monthly report template.

## 3. New / updated page URLs

New pages (all `index, follow`, self-canonical, breadcrumb + FAQ schema):
1. `/open-air-wedding-venue-bangalore`
2. `/convention-hall-bangalore`
3. `/marriage-hall-bangalore`
4. `/wedding-venue-bangalore`
5. `/wedding-reception-hall-bangalore`
6. `/engagement-venue-bangalore`
7. `/corporate-event-venue-bangalore`
8. `/birthday-party-venue-bangalore`

Updated: `/` (homepage), `/venues`, `/services`, `/packages`, `/gallery`, `/about`, `/contact`, `/enquiry`, `/privacy` — now clean URLs, full metadata, updated footer links, WebP images.
New: `/404.html` (custom not-found page, `noindex`).
Removed-reflect: old `.html` URLs 301 to the clean versions automatically via `cleanUrls`.

## 4. Technical validation results

- `npm run check` — **BUILD CHECK PASSED** (syntax, required files, analytics + privacy wiring on all 17 public pages, no service-role leaks, robots `/admin` disallow).
- `npm test` — **24/24 pass**.
- JSON-LD — **27 blocks, 0 invalid**.
- Internal links — **no broken links**; all `<img>` have alt text.
- HTML tag balance — all pages balanced.
- All referenced WebP files exist.

## 5. Remaining tasks requiring owner access

**Must be provided (can't be done from code):**
- Full street address + PIN + landmark.
- Confirmed geo coordinates (lat/long).
- Real Instagram / Facebook / Google Business Profile URLs.
- Verified starting prices (for `/packages` and new pages).
- Confirmation whether the "500+ events / 10+ years / 4.9★" claim and testimonials are real and verifiable; if so, provide real reviews (to enable legitimate `AggregateRating`).
- 10–15 original venue/event photos you approve for publishing.
- Create a `bookings@helloakshayamilan.com` alias if you want bookings split from general enquiries.

**Account actions:**
- Connect `www.akshayamilan.com` (primary) and `akshayamilan.com` in Vercel; set live `SITE_URL` env to `https://www.akshayamilan.com`.
- Create the GA4 property, GSC property, Bing Webmaster and Clarity project (steps in `seo/TRACKING-AND-REPORTING.md`).
- Claim/verify the Google Business Profile (steps in `seo/LOCAL-SEO-CHECKLIST.md`).

## 6. Google Search Console & Google Business Profile checklist

**Search Console**
1. Add domain property `akshayamilan.com`, verify via DNS TXT.
2. Submit `https://www.akshayamilan.com/sitemap.xml`.
3. URL-Inspect and request indexing for `/` and the 8 new pages.
4. Link GSC ↔ GA4.
5. Weekly: check Pages report for canonical conflicts, watch for the alias still being crawled (should 301).

**Google Business Profile**
1. Create/claim "Akshaya Milan" (verify by video).
2. Primary category Wedding venue; also Banquet hall, Event venue.
3. Add exact NAP (matching the site), website, hours, two phone numbers.
4. Add 20–40 real photos + 1–3 short videos; logo + cover.
5. Add services, attributes, products and the booking link (`/enquiry`).
6. Post weekly; answer Q&A; reply to every review within 48h.
7. Use the GDPR-safe review link + WhatsApp template to ask genuine customers.
8. Check Insights monthly (calls, direction requests, website clicks).

## 7. 90-day SEO action plan

**Days 1–15 (technical wrap-up)**
- Deploy; verify redirects, clean URLs, HTTPS, www canonicalisation.
- Submit sitemap; request indexing for all new pages.
- Set up GA4 + GSC + Bing + Clarity; turn on conversion events.
- GBP: claim/verify; add photos, services, hours, booking link.

**Days 16–45 (content + local)**
- Send owner facts (address, prices, photos); fill the `[ADD]` placeholders; add geo coordinates to schema.
- Publish 2 blog posts (venue-cost guide + venue-choice checklist).
- Add the real Google Map embed + written directions to `/contact`.
- Fix social links to real profiles; add `sameAs` to Organization schema.
- Begin directory listings; start the review-request routine; target 15+ new reviews.

**Days 46–75 (authority + conversion)**
- Publish 2 more posts; add Kannada versions of the top pages with hreflang.
- Launch partner outreach (photographers, decorators, planners, caterers).
- Add review schema only if real, verifiable reviews exist.
- Review Clarity heatmaps; tune the enquiry form and CTAs.

**Days 76–90 (measure + iterate)**
- Full month-over-month report (SERP, GBP, conversions).
- Refresh underperforming titles/meta; expand content that gains impressions.
- Plan the next quarter's content and backlink targets.

## 8. Measurable performance indicators

**Leading (visibility)**
- Search Console impressions and clicks (90-day trend up).
- Average position for the priority keyword set.
- Number of indexed pages (all 17 + new content).
- GBP: profile views, discovery vs direct searches.

**Engagement / conversion**
- Click-to-call events; WhatsApp click events; enquiry form submissions; directions clicks.
- Enquiry-page conversion rate.

**Local**
- GBP calls, direction requests, website clicks.
- Review count and average rating (steady growth to 50+ at 4.5+).

**Baseline note:** current baseline is unmeasured because analytics/GSC are not yet installed. Capture the first 28 days after install as the baseline for all of the above.

No ranking guarantees are made; success is judged on these measurable trends, not on a promised position.
