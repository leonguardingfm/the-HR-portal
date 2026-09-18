"use client";

import { usePathname } from "next/navigation";
import { ROLE_LABELS } from "@/lib/labels";
import { ROLE_OPTIONS } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { navItemByHref } from "./nav";
import { useSession } from "./SessionContext";
import { ThemeToggle } from "./ThemeToggle";

export function Topbar() {
  const pathname = usePathname();
  const { session, setActiveRole, signOut } = useSession();
  const item = navItemByHref(pathname === "" ? "/" : pathname);

  return (
    <header
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6"
      style={{ background: "var(--page)", borderColor: "var(--hairline)" }}
    >
      <p className="min-w-0 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {item?.label ?? "HR Portal"}
      </p>

      <div className="flex min-w-0 items-center gap-2">
        {session && (
          <>
            <span className="hidden truncate text-[12px] font-medium sm:inline">
              {session.name}
            </span>
            {/* Active role is changeable without signing out, because people
                move between tasks during a shift and the record should follow. */}
            <label className="flex min-w-0 items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span className="hidden md:inline">working as</span>
              <select
                value={session.activeRole}
                onChange={(e) => setActiveRole(e.target.value as Role)}
                aria-label="Role you are working as"
                className="max-w-[11rem] rounded border px-1.5 py-1 text-[12px]"
                style={{
                  background: "var(--surface-1)",
                  borderColor: "var(--hairline)",
                  color: "var(--text-primary)",
                }}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {ROLE_LABELS[r.id]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={signOut}
              className="rounded border px-2 py-1 text-[11px]"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--hairline)",
                color: "var(--text-secondary)",
              }}
            >
              Sign out
            </button>
          </>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
