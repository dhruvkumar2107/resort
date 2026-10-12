/* Edge middleware: gates the /admin panel.
   This is a UX guard only — the real authorization always happens server-side
   in the API functions (Supabase Auth + role check + RLS). An expired or forged
   cookie that passes here can never read data. */

const ACCESS_COOKIE = "am_at";
const PUBLIC_PATHS = new Set([
  "/admin/login",
  "/admin/reset-password",
]);

export default function middleware(req) {
  const url = new URL(req.url);
  const { pathname } = url;

  if (!pathname.startsWith("/admin")) return;

  // Static assets the admin UI needs before login state is known.
  if (
    pathname.startsWith("/admin/css/") ||
    pathname.startsWith("/admin/js/") ||
    pathname.startsWith("/admin/img/") ||
    PUBLIC_PATHS.has(pathname) ||
    pathname === "/admin" ||
    pathname === "/admin/"
  ) {
    return;
  }

  const cookies = (req.headers.get("cookie") || "").split(";");
  const hasToken = cookies.some((c) => c.trim().startsWith(ACCESS_COOKIE + "="));

  if (!hasToken) {
    const login = new URL("/admin/login", url.origin);
    login.searchParams.set("next", pathname);
    return Response.redirect(login, 302);
  }
}

export const config = {
  matcher: ["/admin/:path*"],
};