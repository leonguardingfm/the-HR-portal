import { getSession, touchSession } from "@/lib/auth/server";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

/**
 * The shell.
 *
 * A server component, so the role that decides the navigation comes from the
 * signed session cookie rather than from anything the browser can set. An
 * unauthenticated request never reaches here — the middleware redirects it —
 * but if one did, it renders the page bare rather than a shell with no user.
 */
export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) return <>{children}</>;
  await touchSession(session.workSessionId);

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-52 shrink-0 border-r lg:block"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="sticky top-0 h-screen overflow-y-auto">
          <Sidebar role={session.activeRole} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={session.name}
          activeRole={session.activeRole}
          roles={session.roles}
        />
        <div
          className="overflow-x-auto border-b px-4 py-2 lg:hidden"
          style={{ borderColor: "var(--hairline)" }}
        >
          <MobileNav role={session.activeRole} />
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
