"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { isActive, navGroupsForRole } from "./nav";
import type { Role } from "@/lib/types";

/**
 * The phone menu.
 *
 * Deliberately not a sideways-scrolling strip of every link: a strip has to be
 * dragged to be read, and anything past the fold is effectively invisible —
 * which is how people end up believing a section does not exist. This is one
 * button and a grouped panel, the same departments in the same order as the
 * sidebar, so the two cannot drift apart.
 *
 * The heading of the group you are in starts open; the rest are closed, which
 * is what makes the whole list reachable in one thumb's reach.
 */
export function MobileNav({ role, hidden = [] }: { role: Role; hidden?: string[] }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const groups = navGroupsForRole(role, hidden);
  const [openMenu, setOpenMenu] = useState(false);

  const current =
    groups
      .flatMap((g) => g.items.map((i) => ({ ...i, group: g.group })))
      .find((i) => isActive(i, pathname, search)) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpenMenu((v) => !v)}
          aria-expanded={openMenu}
          aria-controls="mobile-nav-panel"
          className="flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[12px] font-medium"
          style={{ borderColor: "var(--hairline)", color: "var(--text-primary)" }}
        >
          <span aria-hidden>{openMenu ? "×" : "☰"}</span>
          Menu
        </button>
        <p className="min-w-0 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {current ? (
            <>
              <span style={{ color: "var(--text-muted)" }}>{current.group} · </span>
              {current.label}
            </>
          ) : (
            "Leon Guarding"
          )}
        </p>
      </div>

      {openMenu && (
        <div id="mobile-nav-panel" className="flex flex-col gap-2 pb-1">
          {groups.map(({ group, spec, items }) => (
            <details
              key={group}
              open={items.some((i) => isActive(i, pathname, search)) || spec.defaultOpen}
            >
              <summary
                className="cursor-pointer rounded px-1 py-1 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {group}
              </summary>
              <div className="flex flex-col gap-0.5 pt-1 pl-2">
                {items.map((item) => {
                  const active = isActive(item, pathname, search);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpenMenu(false)}
                      aria-current={active ? "page" : undefined}
                      className="rounded px-2 py-1.5 text-[13px]"
                      style={{
                        background: active ? "var(--wash)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-secondary)",
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {item.label}
                      {!item.built && (
                        <span className="ml-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          plan
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
