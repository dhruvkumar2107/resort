/* Coarse, privacy-conscious classification of the User-Agent header.
   Deliberately broad — no fingerprinting, no personal identifiers. */

export function classifyUA(ua = "") {
  const u = String(ua);
  const low = u.toLowerCase();

  let device = "desktop";
  if (/android/.test(low) && /mobile/i.test(u)) device = "mobile";
  else if (/android/.test(low)) device = "mobile";
  else if (/iphone|ipod|windows phone/i.test(u)) device = "mobile";
  else if (/ipad/.test(u) || /tablet/i.test(u)) device = "tablet";

  let browser = "other";
  if (/edg\//i.test(u)) browser = "edge";
  else if (/opr\/|opera/i.test(u)) browser = "opera";
  else if (/chrome|crios/i.test(u)) browser = "chrome";
  else if (/firefox|fxios/i.test(u)) browser = "firefox";
  else if (/safari/i.test(u)) browser = "safari";

  let os = "other";
  if (/windows nt|windows phone/i.test(u)) os = "windows";
  else if (/iphone|ipad|ipod/i.test(u)) os = "ios"; // iOS UA strings embed "Mac OS X" — check first
  else if (/mac os x|macintosh/i.test(u)) os = "macos";
  else if (/android/.test(low)) os = "android";
  else if (/linux/.test(low)) os = "linux";

  return { device, browser, os };
}

export function referrerDomain(refererHeader = "") {
  if (!refererHeader) return null;
  try {
    const url = new URL(refererHeader);
    const host = url.hostname.replace(/^www\./, "");
    return host || null;
  } catch (_) {
    return null;
  }
}

/** Client-reported path is never trusted raw. */
export function normalizePath(raw, allowedPrefix = "/") {
  if (typeof raw !== "string" || !raw) return null;
  if (!raw.startsWith(allowedPrefix)) return null;
  if (raw.length > 300) return null;
  const clean = raw.split("?")[0].split("#")[0];
  if (clean.includes("..") || clean.includes("//")) return null;
  return clean;
}