"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/types";
import { navForRole } from "./nav";

export function MobileNav({ role }: { role: Role }) {
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
