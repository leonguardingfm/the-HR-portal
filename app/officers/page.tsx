import Link from "next/link";
import { canAccessPath } from "@/components/layout/nav";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { requireSession } from "@/lib/auth/server";
import { expirySeverity } from "@/lib/core/deployability";
import { getOfficerPool, type OfficerRow } from "@/lib/db/officers";
import { formatDate, formatDays, formatTime } from "@/lib/format";
import { CONTROL_LABELS, VETTING_STATUS_LABELS } from "@/lib/labels";
import type { ControlId } from "@/lib/types";

export const dynamic = "force-dynamic";

const NEW_STARTER_DAYS = 30;
const DAY = 86_400_000;

const EMPLOYMENT_LABELS: Record<NonNullable<OfficerRow["employment"]>, string> = {
  conditional: "Conditional — screening incomplete",
  confirmed: "Confirmed",
  suspended: "Suspended",
};

/**
 * The officer pool.
 *
 * Everyone Control could roster, read from the real record. Deployability is
 * worked out here from the screening file, the licence, right to work and
 * employment — never set by hand — through the same check Scheduling runs
 * before it publishes a shift. An officer blocked here cannot be rostered.
 */
export default async function OfficersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; control?: string; q?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const now = new Date();
  const pool = await getOfficerPool(now);

  const isNew = (o: OfficerRow) => Boolean(o.startedAt && now.getTime() - o.startedAt.getTime() <= NEW_STARTER_DAYS * DAY);
  const deployable = pool.filter((o) => o.deployability.deployable);
  const blocked = pool.filter((o) => !o.deployability.deployable);
  const warned = pool.filter((o) => o.deployability.deployable && o.deployability.warnings.length > 0);
  const newStarters = pool.filter(isNew);
  const onShift = pool.filter((o) => o.onShiftNow);

  const view = ["deployable", "blocked", "new", "warnings"].includes(sp.view ?? "") ? sp.view! : "all";
  const control = sp.control === "alpha" || sp.control === "bravo" ? (sp.control as ControlId) : null;
  const q = (sp.q ?? "").trim().toLowerCase();

  const listed = pool
    .filter((o) =>
      view === "deployable" ? o.deployability.deployable
      : view === "blocked" ? !o.deployability.deployable
      : view === "new" ? isNew(o)
      : view === "warnings" ? o.deployability.deployable && o.deployability.warnings.length > 0
      : true,
    )
    .filter((o) => !control || o.controlTeam === control)
    .filter(
      (o) =>
        !q ||
        o.name.toLowerCase().includes(q) ||
        o.fullName.toLowerCase().includes(q) ||
        (o.pin ?? "").includes(q) ||
        (o.licence?.number ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view: view === "all" ? undefined : view, control: control ?? undefined, q: sp.q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const str = p.toString();
    return str ? `/officers?${str}` : "/officers";
  };

  const seesCandidates = canAccessPath(session.activeRole, "/candidates");
  const seesVetting = canAccessPath(session.activeRole, "/vetting");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Officers"
        description="Everyone Control can roster, and whether they can be deployed right now. Worked out from the screening file, SIA licence, right to work and employment — never set by hand — by the same check Scheduling runs before publishing a shift."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="In the pool" value={pool.length} detail={`${onShift.length} on shift now`} href={href({ view: undefined })} />
        <StatTile label="Deployable" value={deployable.length} detail="No hard stop today" severity="good" href={href({ view: "deployable" })} />
        <StatTile
          label="Blocked"
          value={blocked.length}
          detail="Cannot be rostered"
          severity={blocked.length > 0 ? "critical" : "good"}
          hero={blocked.length > 0}
          href={href({ view: "blocked" })}
        />
        <StatTile
          label="Expiring soon"
          value={warned.length}
          detail="Licence or right to work within 90 days"
          severity={warned.length > 0 ? "warning" : "good"}
          href={href({ view: "warnings" })}
        />
        <StatTile label="New starters" value={newStarters.length} detail={`Started in the last ${NEW_STARTER_DAYS} days`} href={href({ view: "new" })} />
      </div>

      <Card
        title="Officer pool"
        subtitle={`${listed.length} of ${pool.length} shown${control ? ` · ${CONTROL_LABELS[control].name}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form action="/officers" className="flex items-center gap-2">
              {view !== "all" && <input type="hidden" name="view" value={view} />}
              {control && <input type="hidden" name="control" value={control} />}
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Name, PIN or licence number"
                aria-label="Search officers"
                className="h-8 w-56 max-w-full rounded-md border px-2.5 text-[12px]"
                style={{ background: "var(--page)", color: "var(--text-primary)" }}
              />
            </form>
            <nav aria-label="Control team" className="flex gap-1">
              {([undefined, "alpha", "bravo"] as const).map((c) => (
                <Link
                  key={c ?? "all"}
                  href={href({ control: c })}
                  aria-current={control === (c ?? null) ? "true" : undefined}
                  className="rounded-md px-2.5 py-1 text-[12px]"
                  style={{
                    background: control === (c ?? null) ? "var(--wash)" : "transparent",
                    fontWeight: control === (c ?? null) ? 600 : 400,
                    color: control === (c ?? null) ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                >
                  {c ? CONTROL_LABELS[c].name : "All teams"}
                </Link>
              ))}
            </nav>
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Name as per SIA badge", "Control", "Employment", "SIA licence", "Right to work", "Screening", "Deployable", "Now / next"].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((o) => {
                const d = o.deployability;
                return (
                  <tr key={o.personId} className="align-top">
                    <td className="border-b px-5 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {o.candidacy && seesCandidates ? (
                          <Link href={`/candidates/${o.candidacy.id}`} className="font-medium hover:underline">
                            {o.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{o.name}</span>
                        )}
                        {isNew(o) && <Tag>New</Tag>}
                      </div>
                      <p className="tnum mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {o.pin ? `PIN ${o.pin}` : "No PIN — no employment record"}
                        {o.name.toLowerCase() !== o.fullName.toLowerCase() ? ` · ${o.fullName}` : ""}
                      </p>
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {o.controlTeam ? CONTROL_LABELS[o.controlTeam].name : "—"}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <Tag>{o.employment ? EMPLOYMENT_LABELS[o.employment] : "Deployed, not employed"}</Tag>
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {o.licence ? (
                        <>
                          <StatusPill severity={expirySeverity(o.licence.expiresAt.toISOString(), now)} label={formatDate(o.licence.expiresAt)} />
                          <p className="tnum mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {o.licence.number}
                          </p>
                        </>
                      ) : (
                        <span style={{ color: "var(--status-critical)" }}>None recorded</span>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {o.rightToWorkExpiry ? (
                        <StatusPill severity={expirySeverity(o.rightToWorkExpiry.toISOString(), now)} label={formatDate(o.rightToWorkExpiry)} />
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Not time-limited</span>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {o.screening ? (
                        <>
                          {seesVetting ? (
                            <Link href={`/vetting/${o.screening.fileId}`} className="hover:underline">
                              {VETTING_STATUS_LABELS[o.screening.status]}
                            </Link>
                          ) : (
                            VETTING_STATUS_LABELS[o.screening.status]
                          )}
                          {o.screening.clock && (
                            <p className="mt-1">
                              <StatusPill
                                severity={o.screening.clock.severity}
                                label={o.screening.clock.expired ? "Clock expired" : `${formatDays(o.screening.clock.daysRemaining)} left`}
                              />
                            </p>
                          )}
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>{o.employment === "confirmed" ? "Complete" : "No file"}</span>
                      )}
                    </td>
                    <td className="max-w-[16rem] border-b px-5 py-2.5">
                      {d.deployable ? (
                        <StatusPill severity={d.warnings.length ? "warning" : "good"} label={d.warnings.length ? "Yes — watch" : "Yes"} />
                      ) : (
                        <StatusPill severity="critical" label="Blocked" />
                      )}
                      {(d.blockers[0] ?? d.warnings[0]) && (
                        <p className="mt-1 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                          {(d.blockers[0] ?? d.warnings[0])!.label}
                          {d.blockers.length + d.warnings.length > 1 ? ` · +${d.blockers.length + d.warnings.length - 1} more` : ""}
                        </p>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {o.onShiftNow ? (
                        <>
                          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                            On shift
                          </span>
                          <p className="text-[11px]">
                            {o.onShiftNow.site} · until {formatTime(o.onShiftNow.endsAt)}
                          </p>
                        </>
                      ) : o.nextShift ? (
                        <>
                          Next: {formatDate(o.nextShift.startsAt)} {formatTime(o.nextShift.startsAt)}
                          <p className="text-[11px]">{o.nextShift.site}</p>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Nothing rostered</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No officers match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          A conditional officer needs a live screening file with the deployment gate open; confirmed employment means screening was completed and signed off.
          An expired clock, unsuccessful screening, a lapsed licence or right to work, or a suspension each blocks the officer here and at the rota (7.6).
        </p>
      </Card>

      <ModuleOutline
        subtitle="Still to come. The pool itself, deployability from the real record, and the handover from onboarding are built above."
        note="All of this follows from the candidate and screening record: the same person carries through rather than being re-created at deployment, which is the identity engine doing its job. The rota and the live board read from here — an officer's deployability is worked out once, in one place, and Scheduling is blocked by it."
        items={[
          {
            label: "Pool search for the requirement check",
            detail: "By site experience, availability, shift pattern, control and deployability, so Control's first action takes seconds rather than a scan of a spreadsheet.",
            phase: 1,
          },
          {
            label: "Licence expiry pipeline",
            detail: "Automatic warnings at 90, 60 and 30 days to the officer, Control and Recruitment — not on the day it lapses.",
            phase: 2,
          },
          {
            label: "SIA status monitoring",
            detail: "Checked twice daily by hand on the SIA site today. The portal holds every licence number, so it can run the check itself and raise an officer who has gone inactive as a task rather than relying on someone looking.",
            clause: "7.4c1",
            phase: 2,
          },
          {
            label: "Right-to-work follow-up and shift block",
            detail: "Warnings at 90, 60 and 30 days, chased by email and message, with shift assignment blocked once an expiry passes until updated evidence is verified. Plus the daily visa and right-to-work status report.",
            phase: 1,
          },
          {
            label: "Client PRN mapping",
            detail: "Where a site keeps its own reference for an officer alongside our PIN, the two are recorded against each other so neither side has to match on a name.",
            phase: 1,
          },
        ]}
      />
    </div>
  );
}
