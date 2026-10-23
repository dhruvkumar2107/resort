#!/usr/bin/env node
/* ==========================================================================
   Build script: inject tracking IDs from environment variables into HTML files
   Run during Vercel build (vercel.json -> buildCommand)
   ========================================================================== */

import fs from "fs";
import path from "path";

const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || "";
const META_PIXEL_ID = process.env.META_PIXEL_ID || "";
const GTM_CONTAINER_ID = process.env.GTM_CONTAINER_ID || "";

const htmlDir = path.join(process.cwd());
const adminDir = path.join(process.cwd(), "admin");

function injectTrackingIds(filePath) {
  let content = fs.readFileSync(filePath, "utf8");

  const configBlock = `  <script>
    window.AM_TRACKING_CONFIG = {
      GA_MEASUREMENT_ID: "${GA_MEASUREMENT_ID}",
      META_PIXEL_ID: "${META_PIXEL_ID}",
      GTM_CONTAINER_ID: "${GTM_CONTAINER_ID}",
    };
  </script>`;

  // Replace both placeholder formats: literal \n and actual newlines
  // Pattern matches the script tag with GA_MEASUREMENT_ID_PLACEHOLDER
  content = content.replace(
    /<script>[^<]*GA_MEASUREMENT_ID_PLACEHOLDER[\s\S]*?<\/script>/,
    configBlock
  );

  fs.writeFileSync(filePath, content, "utf8");
  console.log(`Injected tracking IDs into ${path.basename(filePath)}`);
}

function processDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
  files.forEach((f) => injectTrackingIds(path.join(dir, f)));
}

console.log("Injecting tracking IDs...");
console.log(`GA_MEASUREMENT_ID: ${GA_MEASUREMENT_ID || "(not set)"}`);
console.log(`META_PIXEL_ID: ${META_PIXEL_ID || "(not set)"}`);
console.log(`GTM_CONTAINER_ID: ${GTM_CONTAINER_ID || "(not set)"}`);

processDir(htmlDir);
processDir(adminDir);

console.log("Done.");