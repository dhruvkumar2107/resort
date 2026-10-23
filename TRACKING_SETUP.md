# Tracking Setup Guide

This document explains how to configure Google Analytics (GA4), Meta Ads (Facebook Pixel), and Google Tag Manager for the Akshaya Milan website.

## Environment Variables

Set these in **Vercel Dashboard → Settings → Environment Variables**:

| Variable | Description | Example |
|----------|-------------|---------|
| `GA_MEASUREMENT_ID` | Google Analytics 4 Measurement ID | `G-XXXXXXXXXX` |
| `META_PIXEL_ID` | Meta Ads (Facebook) Pixel ID | `123456789012345` |
| `GTM_CONTAINER_ID` | Google Tag Manager Container ID (optional) | `GTM-XXXXXXX` |

**Note:** Only use **one** of these approaches:
- **Option A:** Set `GA_MEASUREMENT_ID` + `META_PIXEL_ID` (direct integration)
- **Option B:** Set `GTM_CONTAINER_ID` (manage GA4 + Meta Pixel via GTM)

## How to Get Your IDs

### Google Analytics 4 (GA4)
1. Go to [analytics.google.com](https://analytics.google.com)
2. Admin → Create Property → Name: "Akshaya Milan", Timezone: India, Currency: INR
3. Data Streams → Web → Enter `https://www.akshayamilan.com`
4. Copy the **Measurement ID** (format: `G-XXXXXXXXXX`)

### Meta Ads (Facebook Pixel)
1. Go to [events-manager.facebook.com](https://events-manager.facebook.com)
2. Connect Data Sources → Web → Facebook Pixel
3. Name: "Akshaya Milan Pixel"
4. Copy the **Pixel ID** (15-digit number)

### Google Tag Manager (Optional)
1. Go to [tagmanager.google.com](https://tagmanager.google.com)
2. Create Account → Container → Web
3. Copy the **Container ID** (format: `GTM-XXXXXXX`)
4. In GTM, add GA4 Configuration tag and Meta Pixel tag
5. Set up Consent Mode v2 in GTM for GDPR/DPDP compliance

## Consent Mode v2

The site implements Google Consent Mode v2:
- Analytics/advertising storage = `denied` by default
- Updates to `granted` only after user clicks "Accept analytics" on the banner
- This keeps you GDPR (EU) and DPDP (India) compliant

## Conversion Events Tracked

| Event | Trigger | GA4 Event | Meta Pixel Event |
|-------|---------|-----------|------------------|
| WhatsApp click | Any `a[href*="wa.me"]` click | `whatsapp_click` | `Contact` |
| Phone click | Any `a[href^="tel:"]` click | `phone_click` | `Contact` |
| Form submit | Enquiry form success | `enquiry_submit` | `Lead` |
| Directions click | Any `a[href*="maps.google"]` click | `directions_click` | `Contact` |
| Page view | Page load (after consent) | `page_view` | `PageView` |

## Mark as Conversions in GA4

After GA4 is receiving data:
1. Admin → Events → Mark as conversion:
   - `whatsapp_click`
   - `phone_click`
   - `enquiry_submit`
   - `directions_click`

## Testing

1. Deploy to Vercel preview
2. Open the site, accept the consent banner
3. Open browser DevTools → Network → Filter "collect" or "gtm"
4. Verify requests to:
   - `google-analytics.com/g/collect` (GA4)
   - `connect.facebook.net` (Meta Pixel)
   - `googletagmanager.com/gtm.js` (GTM)

## Local Development

Create `.env.local` in project root:
```bash
GA_MEASUREMENT_ID=G-XXXXXXXXXX
META_PIXEL_ID=123456789012345
# GTM_CONTAINER_ID=GTM-XXXXXXX
```

Run the injection script:
```bash
node scripts/inject-tracking.mjs
```

## Privacy Policy

The privacy policy (`privacy.html`) has been updated to disclose third-party analytics and advertising trackers. Review and adjust as needed for your jurisdiction.