# Phase 4 — Content Plan (Akshaya Milan)

> Every page: 800+ words, original photos, an on-page FAQ, internal links to at least 3 other pages, and one clear CTA (Enquire / WhatsApp / Call). Prices, capacity details, room availability and any claim stay as `[ADD]` until you confirm them.

## New keyword-targeted pages

| URL | Primary keyword | Title (<=60) | Core sections (H2) |
|---|---|---|---|
| `/wedding-venue-kanakapura-road` | wedding venue Kanakapura Road | Wedding Venue on Kanakapura Road \| Akshaya Milan | Why Kanakapura Road · Our halls & lawn · Guest capacity · Parking & access · Real events · FAQs · CTA |
| `/wedding-lawn-bengaluru` | wedding lawn Bengaluru | Wedding Lawn in Bengaluru \| Akshaya Milan | The lawn · Capacity (up to 1200) · Night lighting · Weather backup · Baraat access · Gallery · FAQs · CTA |
| `/reception-venue-bengaluru` | reception venue Bengaluru | Reception Venue in Bengaluru \| Akshaya Milan | Reception setups · Stage & dining flow · Menu tie-ups · Timings · Parking · FAQs · CTA |
| `/engagement-venue-bengaluru` | engagement venue Bengaluru | Engagement Venue in Bengaluru \| Akshaya Milan | Intimate hall (up to 250) · Decor themes · Photography spots · FAQs · CTA |
| `/birthday-party-venue-bengaluru` | birthday party venue Bengaluru | Birthday Party Venue in Bengaluru \| Akshaya Milan | Kids & milestone birthdays · Layouts · Catering · Decor add-ons · FAQs · CTA |
| `/corporate-events-venue-bengaluru` | corporate event venue Bengaluru | Corporate Event Venue in Bengaluru \| Akshaya Milan | Conferences, offsites, annual days · AV & projector · Breakouts · Parking · FAQs · CTA |
| `/packages` | wedding venue packages Bengaluru | Wedding Packages in Bengaluru \| Akshaya Milan | What's included · Real starting prices `[ADD]` · Add-ons · What's not included · FAQs · CTA |
| `/capacity-and-layouts` | (supporting) | Capacity & Layouts \| Akshaya Milan | Seating vs theatre vs floating · Per-hall capacity · Parking count `[confirm]` · Green rooms `[confirm]` · Catering policy · CTA |

**Page rules**
- One H1 with the primary keyword phrased naturally.
- Answer the query in the first 100 words (people scan).
- Include one original photo per ~150 words, with descriptive alt text.
- Add `BreadcrumbList` + `FAQPage` JSON-LD (repeat the Phase 2 pattern).
- Link back to `/venues`, `/packages`, `/enquiry` and one sibling page.
- Add the page to `sitemap.xml` and to the footer "Celebrations" column once live.

## Kannada + hreflang

- Create Kannada versions of the 6 highest-value pages under `/kn/` (e.g. `/kn/wedding-venue-kanakapura-road`).
- On each English page add:
  ```html
  <link rel="alternate" hreflang="en-in" href="https://www.akshayamilan.com/wedding-venue-kanakapura-road" />
  <link rel="alternate" hreflang="kn-in" href="https://www.akshayamilan.com/kn/wedding-venue-kanakapura-road" />
  <link rel="alternate" hreflang="x-default" href="https://www.akshayamilan.com/wedding-venue-kanakapura-road" />
  ```
- Translate genuinely (a native speaker), not machine output. Kannada pages get their own titles/descriptions and Kannada JSON-LD `inLanguage: "kn-IN"`.

## 6-month blog calendar (2 posts / month)

Each post: 900–1300 words, one original image, internal links to venue pages, a CTA, and a schema `Article` + `BreadcrumbList`.

**Month 1**
1. "Wedding Venue Cost in Bengaluru (2026): What Actually Drives the Price" — link `/packages`.
2. "How to Choose a Wedding Venue in Bengaluru: 12-Point Checklist" — link `/wedding-venue-kanakapura-road`.

**Month 2**
3. "Outdoor vs Indoor Wedding Venues in Bengaluru: Which Is Right for You?" — link `/wedding-lawn-bengaluru`.
4. "Auspicious Wedding Dates 2026–2027 in Karnataka (Muhurtham Guide)" — link `/enquiry`.

**Month 3**
5. "Reception Planning Timeline: From Baraat to Last Guest" — link `/reception-venue-bengaluru`.
6. "How Much Does a Wedding Lawn Cost in Bengaluru?" — link `/wedding-lawn-bengaluru`.

**Month 4**
7. "Case Study: A 900-Guest Wedding at Akshaya Milan" (real event, real photos) — link `/gallery`.
8. "Engagement Ceremony Ideas and Venue Tips in Bengaluru" — link `/engagement-venue-bengaluru`.

**Month 5**
9. "Planning a Corporate Event in Bengaluru: Venue Checklist" — link `/corporate-events-venue-bengaluru`.
10. "Birthday Party Venues in Bengaluru: Kids, Milestones and Budgets" — link `/birthday-party-venue-bengaluru`.

**Month 6**
11. "Monsoon Wedding in Bengaluru: How to Plan Around the Rain" — link `/wedding-lawn-bengaluru`.
12. "Case Study: A Reception for 400 at Akshaya Milan" (real event) — link `/reception-venue-bengaluru`.

**Note:** only publish case studies for events you actually hosted, with the couple's permission. Never invent an event, couples' names, or numbers.

## What I need from you to write these pages
- Full address + PIN + landmarks.
- Real starting prices for `/packages` `[ADD]`.
- Do you offer green rooms / bridal rooms / parking count? `[confirm]`.
- 10–15 original photos you're happy to publish per page.
- Approval to publish real testimonials from your GBP reviews (with permission).
