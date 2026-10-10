/* Edge middleware: gates the /admin panel.
   This is a UX guard only — the real authorization always happens server-side
   in the API functions (Supabase Auth + role check + RLS). An expired or forged
   cookie that passes here can never read data. */

import { NextResponse } from "@vercel/edge";

const ACCESS_COOKIE = "am_at";
const PUBLIC_PATHS = new Set([
  "/admin/login.html",
  "/admin/reset-password.html",
]);

export default function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;

  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // Static assets the admin UI needs before login state is known.
  if (
    pathname.startsWith("/admin/css/") ||
    pathname.startsWith("/admin/js/") ||
    pathname.startsWith("/admin/img/") ||
    PUBLIC_PATHS.has(pathname) ||
    pathname === "/admin"
  ) {
    return NextResponse.next();
  }

  const cookies = (req.headers.get("cookie") || "").split(";");
  const hasToken = cookies.some((c) => c.trim().startsWith(ACCESS_COOKIE + "="));

  if (!hasToken) {
    const login = new URL("/admin/login.html", url.origin);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login, 302);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};