"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { isActive, navGroupsForRole, type NavGroup } from "./nav";
import type { Role } from "@/lib/types";

/**
 * Grouped, collapsible navigation.
 *
 * The groups are departments, in the approved order: Dashboard, Control Room,
 * HR, Admin, then Management and the rest. Each team finds the whole of its job
 * in one heading, and can close the ones that are not theirs.
 *
 * Which headings are open is remembered per person rather than globally,
 * because Control and the Admin Officer want opposite things from the same
 * sidebar. It is a browser preference, not a fact about the business, so it
 * lives in localStorage and the platform works identically without it.
 *
 * Two behaviours worth knowing:
 *  - The group containing the page you are on is always open. A collapsed
 *    group can never hide where you actually are.
 *  - A module whose screens are not built yet is shown with a marker rather
 *    than hidden — the navigation is the plan, visibly.
 */

const STORAGE_PREFIX = "leon.nav.open.";

export function Sidebar({ role, userId, locked = [] }: { role: Role; userId: string; locked?: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const groups = navGroupsForRole(role);

  // Start from the defaults so the server and the first client render agree.
  // The stored preference is applied in an effect, which is also why a browser
  // with storage blocked simply gets the defaults instead of an error.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.group, g.spec.defaultOpen])),
  );
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
      if (raw) {
        const stored = JSON.parse(raw) as Record<string, boolean>;
        setOpen((current) => ({ ...current, ...stored }));
      }
    } catch {
      // Private window, cleared site data, storage disabled — the defaults are
      // a perfectly good answer.
    }
    setRestored(true);
  }, [userId]);

  function toggle(group: NavGroup) {
    setOpen((current) => {
      const next = { ...current, [group]: !current[group] };
      try {
        window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(next));
      } catch {
        // Not being able to remember the preference is not a reason to refuse
        // to apply it for this session.
      }
      return next;
    });
  }

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

      <div className="flex flex-col gap-2.5">
        {groups.map(({ group, spec, items }) => {
          const holdsCurrentPage = items.some((i) => isActive(i, pathname, search));
          const expanded = holdsCurrentPage || open[group] !== false;
          const panelId = `nav-${group.replace(/\s+/g, "-").toLowerCase()}`;

          return (
            <div key={group} className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => toggle(group)}
                aria-expanded={expanded}
                aria-controls={panelId}
                title={spec.purpose}
                className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                <span
                  aria-hidden
                  className="inline-block w-2 shrink-0 text-[9px] leading-none transition-transform"
                  style={{ transform: expanded ? "rotate(90deg)" : "none" }}
                >
                  ▶
                </span>
                <span className="min-w-0 flex-1 truncate">{group}</span>
                {!expanded && (
                  <span className="shrink-0 font-normal tabular-nums normal-case">
                    {items.length}
                  </span>
                )}
              </button>

              {/* Hidden rather than unmounted, so the collapsed state does not
                  cost a re-render of every link when it reopens. */}
              <div id={panelId} hidden={!expanded} className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActive(item, pathname, search);
                  // A client's paid extra they do not have: still listed, locked (26 September 2026).
                  const lock = locked.includes(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={lock ? `${item.purpose} Not included in your organisation's service.` : item.purpose}
                      aria-label={lock ? `${item.label} (locked — not included in your service)` : undefined}
                      aria-current={active ? "page" : undefined}
                      className="flex items-center justify-between gap-2 rounded pr-2 pl-[1.4rem] py-1.5 text-[13px] transition-colors"
                      style={{
                        background: active ? "var(--wash)" : "transparent",
                        color: active ? "var(--text-primary)" : lock ? "var(--text-muted)" : "var(--text-secondary)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                      {lock && (
                        <span aria-hidden className="shrink-0 text-[11px]">
                          🔒
                        </span>
                      )}
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
            </div>
          );
        })}
      </div>

      {/* Staff guidance. A client contact is not screening anyone, and has no
          business being told how we screen. */}
      {role !== "client" && (
        <div
          className="mt-auto rounded border p-2.5 text-[11px] leading-snug"
          style={{ borderColor: "var(--hairline)", color: "var(--text-muted)" }}
        >
          Screening follows BS&nbsp;7858:2019. We screen to five years, so
          five-year history verification is due within 12&nbsp;weeks of deployment
          (clause 7.6). Everything else is complete before site.
        </div>
      )}
      {!restored && <span className="sr-only"> Loading saved preferences.</span>}
    </nav>
  );
}
