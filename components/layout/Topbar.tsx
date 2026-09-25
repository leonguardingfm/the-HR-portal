"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { changeRole, signOut } from "@/app/signin/actions";
import { ROLE_DEPARTMENT, ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";
import { navItemForPath } from "./nav";

/**
 * The top bar (25 September 2026): the notification bell, the department the
 * person is working in, their own name — which opens their menu: the roles
 * they hold, if more than one, and their settings — and Sign out.
 *
 * The role menu offers only the roles this person actually holds, and the
 * change goes through a server action that checks the same thing again.
 */
export function Topbar({
  name,
  activeRole,
  roles,
  bell = null,
}: {
  name: string;
  activeRole: Role;
  roles: Role[];
  /** The Performance hub's notifications, for those who get them. */
  bell?: ReactNode;
}) {
  const pathname = usePathname();
  const item = navItemForPath(pathname === "" ? "/" : pathname);

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6" style={{ background: "var(--page)", borderColor: "var(--hairline)" }}>
      <p className="min-w-0 truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {item?.label ?? "Workforce & Operations"}
      </p>

      <div className="flex min-w-0 items-center gap-2">
        {bell}
        <span className="hidden rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap sm:inline" style={{ background: "var(--wash-neutral)", color: "var(--text-secondary)" }} title="The department you are working in">
          {ROLE_DEPARTMENT[activeRole]}
        </span>
        <UserMenu name={name} activeRole={activeRole} roles={roles} pathname={pathname} />
        <form action={signOut}>
          <button type="submit" className="h-7 rounded border px-2.5 text-[11px] whitespace-nowrap" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)", color: "var(--text-secondary)" }}>
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

function UserMenu({ name, activeRole, roles, pathname }: { name: string; activeRole: Role; roles: Role[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-7 max-w-[14rem] items-center gap-1.5 rounded border pr-2 pl-1 text-[12px] font-medium"
        style={{ background: "var(--surface-1)", borderColor: "var(--hairline)", color: "var(--text-primary)" }}
      >
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: "var(--brand-navy)" }}>
          {initials(name)}
        </span>
        <span className="hidden truncate sm:inline">{name}</span>
        <span aria-hidden className="text-[9px]" style={{ color: "var(--text-muted)" }}>
          ▾
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-lg border py-1 shadow-lg" style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}>
          <div className="border-b px-3 py-2" style={{ borderColor: "var(--hairline)" }}>
            <p className="truncate text-[13px] font-semibold">{name}</p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              {ROLE_LABELS[activeRole]} · {ROLE_DEPARTMENT[activeRole]}
            </p>
          </div>
          {roles.length > 1 && (
            <form action={changeRole} className="border-b py-1" style={{ borderColor: "var(--hairline)" }}>
              <input type="hidden" name="from" value={pathname} />
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Working as
              </p>
              {roles.map((r) => (
                <button
                  key={r}
                  type="submit"
                  name="role"
                  value={r}
                  role="menuitemradio"
                  aria-checked={r === activeRole}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[var(--wash)]"
                >
                  <span>
                    {ROLE_LABELS[r]} <span style={{ color: "var(--text-muted)" }}>· {ROLE_DEPARTMENT[r]}</span>
                  </span>
                  {r === activeRole && <span aria-hidden style={{ color: "var(--accent-text)" }}>✓</span>}
                </button>
              ))}
            </form>
          )}
          <Link href="/settings" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-[var(--wash)]">
            <span aria-hidden>⚙</span> My settings
            <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>
              theme, sound, password
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
