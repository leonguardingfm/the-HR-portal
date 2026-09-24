import { Suspense } from "react";
import { AlertBar } from "@/components/live/AlertBar";
import { LiveProvider } from "@/components/live/Live";
import { getSession, touchSession } from "@/lib/auth/server";
import { WATCHES_LIVE, getPulse } from "@/lib/db/pulse";
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
  const session = await getSession();
  if (!session) return <>{children}</>;
  const [, pulse] = await Promise.all([touchSession(session.workSessionId), getPulse(session)]);
  const watches = WATCHES_LIVE.includes(session.activeRole);
  const officer = session.activeRole === "officer";

  return (
    // Every screen stays current by itself, and the alarm is on every page.
    <LiveProvider initial={pulse} watches={watches} officer={officer}>
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
            <Sidebar role={session.activeRole} userId={session.userId} />
          </Suspense>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-30 print:hidden" style={{ background: "var(--page)" }}>
          <Topbar
            name={session.name}
            activeRole={session.activeRole}
            roles={session.roles}
          />
          <AlertBar vapidKey={vapidPublicKey()} />
        </div>
        <div
          className="border-b px-4 py-2 lg:hidden print:hidden"
          style={{ borderColor: "var(--hairline)" }}
        >
          <Suspense fallback={null}>
            <MobileNav role={session.activeRole} />
          </Suspense>
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
    </LiveProvider>
  );
}
