import { headers } from "next/headers";
import { Suspense } from "react";
import { AlertBar } from "@/components/live/AlertBar";
import { LiveProvider } from "@/components/live/Live";
import { getSession, touchSession } from "@/lib/auth/server";
import { HubToasts } from "@/components/hub/HubToasts";
import { WATCHES_LIVE, getPulse, hearsHub } from "@/lib/db/pulse";
import { preferencesOf } from "@/lib/db/preferences";
import { vapidPublicKey } from "@/lib/db/push";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The shell.
 *
 * A server component, so the role that decides the navigation comes from the
 * signed session cookie rather than from anything the browser can set. An
 * unauthenticated request never reaches here — proxy.ts redirects it —
 * but if one did, it renders the page bare rather than a shell with no user.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  // A candidate's or referee's link: their own page, never the staff shell —
  // even when somebody signed in opens it to check it.
  if ((await headers()).get("x-leon-by-link") === "1") return <>{children}</>;
  const session = await getSession();
  if (!session) return <>{children}</>;
  const [, pulse, prefs] = await Promise.all([touchSession(session.workSessionId), getPulse(session), preferencesOf(session.userId)]);
  const watches = WATCHES_LIVE.includes(session.activeRole);
  const officer = session.activeRole === "officer";
  const hub = hearsHub(session.activeRole);
  // A client sees only the pages their organisation pays for (26 September 2026).
  const s = prefs.services;
  const hidden = s ? [...(s.portal ? [] : ["/client-portal/live", "/client-portal/rota", "/client-portal/shifts", "/client-portal/incidents", "/client-portal/site-issues", "/client-portal/requests", "/client-portal/report"]), ...(s.live ? [] : ["/client-portal/live"]), ...(s.siteIssues ? [] : ["/client-portal/site-issues"])] : [];

  return (
    // Every screen stays current by itself, and the alarm is on every page.
    <LiveProvider initial={pulse} watches={watches} officer={officer} hub={hub}>
    <a href="#main" className="skip-link print:hidden">
      Skip to the page
    </a>
    <div className="flex min-h-screen">
      <aside
        className="hidden w-52 shrink-0 border-r lg:block print:hidden"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="sticky top-0 h-screen overflow-y-auto">
          {/* Both navigations read the query string, which is how a "?view="
              item knows it is the current one. Wrapped so the shell can still
              be rendered ahead of the request's search params being known. */}
          <Suspense fallback={null}>
            <Sidebar role={session.activeRole} userId={session.userId} hidden={hidden} />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div data-shell-top className="sticky top-0 z-30 print:hidden" style={{ background: "var(--page)" }}>
          <Topbar
            name={prefs.name ?? session.name}
            activeRole={session.activeRole}
            roles={session.roles}
            bell={hub ? <HubToasts soundOn={prefs.soundOn} /> : null}
            organisation={prefs.organisation}
          />
          <AlertBar vapidKey={vapidPublicKey()} />
        </div>
        <div
          className="border-b px-4 py-2 lg:hidden print:hidden"
          style={{ borderColor: "var(--hairline)" }}
        >
          <Suspense fallback={null}>
            <MobileNav role={session.activeRole} hidden={hidden} />
          </Suspense>
        </div>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6">
          {children}
        </main>
      </div>
    </div>
    </LiveProvider>
  );
}
