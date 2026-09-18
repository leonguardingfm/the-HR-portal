import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { clockState } from "@/lib/bs7858";
import { daysSince, formatDate, formatDays } from "@/lib/format";
import {
  INTERVIEW_STAGE_LABELS,
  RECRUITMENT_STAGE_LABELS,
  RECRUITMENT_STAGE_ORDER,
  SOURCE_LABELS,
  VETTING_STATUS_LABELS,
} from "@/lib/labels";
import {
  candidates,
  interviewsFor,
  requiredInterviewsHeld,
  screeningFileById,
} from "@/lib/mock/data";
import { isRestingStage, STAGE_SLA_DAYS } from "@/lib/sla";
import type { Severity } from "@/lib/types";

/**
 * Candidate list.
 *
 * Recruitment progress and vetting status are shown as two separate columns and
 * never merged into one number, because they answer different questions and are
 * owned by different people.
 */
export default function CandidatesPage() {
  const rows = [...candidates].sort(
    (a, b) =>
      RECRUITMENT_STAGE_ORDER.indexOf(b.stage) -
        RECRUITMENT_STAGE_ORDER.indexOf(a.stage) ||
      daysSince(b.stageSince) - daysSince(a.stageSince),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidates"
        description="One record per person, created once and carried from first contact to confirmed employment. The Interview Sheet and Recruitment Sheet become views of this, not separate files."
      />

      <Card
        title="Pipeline"
        subtitle="Recruitment progress and vetting status are deliberately separate columns."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Candidate</th>
                <th className="pb-2 pr-3 font-medium">Recruitment stage</th>
                <th className="pb-2 pr-3 font-medium">Days in stage</th>
                <th className="pb-2 pr-3 font-medium">Interviews</th>
                <th className="pb-2 pr-3 font-medium">Vetting status</th>
                <th className="pb-2 pr-3 font-medium">Screening clock</th>
                <th className="pb-2 pr-3 font-medium">Source</th>
                <th className="pb-2 font-medium">Owner</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const file = c.screeningFileId ? screeningFileById(c.screeningFileId) : null;
                const clock = file ? clockState(file) : null;
                const inStage = daysSince(c.stageSince);
                const sla = STAGE_SLA_DAYS[c.stage] || 1;
                // A resting stage has no queue to clear, so it is never late.
                const resting = isRestingStage(c.stage);
                const stageSeverity: Severity = resting
                  ? "neutral"
                  : inStage > sla * 3
                    ? "critical"
                    : inStage > sla
                      ? "serious"
                      : "good";
                return (
                  <tr key={c.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                    <td className="py-2.5 pr-3">
                      <p className="text-[13px] font-medium">{c.fullName}</p>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {c.siaBadgeName
                          ? `SIA badge name: ${c.siaBadgeName}`
                          : "SIA badge name pending register check"}
                        {c.pin && ` · PIN ${c.pin}`}
                      </p>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]">
                      {RECRUITMENT_STAGE_LABELS[c.stage]}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusPill severity={stageSeverity} label={formatDays(inStage)} />
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {(() => {
                        const held = interviewsFor(c.id);
                        if (held.length === 0) return "None yet";
                        const last = held[held.length - 1];
                        const complete = requiredInterviewsHeld(c.id);
                        return (
                          <>
                            {held.map((i) => INTERVIEW_STAGE_LABELS[i.stage]).join(" → ")}
                            <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>
                              {complete
                                ? `${last.interviewer}, ${formatDate(last.heldAt)}`
                                : "stages outstanding — blocks any offer (7.3.4)"}
                            </span>
                          </>
                        );
                      })()}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {file ? VETTING_STATUS_LABELS[file.status] : "No file yet"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {clock ? (
                        <StatusPill
                          severity={clock.severity}
                          label={
                            clock.expired ? "Expired" : `${formatDays(clock.daysRemaining)} left`
                          }
                        />
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          Not started
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3">
                      <Tag>{SOURCE_LABELS[c.source]}</Tag>
                    </td>
                    <td className="py-2.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {c.owner}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ModuleOutline
        note="The duplicate check is the highest-value automation relative to effort: it replaces three manual lookups per shortlisted candidate and is the reason the same person stops appearing under four spellings across four spreadsheets."
        items={[
          {
            label: "Duplicate and history check at the point of entry",
            detail: "Matches on NI number, SIA licence, email, phone and fuzzy surname plus date of birth — before a record exists. Surfaces previous employment, previous and open applications, and any recruitment email already sent. Offers open, merge, or an audited override.",
            phase: 1,
          },
          {
            label: "Candidate record page",
            detail: "Identity, requirement, stage and days in stage, vetting status with the blocking reason, outstanding items, every email and chaser sent with timestamps, documents, and the audit trail.",
            phase: 1,
          },
          {
            label: "Two-stage interview record",
            detail: "An optional initial interview by Ahmed or Usman, then the final interview held by Farhan. Interviewer, date, outcome and notes on each. The final interview is mandatory before any offer, so the portal blocks Gate 1 without it rather than just noting its absence.",
            clause: "7.3.4",
            phase: 1,
          },
          {
            label: "Personalised document checklist",
            detail: "Derived from the candidate's own declared history: two different document types per employment period dated at each end, evidence for every gap over 31 days, and address documents inside their age limits — validated at upload rather than rejected days later.",
            clause: "7.7",
            phase: 2,
          },
          {
            label: "Chaser ladders",
            detail: "Application at 3 and 7 days, documents every 3 working days to a maximum of 3 attempts, signatures at 2 and 5 days. Each sequence cancels itself the moment the item arrives.",
            phase: 2,
          },
          {
            label: "Candidate self-service",
            detail: "Log in, see exactly what is outstanding, upload documents against the right period. Removes most of the chasing rather than automating it.",
            phase: 4,
          },
        ]}
      />
    </div>
  );
}
