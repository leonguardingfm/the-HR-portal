"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";
import { navForRole } from "./nav";
import { RoleProvider, useRole } from "./RoleContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <div className="flex gap-1">
      {navForRole(role).map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="shrink-0 rounded px-2 py-1 text-[12px] whitespace-nowrap"
            style={{
              background: active ? "var(--wash)" : "transparent",
              color: active ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: active ? 600 : 400,
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { role } = useRole();

  return (
    <div className="flex min-h-screen">
      <aside
        className="hidden w-52 shrink-0 border-r lg:block"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="sticky top-0 h-screen">
          <Sidebar role={role} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <div
          className="overflow-x-auto border-b px-4 py-2 lg:hidden"
          style={{ borderColor: "var(--hairline)" }}
        >
          <MobileNav role={role} />
        </div>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RoleProvider>
      <Shell>{children}</Shell>
    </RoleProvider>
  );
}
