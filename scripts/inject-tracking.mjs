#!/usr/bin/env node
/* ==========================================================================
   Build script: inject tracking IDs from environment variables into HTML files.
   Run during Vercel build (vercel.json -> buildCommand).

   The HTML files already contain a working GA4 ID, so this is optional: when
   GA_MEASUREMENT_ID / META_PIXEL_ID / GTM_CONTAINER_ID are set (and valid) they
   override what is committed; when unset, the files are left untouched.
   ========================================================================== */

import fs from "fs";
import path from "path";

const valid = (v, re) => (re.test(v || "") ? v : "");
const GA_MEASUREMENT_ID = valid(process.env.GA_MEASUREMENT_ID, /^G-[A-Z0-9]+$/);
const META_PIXEL_ID = valid(process.env.META_PIXEL_ID, /^\d+$/);
const GTM_CONTAINER_ID = valid(process.env.GTM_CONTAINER_ID, /^GTM-[A-Z0-9]+$/);

function inject(filePath) {
  const before = fs.readFileSync(filePath, "utf8");
  let content = before;

  if (GA_MEASUREMENT_ID) {
    content = content
      .replace(/(googletagmanager\.com\/gtag\/js\?id=)G-[A-Z0-9]+/g, `$1${GA_MEASUREMENT_ID}`)
      .replace(/(gtag\('config', ')G-[A-Z0-9]+(')/g, `$1${GA_MEASUREMENT_ID}$2`)
      .replace(/(GA_MEASUREMENT_ID: ")[^"]*(")/g, `$1${GA_MEASUREMENT_ID}$2`);
  }
  if (META_PIXEL_ID) content = content.replace(/(META_PIXEL_ID: ")[^"]*(")/g, `$1${META_PIXEL_ID}$2`);
  if (GTM_CONTAINER_ID) content = content.replace(/(GTM_CONTAINER_ID: ")[^"]*(")/g, `$1${GTM_CONTAINER_ID}$2`);

  if (content !== before) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`Injected tracking IDs into ${path.relative(process.cwd(), filePath)}`);
  }
}

console.log("Injecting tracking IDs...");
console.log(`GA_MEASUREMENT_ID: ${GA_MEASUREMENT_ID || "(not set, keeping committed value)"}`);
console.log(`META_PIXEL_ID: ${META_PIXEL_ID || "(not set)"}`);
console.log(`GTM_CONTAINER_ID: ${GTM_CONTAINER_ID || "(not set)"}`);

// Public pages only; admin pages are intentionally not tracked.
fs.readdirSync(process.cwd())
  .filter((f) => f.endsWith(".html"))
  .forEach((f) => inject(path.join(process.cwd(), f)));

console.log("Done.");
