import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/session";

/**
 * Clears a session whose account has been suspended or removed, then sends the
 * browser to sign-in. A server component cannot delete a cookie, so
 * requireSession redirects here to do it.
 */
export function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/signin";
  url.search = "?ended=1";
  const res = NextResponse.redirect(url);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
