"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navForRole } from "./nav";
import type { Role } from "@/lib/types";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <nav
      aria-label="Main navigation"
      className="flex h-full flex-col gap-1 p-3"
      style={{ borderColor: "var(--hairline)" }}
    >
      <div className="mb-4 px-2 pt-1">
        <p className="text-[13px] font-semibold tracking-tight">HR Portal</p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Recruitment &amp; Vetting
        </p>
      </div>

      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.purpose}
            aria-current={active ? "page" : undefined}
            className="rounded px-2 py-1.5 text-[13px] transition-colors"
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
