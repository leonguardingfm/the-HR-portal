import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verify } from "@/lib/auth/session";

/**
 * Nothing is served to an unauthenticated request except the sign-in page.
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
export async function proxy(req: NextRequest) {
  const session = await verify(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname } = req.nextUrl;

  if (!session && pathname !== "/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    // Come back to where they were heading once they are signed in.
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && pathname === "/signin") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Everything except Next's own assets and the icon.
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico).*)"],
};
