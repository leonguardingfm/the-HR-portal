"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroupsForRole } from "./nav";
import type { Role } from "@/lib/types";

/**
 * Grouped navigation.
 *
 * The groups are departments, not feature categories, so each team finds the
 * whole of its job in one place (docs/platform/01 §5). A module whose screens
 * are not built yet is shown with a marker rather than hidden — the navigation
 * is the plan, visibly.
 */
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const groups = navGroupsForRole(role);

  return (
    <nav
      aria-label="Main navigation"
      className="flex h-full flex-col p-3"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="mb-4 px-2 pt-1">
        <p className="text-[13px] font-semibold tracking-tight">Leon Guarding</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Workforce &amp; Operations
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {groups.map(({ group, items }) => (
          <div key={group} className="flex flex-col gap-0.5">
            <p
              className="px-2 pb-1 text-[10px] font-semibold tracking-wide uppercase"
              style={{ color: "var(--text-muted)" }}
            >
              {group}
            </p>
            {items.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.purpose}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-[13px] transition-colors"
                  style={{
                    background: active ? "var(--wash)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  {!item.built && (
                    <span
                      className="shrink-0 text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                      title="Planned — the screens are an outline, not a build"
                    >
                      plan
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="mt-auto rounded border p-2.5 text-[11px] leading-snug"
        style={{ borderColor: "var(--hairline)", color: "var(--text-muted)" }}
      >
        Screening follows BS&nbsp;7858:2019. We screen to five years, so
        five-year history verification is due within 12&nbsp;weeks of deployment
        (clause 7.6). Everything else is complete before site.
      </div>
    </nav>
  );
}
