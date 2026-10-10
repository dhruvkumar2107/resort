/* Build sanity check. Run: npm run check
   Verifies syntax of every server/client JS file, required files exist,
   all public HTML pages include the analytics script + privacy link,
   no service-role secret leaks into browser-served files, and /admin is
   kept out of robots.txt. */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let failed = false;

const fail = (msg) => {
  failed = true;
  console.error(`  FAIL  ${msg}`);
};
const ok = (msg) => console.log(`  ok    ${msg}`);

const checkSyntax = (file) => {
  const res = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (res.status !== 0) fail(`syntax: ${file}\n${res.stderr}`);
  else ok(`syntax ${file.replace(root + "\\", "").replace(root + "/", "")}`);
};

console.log("== Syntax ==");
const apiFiles = readdirSync(join(root, "api"), { recursive: true })
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => join(root, "api", f));
const jsFiles = [
  join(root, "middleware.js"),
  join(root, "assets/js/main.js"),
  join(root, "assets/js/analytics.js"),
  join(root, "admin/js/admin.js"),
];
[...apiFiles, ...jsFiles].forEach(checkSyntax);

console.log("== Required files ==");
const required = [
  "package.json",
  "vercel.json",
  ".env.example",
  "middleware.js",
  "robots.txt",
  "sitemap.xml",
  "assets/js/analytics.js",
  "assets/js/main.js",
  "admin/index.html",
  "admin/login.html",
  "admin/reset-password.html",
  "admin/css/admin.css",
  "admin/js/admin.js",
  "privacy.html",
  "supabase/migrations/0001_initial.sql",
  "supabase/migrations/0002_stats_rpc.sql",
  "supabase/migrations/0004_dedupe_constraint.sql",
];
required.forEach((f) => {
  if (existsSync(join(root, f))) ok(`present ${f}`);
  else fail(`missing ${f}`);
});

console.log("== Public pages wiring ==");
const pages = [
  "index.html", "about.html", "contact.html", "enquiry.html",
  "gallery.html", "packages.html", "services.html", "venues.html", "privacy.html",
];
for (const page of pages) {
  let html = "";
  try {
    html = readFileSync(join(root, page), "utf8");
  } catch {
    fail(`unreadable ${page}`);
    continue;
  }
  if (!html.includes("assets/js/analytics.js")) fail(`${page}: missing analytics.js`);
  if (!html.includes('href="privacy.html"')) fail(`${page}: missing privacy link`);
  ok(`wired ${page}`);
}

console.log("== Sensitive key leak check ==");
const browserServed = [
  ...pages,
  "admin/index.html",
  "admin/login.html",
  "admin/reset-password.html",
  "admin/js/admin.js",
  "assets/js/main.js",
  "assets/js/analytics.js",
  "admin/css/admin.css",
].map((f) => join(root, f));
for (const f of browserServed) {
  const content = readFileSync(f, "utf8");
  if (content.includes("SERVICE_ROLE") || /\bsb_publishable_secret\b/.test(content) || /service[_ ]role[\"' ]/i.test(content)) {
    fail(`${f}: possible service-role reference`);
  } else ok(`clean ${f.replace(root + "\\", "").replace(root + "/", "")}`);
}

console.log("== robots.txt blocks admin ==");
const robots = readFileSync(join(root, "robots.txt"), "utf8");
if (/Disallow:\s*\/admin/.test(robots)) ok("/admin disallowed");
else fail("/admin not disallowed in robots.txt");

console.log("\n" + (failed ? "BUILD CHECK FAILED" : "BUILD CHECK PASSED"));
process.exit(failed ? 1 : 0);