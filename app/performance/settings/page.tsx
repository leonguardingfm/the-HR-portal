import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClosedDaysForm, MailboxForm, SlaForm } from "@/components/performance/HubSettingsForms";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/server";
import { OFFICE_HOURS, PRIORITIES, UK_BANK_HOLIDAYS, departmentLabel, spanText } from "@/lib/core/hub";
import { db } from "@/lib/db/client";
import { slaPolicy } from "@/lib/db/hub";

export const dynamic = "force-dynamic";

const spanValue = (s: { minutes: number } | { workingDays: number }) => ("workingDays" in s ? `${s.workingDays}wd` : s.minutes % 60 === 0 && s.minutes >= 60 ? `${s.minutes / 60}h` : `${s.minutes}m`);

/** The hub's settings, for the Managing Director: its clocks, closure days and mailboxes. */
export default async function HubSettingsPage() {
  // The hub's settings are the Managing Director's, though heads may open Performance.
  const session = await requireSession();
  if (session.activeRole !== "top_management") redirect("/performance");
  const [policy, closed, mailboxes] = await Promise.all([slaPolicy(), db.setting.findUnique({ where: { key: "hub.closed_days" } }), db.mailbox.findMany({ orderBy: { displayName: "asc" } })]);
  const values: Record<string, string> = {};
  for (const p of PRIORITIES) for (const c of ["accept", "action", "update"] as const) values[`${p.id}.${c}`] = spanValue(policy[p.id][c]);
  const upcoming = UK_BANK_HOLIDAYS.filter((d) => d >= new Date().toISOString().slice(0, 10)).slice(0, 8);
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/performance" className="underline underline-offset-2">
          Performance
        </Link>{" "}
        / Hub settings
      </nav>
      <PageHeader title="Hub settings" description="The Performance hub's clocks, the days the office is closed, and each shared mailbox. Every change is recorded in the audit log." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="The clocks" subtitle={`Now: ${PRIORITIES.map((p) => `${p.label} ${spanText(policy[p.id].accept)} / ${spanText(policy[p.id].action)}`).join(" · ")}`}>
          <SlaForm values={values} />
        </Card>
        <Card title="Office hours" subtitle={`HR and Accounts clocks run ${OFFICE_HOURS.start}–${OFFICE_HOURS.end}, Monday to Friday, and stop on bank holidays. The Control Room's never stop.`}>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Next bank holidays: {upcoming.join(" · ")}
          </p>
          <ClosedDaysForm days={closed ? (JSON.parse(closed.value) as string[]) : []} />
        </Card>
      </div>
      <Card title="Shared mailboxes" subtitle="Test: the built-in test inbox. Shadow: a real mailbox read and sorted with nobody alerted — for a week, to check the sorting before going live. Live: the real thing.">
        {mailboxes.map((m) => (
          <MailboxForm key={m.id} m={{ id: m.id, address: m.address, name: `${m.displayName} · ${departmentLabel(m.department)}`, department: m.department, mode: m.mode, officeHoursOnly: m.officeHoursOnly, readAttachments: m.readAttachments, active: m.active, lastSyncAt: m.lastSyncAt?.toISOString() ?? null }} />
        ))}
      </Card>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Reply templates are written by each department&apos;s manager:{" "}
        <Link href="/hub/templates" className="underline underline-offset-2">
          Reply templates
        </Link>
      </p>
    </div>
  );
}
