"use client";

import { usePathname } from "next/navigation";
import { changeRole, signOut } from "@/app/signin/actions";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { navItemForPath } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

/**
 * The role switcher offers only the roles this person actually holds, and the
 * change goes through a server action that checks the same thing again. A
 * select element is a suggestion; the server decides.
 */
export function Topbar({
  name,
  activeRole,
  roles,
}: {
  name: string;
  activeRole: Role;
  roles: Role[];
}) {
  const pathname = usePathname();
  const item = navItemForPath(pathname === "" ? "/" : pathname);

  return (
    <header
      className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6"
      style={{ background: "var(--page)", borderColor: "var(--hairline)" }}
    >
      <p className="min-w-0 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {item?.label ?? "Workforce & Operations"}
      </p>

      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden truncate text-[12px] font-medium sm:inline">{name}</span>

        <form action={changeRole} className="flex min-w-0 items-center gap-1.5">
          <input type="hidden" name="from" value={pathname} />
          <span className="hidden text-[11px] md:inline" style={{ color: "var(--text-muted)" }}>
            working as
          </span>
          <select
            name="role"
            defaultValue={activeRole}
            aria-label="Role you are working as"
            className="max-w-[11rem] rounded border px-1.5 py-1 text-[12px]"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--hairline)",
              color: "var(--text-primary)",
            }}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <noscript>
            <button type="submit" className="text-[11px] underline">
              Change
            </button>
          </noscript>
        </form>

        <form action={signOut}>
          <button
            type="submit"
            className="rounded border px-2 py-1 text-[11px]"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--hairline)",
              color: "var(--text-secondary)",
            }}
          >
            Sign out
          </button>
        </form>

        <ThemeToggle />
      </div>
    </header>
  );
}
