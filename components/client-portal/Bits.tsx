import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import type { LiveTone } from "@/lib/db/client-portal";

/** Colour always comes with words: the label says it, the colour only helps. */
const TONE: Record<LiveTone, { fg: string; bg: string; icon: string }> = {
  good: { fg: "var(--good-text)", bg: "var(--wash-good)", icon: "●" },
  info: { fg: "var(--accent-text)", bg: "var(--wash)", icon: "○" },
  warn: { fg: "var(--warning-text)", bg: "var(--wash-warning)", icon: "▲" },
  bad: { fg: "var(--critical-text)", bg: "var(--wash-critical)", icon: "■" },
};

export function Pill({ tone, children }: { tone: LiveTone; children: ReactNode }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap" style={{ background: t.bg, color: "var(--text-primary)" }}>
      <span aria-hidden style={{ color: t.fg }}>
        {t.icon}
      </span>
      {children}
    </span>
  );
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[12px] ${className}`} style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
      {children}
    </p>
  );
}

/** A client login not linked to an organisation — or one whose organisation does not have the portal. */
export function NotLinked() {
  return (
    <Card title="The client portal is not available for your login">
      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        Your organisation&apos;s portal is not switched on. To find out about it — your sites, your shift record, incidents and requests in one place — speak to your Leon Guarding account manager.
      </p>
    </Card>
  );
}

/** A paid extra this client does not have. Said plainly, once. */
export function NotInService({ title, what }: { title: string; what: string }) {
  return (
    <Card title={title}>
      <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {what} is not part of your organisation&apos;s service at the moment. If you would like it, speak to your Leon Guarding account manager.
      </p>
    </Card>
  );
}

export function Stat({ label, value, detail, href, tone }: { label: string; value: string | number; detail?: string; href?: string; tone?: LiveTone }) {
  const body = (
    <>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="tnum mt-1 text-[26px] leading-none font-semibold" style={{ color: tone ? TONE[tone].fg : "var(--text-primary)" }}>
        {value}
      </p>
      {detail && (
        <p className="mt-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
    </>
  );
  const cls = "block rounded-lg border px-4 py-3";
  const style = { background: "var(--surface-1)", borderColor: "var(--hairline)" };
  return href ? (
    <Link href={href} className={`${cls} hover:bg-[var(--wash)]`} style={style}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}

export const ukDay = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/London" });
export const ukTime = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export const ukDayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
