import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill } from "@/components/ui/StatusPill";
import { InterviewChips } from "@/components/recruitment/InterviewChips";
import { requireSession } from "@/lib/auth/server";
import { canDo } from "@/lib/auth/permissions";
import {
  END_STAGES,
  RECRUITMENT_PIPELINE,
  STAGE_INTERVIEW,
  daysIn,
  requiredInterviews,
  stageSeverity,
} from "@/lib/core/recruitment";
import { getPipeline } from "@/lib/db/recruitment";
import { formatDays } from "@/lib/format";
import { RECRUITMENT_STAGE_LABELS, VETTING_STATUS_LABELS } from "@/lib/labels";
import type { RecruitmentStage, VettingStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERVIEW_STAGES = Object.keys(STAGE_INTERVIEW) as RecruitmentStage[];

/** Short labels for the stage strip, where the full ones do not fit. */
const SHORT: Partial<Record<RecruitmentStage, string>> = {
  application_received: "Application in",
  application_complete: "Application done",
  first_interview: "1st interview",
  second_interview: "2nd interview",
  additional_interview: "Client interview",
  conditional_offer: "Offer",
  welcome_pack: "Welcome pack",
  signed_docs_complete: "Signed docs",
  onboarding_complete: "Onboarded",
  invited: "Invited",
};

/**
 * The recruitment pipeline.
 *
 * One record per person, carried from first contact to onboarding. Recruitment
 * progress and vetting status are separate columns and never merged into one
 * number: they answer different questions and are owned by different people.
 *
 * "Interviews" in the sidebar arrives here with `?stage=interviews` — this list
 * narrowed to the interview stages, not a screen of its own.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string; mine?: string; show?: string }>;
}) {
  const session = await requireSession();
  const sp = await searchParams;
  const rows = await getPipeline();
  const now = new Date();

  const stageFilter =
    sp.stage === "interviews"
      ? "interviews"
      : RECRUITMENT_PIPELINE.includes(sp.stage as RecruitmentStage)
        ? (sp.stage as RecruitmentStage)
        : null;
  const showClosed = sp.show === "closed";
  const mine = sp.mine === "1";
  const q = (sp.q ?? "").trim().toLowerCase();

  const active = rows.filter((r) => RECRUITMENT_PIPELINE.includes(r.stage) && r.stage !== "onboarding_complete");
  const late = active.filter((r) => ["serious", "critical"].includes(stageSeverity(r.stage, daysIn(r.stageSince, now))));
  const inInterview = active.filter((r) => INTERVIEW_STAGES.includes(r.stage));
  const offers = rows.filter((r) =>
    (["conditional_offer", "welcome_pack", "signed_docs_complete"] as RecruitmentStage[]).includes(r.stage),
  );

  const listed = rows
    // A specific stage shows everyone in it, including "Onboarded", which is
    // otherwise a closed stage.
    .filter((r) =>
      stageFilter && stageFilter !== "interviews"
        ? true
        : showClosed
          ? END_STAGES.includes(r.stage)
          : !END_STAGES.includes(r.stage),
    )
    .filter((r) =>
      stageFilter === "interviews"
        ? INTERVIEW_STAGES.includes(r.stage)
        : stageFilter
          ? r.stage === stageFilter
          : true,
    )
    .filter((r) => !mine || r.ownerUserId === session.userId)
    .filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.email ?? "").toLowerCase().includes(q) ||
        (r.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")) ||
        (r.requirement?.client ?? "").toLowerCase().includes(q),
    )
    .sort((a, b) => {
      // Most overdue first, then longest in stage.
      const rank = { critical: 0, serious: 1, good: 2, neutral: 3 } as const;
      const sa = rank[stageSeverity(a.stage, daysIn(a.stageSince, now))];
      const sb = rank[stageSeverity(b.stage, daysIn(b.stageSince, now))];
      return sa - sb || a.stageSince.getTime() - b.stageSince.getTime();
    });

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = {
      stage: stageFilter ?? undefined,
      q: sp.q || undefined,
      mine: mine ? "1" : undefined,
      show: showClosed ? "closed" : undefined,
      ...patch,
    };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/candidates?${s}` : "/candidates";
  };

  const canCreate = canDo(session.activeRole, "candidacy.create");

  return (
    <div className="space-y-5">
      <PageHeader
        title={stageFilter === "interviews" ? "Interviews" : "Recruitment"}
        description={
          stageFilter === "interviews"
            ? "The pipeline narrowed to the interview stages. An interview is required before any offer of employment is made [7.3.4], so this is a gate rather than a courtesy."
            : "Every candidate from first contact to onboarding, most overdue first. Open a candidate to move them on, record an interview or withdraw them."
        }
        action={
          canCreate ? (
            <Link
              href="/candidates/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3.5 text-[12px] font-medium text-white"
              style={{ background: "var(--series-1)" }}
            >
              <span aria-hidden>+</span> New candidate
            </Link>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="In the pipeline" value={active.length} detail="Sourcing to signed documents" href={href({ stage: undefined, show: undefined })} />
        <StatTile
          label="Over their stage SLA"
          value={late.length}
          detail="Longer in stage than our target"
          severity={late.length > 0 ? "serious" : "good"}
          hero={late.length > 0}
        />
        <StatTile label="In interview" value={inInterview.length} detail="First, second or client" href={href({ stage: "interviews", show: undefined })} />
        <StatTile label="Offer to signed docs" value={offers.length} detail="Conditional offer onwards" />
      </div>

      {/* The stage strip: where everyone is, and a one-click filter. */}
      <nav aria-label="Stages" className="-mx-1 overflow-x-auto pb-1">
        <ol className="flex min-w-max gap-1.5 px-1">
          {RECRUITMENT_PIPELINE.map((s) => {
            const n = rows.filter((r) => r.stage === s).length;
            const on = stageFilter === s;
            return (
              <li key={s}>
                <Link
                  href={href({ stage: on ? undefined : s, show: undefined })}
                  aria-current={on ? "true" : undefined}
                  className="flex min-w-[6.5rem] flex-col rounded-md border px-2.5 py-2 transition-colors hover:bg-[var(--wash)]"
                  style={{
                    background: on ? "var(--wash)" : "var(--surface-1)",
                    borderColor: on ? "var(--series-1)" : "var(--hairline)",
                  }}
                >
                  <span className="text-[11px] whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>
                    {SHORT[s] ?? RECRUITMENT_STAGE_LABELS[s]}
                  </span>
                  <span className="tnum text-[16px] font-semibold" style={{ color: n ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {n}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card
        title={showClosed ? "Closed" : stageFilter && stageFilter !== "interviews" ? RECRUITMENT_STAGE_LABELS[stageFilter] : "Candidates"}
        subtitle={`${listed.length} shown${mine ? " · assigned to me" : ""}${showClosed ? " · withdrawn, onboarded or deployed" : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <form action="/candidates" className="flex items-center gap-2">
              {stageFilter && <input type="hidden" name="stage" value={stageFilter} />}
              {mine && <input type="hidden" name="mine" value="1" />}
              {showClosed && <input type="hidden" name="show" value="closed" />}
              <input
                type="search"
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search name, email, phone, client"
                aria-label="Search candidates"
                className="h-8 w-60 max-w-full rounded-md border px-2.5 text-[12px]"
                style={{ background: "var(--page)", color: "var(--text-primary)" }}
              />
            </form>
            {[
              { label: "Mine", on: mine, to: href({ mine: mine ? undefined : "1" }) },
              { label: "Closed", on: showClosed, to: href({ show: showClosed ? undefined : "closed", stage: undefined }) },
            ].map((t) => (
              <Link
                key={t.label}
                href={t.to}
                aria-pressed={t.on}
                className="h-8 rounded-md border px-3 text-[12px] leading-8 font-medium"
                style={{
                  background: t.on ? "var(--wash)" : "var(--surface-1)",
                  borderColor: t.on ? "var(--series-1)" : "var(--hairline)",
                }}
              >
                {t.label}
              </Link>
            ))}
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                {["Candidate", "Stage", "In stage", "Interviews", "Requirement", "Vetting", "Owner"].map((h) => (
                  <th key={h} className="border-b px-5 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listed.map((r) => {
                const d = daysIn(r.stageSince, now);
                const sev = stageSeverity(r.stage, d);
                return (
                  <tr key={r.id} className="group align-top hover:bg-[var(--wash)]">
                    <td className="border-b px-5 py-2.5">
                      <Link href={`/candidates/${r.id}`} className="font-medium underline-offset-2 group-hover:underline">
                        {r.name}
                      </Link>
                      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.email ?? r.phone ?? "No contact details"}
                      </p>
                    </td>
                    <td className="border-b px-5 py-2.5">{RECRUITMENT_STAGE_LABELS[r.stage]}</td>
                    <td className="border-b px-5 py-2.5">
                      {sev === "neutral" ? (
                        <span className="tnum" style={{ color: "var(--text-muted)" }}>{formatDays(d)}</span>
                      ) : (
                        <StatusPill severity={sev} label={formatDays(d)} />
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      <InterviewChips required={requiredInterviews(r.requiresAdditional)} held={r.interviews} />
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {r.requirement ? (
                        <>
                          {r.requirement.client}
                          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {r.requirement.reference}
                          </p>
                        </>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>General pool</span>
                      )}
                    </td>
                    <td className="border-b px-5 py-2.5" style={{ color: "var(--text-secondary)" }}>
                      {r.vettingStatus ? VETTING_STATUS_LABELS[r.vettingStatus as VettingStatus] : "Not opened"}
                    </td>
                    <td className="border-b px-5 py-2.5">
                      {r.ownerName ?? <span style={{ color: "var(--text-muted)" }}>Unassigned</span>}
                    </td>
                  </tr>
                );
              })}
              {listed.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No candidates match.{" "}
                    {canCreate && (
                      <Link href="/candidates/new" style={{ color: "var(--series-1)" }}>
                        Add a candidate
                      </Link>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
