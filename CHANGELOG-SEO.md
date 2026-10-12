# SEO Changelog — Akshaya Milan

Base canonical: **https://www.akshayamilan.com**
Format: date — file — change

## 2026-10-12 — Phase 1 (Technical SEO)
- `*.html` (9 pages) — replaced every `https://akshaya-milan.vercel.app` reference with `https://www.akshayamilan.com` (canonicals, OG images, JSON-LD image).
- `robots.txt` — rewrote: kept `Disallow: /admin/` and `/api/`, added `Sitemap:` on the real domain, blocked tracking-parameter crawl waste.
- `sitemap.xml` — rewrote with real domain, `lastmod`, priorities, and image sitemap entries for home/venues/gallery.
- `*.html` (9 pages) — rewrote unique `<title>` (<=60 chars) and meta description (<=155 chars) with a primary keyword + "Bengaluru" per page.
- `*.html` (9 pages) — added a complete, deduplicated Open Graph + Twitter Card block, `meta robots` (`max-image-preview:large`), and `geo.region`/`geo.placename`.
- `*.html` (9 pages) — added intrinsic `width`/`height` to every `<img>` (measured from the real source files) to remove layout shift (CLS).
- `.env.example` — `SITE_URL` updated to the production domain.
- `SETUP.md` — example URLs updated to the production domain.
- `api/_lib/handlers/auth.mjs` — password-reset redirect fallback domain updated.

## 2026-10-12 — Phase 2 (Structured data / JSON-LD)
- `index.html` — replaced the thin `EventVenue` block with a `@graph` of **EventVenue** (capacity 1200, phones, hours, areaServed, acceptsReservations) + **Organization** (contact points) + **WebSite**.
- `venues.html, services.html, packages.html, gallery.html, about.html, contact.html, enquiry.html, privacy.html` — added self-referencing **BreadcrumbList**.
- `packages.html` — added **FAQPage** built from the four existing on-page FAQs.
- `contact.html` — added **ContactPage** linked to the venue `@id`.
- Verified: all JSON-LD blocks parse; `npm run check` passes.

## 2026-10-12 — Phase 1b (Image delivery / Core Web Vitals)
- `assets/images/**` (18 photos) — generated WebP versions with ffmpeg `libwebp` at quality 75 (`-compression_level 6`, metadata stripped). Total 5,709 KB -> 3,638 KB (~36% smaller). Original JPGs kept as fallback.
- `*.html` (index/gallery/venues/about/services) — wrapped 36 `<img>` elements in `<picture>` with `<source type="image/webp">` + JPG fallback.
- `assets/css/styles.css` — added `picture { display: contents; }` so the wrapper is layout-neutral (keeps `height:100%`/aspect-ratio rules working).
- `index.html` — hero slides + cinematic image and all inner-page `page-hero` backgrounds now use `image-set()` (WebP first, JPG fallback declaration first for safety).
- `index.html` — hero preload split into typed WebP + JPEG preloads (no double-fetch; WebP-capable browsers preload the smaller file).
- Verified: all 18 referenced `.webp` files exist; all 11 JSON-LD blocks parse; `npm run check` passes.

## 2026-10-12 — Phase 1c (URLs, redirects, contact details)
- `vercel.json` — added `cleanUrls: true` (Vercel serves `about` instead of `about.html` and issues automatic 301s from `.html` URLs), 301 redirects from `akshaya-milan.vercel.app` and `akshayamilan.com` to `https://www.akshayamilan.com`, and `X-Robots-Tag: noindex, nofollow` on the `.vercel.app` alias. Removed the no-op catch-all rewrite.
- All public pages — internal links, canonicals, OG/Twitter URLs and JSON-LD URLs switched to extensionless URLs (`/about`, `/packages`, ...; homepage already `/`).
- `sitemap.xml` — URLs switched to extensionless.
- Email — `hello@akshayamilan.in` and `bookings@akshayamilan.in` replaced with the owner-confirmed **`contact@helloakshayamilan.com`** (duplicate line removed on `contact.html`); admin login placeholder updated to `admin@helloakshayamilan.com`.
- `middleware.js` — admin public paths + login redirect updated to `/admin/login` and `/admin/reset-password` (clean URLs), and `/admin/` allowed, so the login flow doesn't loop.
- `admin/*.html`, `admin/js/admin.js`, `api/_lib/handlers/auth.mjs` — admin + privacy references updated to extensionless URLs.
- `scripts/check-build.mjs` — privacy-link assertion now expects `href="/privacy"`.
- `seo/*.md`, `SETUP.md` — docs updated to extensionless URLs and new email.
- Verified: `npm run check` passes; `npm test` 24/24 pass; no broken internal links; all `<img>` have alt; no remaining `.html` references in public pages.

## 2026-10-12 — Phase 3 (Service landing pages, 404, internal linking)
- Added 8 new service landing pages (each `index, follow`, self-canonical, unique title/meta/OG, BreadcrumbList + FAQPage JSON-LD, `page-hero` with `image-set`, feature cards, split section + chips, FAQ accordion, CTA band, wa-float, mobile bar, `analytics.js` + `main.js`): `open-air-wedding-venue-bangalore.html`, `convention-hall-bangalore.html`, `marriage-hall-bangalore.html`, `wedding-venue-bangalore.html`, `wedding-reception-hall-bangalore.html`, `engagement-venue-bangalore.html`, `corporate-event-venue-bangalore.html`, `birthday-party-venue-bangalore.html`.
- Added `404.html` — on-brand not-found page, `noindex, nofollow`, recovery links to popular venue pages.
- `index.html` — footer "Celebrations" links repointed to the real pages and a new "Venue Types" group added.
- `about.html, contact.html, enquiry.html, gallery.html, packages.html, privacy.html, services.html, venues.html` — footers replaced with the shared `footer-grid` variant and real internal links.
- `services.html` — hub now links to all 8 service pages.
- `sitemap.xml` — added the 8 new URLs (with image entries where applicable).
- `scripts/check-build.mjs` — `pages` array extended with the 8 new pages (analytics/privacy wiring + sensitive-key scan).
- Escaped bare `&` to `&amp;` in visible HTML of the new pages + `404.html` (JSON-LD left raw).
- Verified: `npm run check` PASSED; `npm test` 24/24; 27 JSON-LD blocks, 0 invalid; no broken internal links; all `<img>` have alt; all HTML tag-balance checks pass.

## Pending (awaiting owner input)
- Real Instagram / Facebook / Google Business Profile links — generic links not changed yet.
- Full street address + PIN + geo coordinates for LocalBusiness schema.
- Confirmed starting prices and approval of 10–15 original photos for publishing.
- Confirmation that the "500+ events / 10+ years / 4.9★" claim and testimonials are real (to enable legitimate review `AggregateRating`).
- `SITE_URL` env var in the live Vercel project must be `https://www.akshayamilan.com` (matches `.env.example`).
- Confirm `www.akshayamilan.com` and `akshayamilan.com` are both connected in Vercel and that `www` is the primary alias.
- AVIF variants (deferred — WebP covers all current browsers; add later if desired).
- GA4 / GSC / Bing / Clarity project creation (owner account access) — steps in `seo/TRACKING-AND-REPORTING.md`.
