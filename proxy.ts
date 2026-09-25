import { NextResponse, type NextRequest } from "next/server";
import { canAccessPath } from "@/components/layout/nav";
import { roleHome } from "@/lib/accounts";
import { SESSION_COOKIE, verify } from "@/lib/auth/session";

/**
 * Nothing is served to an unauthenticated request except sign-in and sign-up,
 * and nothing is served to a signed-in role outside the screens listed for it.
 *
 * This runs before any page or action, so a missing or tampered cookie never
 * reaches a database query. It is the outer gate; lib/auth/server.ts's
 * requireSession is the backstop, and lib/auth/permissions.ts decides what the
 * authenticated user may actually do.
 *
 * The outer gate is deliberately only a gate. The framework's own guidance is
 * that this layer is an optimistic check and not a session-management or
 * authorisation solution, which is exactly how it is used here: it redirects,
 * and every page and every action verifies the session again for itself.
 *
 * Called `proxy` rather than `middleware` because Next renamed the convention
 * in 16 — same functionality, and `next dev` warns on the old name.
 */
const PUBLIC_PATHS = new Set(["/signin", "/signup", "/signup/officer", "/signin/verify", "/signin/forgot"]);
/** An emailed reset link: public, the link itself is the key. */
const PUBLIC_PREFIXES = ["/signin/reset/"];
/** Reachable signed in or not: it is how a dead session is cleared. */
const SESSION_END = "/signin/ended";
/**
 * Open to anyone signed in, whatever their role — officers included. The pulse
 * answers only about the person asking, so there is nothing to fence.
 */
const ANY_SIGNED_IN = new Set(["/api/pulse", "/api/me/queue"]);
/**
 * The links emailed to candidates and referees. Open to anyone holding one,
 * signed in or not: the link itself is the key, checked by the page and by
 * every action behind it.
 */
const BY_LINK = ["/apply/", "/reference/"];

export async function proxy(req: NextRequest) {
  // Only this layer sets the link mark; one arriving from outside is dropped.
  const clean = new Headers(req.headers);
  clean.delete("x-leon-by-link");
  const pass = () => NextResponse.next({ request: { headers: clean } });
  const session = await verify(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;
  if (pathname === SESSION_END) return pass();
  // The host's monitor checks this without signing in; it carries no personal data.
  if (pathname === "/api/health") return pass();
  if (BY_LINK.some((p) => pathname.startsWith(p))) {
    // Marked, so the page renders without the staff shell around it.
    const h = new Headers(req.headers);
    h.set("x-leon-by-link", "1");
    return NextResponse.next({ request: { headers: h } });
  }
  const isPublic = PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));

  // A screen polling in the background gets an answer it can read, not a page.
  if (!session && pathname.startsWith("/api/")) {
    return Response.json({ signedOut: true }, { status: 401 });
  }
  if (session && ANY_SIGNED_IN.has(pathname)) return pass();

  // A new password after a reset, or two-factor where it is required, comes
  // before anything else (26 September 2026).
  if (session?.must && pathname !== "/settings" && !pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/settings";
    url.search = `?must=${session.must}`;
    return NextResponse.redirect(url);
  }

  if (!session && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    // Come back to where they were heading once they are signed in.
    url.search = "";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && (isPublic || !canAccessPath(session.activeRole, pathname))) {
    // Signed in, and either on a sign-in page or somewhere this role does not
    // go. Both land on the role's own home rather than on a refusal page.
    const url = req.nextUrl.clone();
    url.pathname = roleHome(session.activeRole);
    url.search = "";
    if (url.pathname === pathname) return pass();
    return NextResponse.redirect(url);
  }

  return pass();
}

export const config = {
  // Everything except Next's own assets, the icons, the installable-app
  // manifest and the service worker — which the browser fetches for itself and
  // which carry nothing private.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|icons/|apple-icon.png|manifest.webmanifest|sw.js).*)"],
};
