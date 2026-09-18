"use client";

import { usePathname } from "next/navigation";
import { ROLE_HOLDERS, ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { navItemByHref } from "./nav";
import { useRole } from "./RoleContext";
import { ThemeToggle } from "./ThemeToggle";

const ROLES: Role[] = [
  "control",
  "recruitment",
  "recruitment_manager",
  "vetting_admin",
  "vetting_controller",
  "top_management",
  "auditor",
];

export function Topbar() {
  const pathname = usePathname();
  const { role, setRole } = useRole();
  const item = navItemByHref(pathname === "" ? "/" : pathname);

  return (
    <header
      className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6"
      style={{ background: "var(--page)", borderColor: "var(--hairline)" }}
    >
      <p className="min-w-0 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {item?.label ?? "HR Portal"}
      </p>

      <div className="flex items-center gap-2">
        <label className="flex min-w-0 items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span className="hidden sm:inline">Viewing as</span>
          {/* A select is as wide as its widest option, so the role holder is
              rendered beside it rather than inside it. */}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="max-w-[11rem] rounded border px-1.5 py-1 text-[12px]"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--hairline)",
              color: "var(--text-primary)",
            }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          {ROLE_HOLDERS[role] && (
            <span className="hidden truncate md:inline" title={ROLE_HOLDERS[role]}>
              {ROLE_HOLDERS[role]}
            </span>
          )}
        </label>
        <ThemeToggle />
      </div>
    </header>
  );
}
