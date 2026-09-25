import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ManualTick, SwitchOffDemo } from "@/components/system/GoLiveForms";
import { requireSession } from "@/lib/auth/server";
import { goLiveChecks, type CheckState } from "@/lib/db/golive";

export const dynamic = "force-dynamic";

const MARK: Record<CheckState, { icon: string; color: string; words: string }> = {
  ok: { icon: "✓", color: "var(--good-text)", words: "Done" },
  warn: { icon: "!", color: "var(--warning-text)", words: "Should do" },
  fail: { icon: "✕", color: "var(--critical-text)", words: "Must do" },
};

/**
 * Go-live (26 September 2026): everything that must be true before real people
 * and real data go in. The portal checks what it can see; the rest the
 * Managing Director ticks, with a note, and each tick is recorded.
 */
export default async function GoLivePage() {
  await requireSession();
  const { checks, manual } = await goLiveChecks();
  const groups = [...new Set(checks.map((c) => c.group))];
  const manualGroups = [...new Set(manual.map((m) => m.group))];
  const fails = checks.filter((c) => c.state === "fail").length;
  const warns = checks.filter((c) => c.state === "warn").length;
  const todo = manual.filter((m) => !m.done).length;
  const ready = !fails && !todo;
  const demo = checks.some((c) => (c.key === "demo_accounts" || c.key === "test_mailbox") && c.state !== "ok");

  return (
    <div className="space-y-5">
      <PageHeader title="Go-live checklist" description="Everything that must be true before real people and real data go in. The portal checks what it can see for itself; the rest you tick, with a note of how you know." />
      <div role="status" className="rounded-lg border px-4 py-3 text-[14px]" style={{ borderColor: ready ? "var(--status-good)" : "var(--status-critical)", background: ready ? "var(--wash-good, var(--wash))" : "var(--wash-critical)", borderLeftWidth: 4 }}>
        {ready ? (
          <strong>Ready to go live{warns ? ` — with ${warns} thing${warns === 1 ? "" : "s"} worth doing soon` : ""}.</strong>
        ) : (
          <>
            <strong>Not ready yet.</strong> {fails} check{fails === 1 ? "" : "s"} failing, {todo} item{todo === 1 ? "" : "s"} still to tick{warns ? `, ${warns} worth doing` : ""}.
          </>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {groups.map((g) => (
          <Card key={g} title={g}>
            <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
              {checks
                .filter((c) => c.group === g)
                .map((c) => (
                  <li key={c.key} className="flex gap-3 py-2.5" style={{ borderColor: "var(--hairline)" }}>
                    <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: MARK[c.state].color }}>
                      {MARK[c.state].icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">
                        {c.label} <span className="sr-only">— {MARK[c.state].words}</span>
                      </p>
                      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {c.detail}
                      </p>
                      {c.state !== "ok" && c.fix && (
                        <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-primary)" }}>
                          <span className="font-semibold">How: </span>
                          {c.fix}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>

      {demo && (
        <Card title="Demonstration data" subtitle="Production starts from an empty database, so this should never be needed. If demonstration accounts got in, switch them off here: they cannot sign in again, and nothing they did is deleted. Your own account is left on.">
          <SwitchOffDemo />
        </Card>
      )}

      {manualGroups.map((g) => (
        <Card key={g} title={g === "UK GDPR" ? "UK GDPR — what the portal cannot check for you" : g} subtitle={g === "UK GDPR" ? "Not legal advice: have your data protection adviser confirm each. The portal already keeps the audit trail, retention rules and role separation these rely on." : undefined}>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {manual
              .filter((m) => m.group === g)
              .map((m) => (
                <li key={m.key} className="flex flex-wrap items-start justify-between gap-3 py-3" style={{ borderColor: "var(--hairline)" }}>
                  <div className="flex min-w-0 flex-1 gap-3">
                    <span aria-hidden className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ background: m.done ? MARK.ok.color : "var(--text-muted)" }}>
                      {m.done ? "✓" : ""}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{m.label}</p>
                      <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                        {m.why}
                      </p>
                    </div>
                  </div>
                  <ManualTick k={m.key} done={m.done} />
                </li>
              ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
