/* HTTP plumbing shared by all API routes. */

export function json(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.end(JSON.stringify(data));
}

export function ok(res, data) {
  return json(res, 200, { ok: true, ...data });
}

export function fail(res, status, message, extra = {}) {
  return json(res, status, { ok: false, error: message, ...extra });
}

const MAX_BODY = 64 * 1024; // 64 KB
export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    if (name) out[name] = value;
  }
  return out;
}

export function serializeCookie(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  else parts.push("Path=/");
  if ('httpOnly' in opts ? opts.httpOnly : true) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  const sameSite = opts.sameSite || "Lax";
  parts.push(sameSite.startsWith("SameSite=") ? sameSite : `SameSite=${sameSite}`);
  return parts.join("; ");
}

export function cookie(name) {
  return { name: () => name };
}

export function requestSecure(req) {
  const proto = req.headers["x-forwarded-proto"];
  return proto ? proto.split(",")[0].trim() === "https" : false;
}

export function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

export function userAgent(req) {
  return req.headers["user-agent"] || "";
}

export function methodGuard(req, res, ...allowed) {
  if (!allowed.includes(req.method)) {
    fail(res, 405, "Method not allowed");
    return false;
  }
  return true;
}

export function safeInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (min !== undefined && n < min) return fallback;
  if (max !== undefined && n > max) return fallback;
  return n;
}