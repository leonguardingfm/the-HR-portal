import { ActionButton } from "@/components/ui/ActionButton";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { ActionForm } from "./ActionForm";
import {
  approveAdminRequest,
  cancelAdminItem,
  completeAdminItem,
  rejectAdminRequest,
  reviewAdminRequest,
  startAdminItem,
} from "@/lib/actions/admin";
import { PRIORITIES, formatPence } from "@/lib/core/admin";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import type { AdminItemRow } from "@/lib/db/admin-queries";
import type { Severity } from "@/lib/types";

export interface AdminPerms {
  start: string | null;
  review: string | null;
  approve: string | null;
  reject: string | null;
  complete: string | null;
  cancel: string | null;
}

/**
 * One item, with its whole life on it.
 *
 * The approval chain is shown even when nothing is outstanding, because the
 * useful question a fortnight later is not "is this approved" but "who
 * approved it, on what grounds, and was that the right person". Rungs already
 * signed carry the name, the role and the reason.
 *
 * Buttons a role cannot press are rendered disabled with the reason. Hiding
 * them just moves the conversation to WhatsApp.
 */

const STATE_SEVERITY: Record<string, Severity> = {
  raised: "warning",
  assigned: "neutral",
  in_progress: "neutral",
  reviewed: "warning",
  approved: "good",
  rejected: "critical",
  completed: "good",
  cancelled: "neutral",
};

function escalationSeverity(stage: number, state: string): Severity {
  if (state === "completed" || state === "cancelled" || state === "rejected") return "neutral";
  if (stage >= 3) return "critical";
  if (stage === 2) return "serious";
  if (stage === 1) return "warning";
  return "good";
}

export function AdminItemList({
  items,
  perms,
  empty = "Nothing outstanding.",
}: {
  items: AdminItemRow[];
  perms: AdminPerms;
  empty?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {empty}
      </p>
    );
  }

  return (
    <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
      {items.map((item) => {
        const closed = ["completed", "cancelled", "rejected"].includes(item.state);
        const outstanding = item.approvals.filter((a) => a.decision === null).length;

        return (
          <li key={item.id} className="py-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                  <span style={{ color: "var(--text-muted)" }}>{item.reference}</span>
                  {item.title}
                  {item.amountPence !== null && (
                    <Tag>{formatPence(item.amountPence)}</Tag>
                  )}
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  <span>{item.track === "request" ? "Request" : "Task"}</span>
                  <span aria-hidden>·</span>
                  <span>{PRIORITIES[item.priority].label}</span>
                  <span aria-hidden>·</span>
                  <span>raised by {item.requestedByName}</span>
                  {item.assignedToName && (
                    <>
                      <span aria-hidden>·</span>
                      <span>with {item.assignedToName}</span>
                    </>
                  )}
                  {item.subject && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{item.subject}</span>
                    </>
                  )}
                  {item.aboutPersonName && (
                    <>
                      <span aria-hidden>·</span>
                      <span>about {item.aboutPersonName}</span>
                    </>
                  )}
                </p>

                {item.detail && (
                  <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-primary)" }}>
                    {item.detail}
                  </p>
                )}

                <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {closed
                    ? item.completedAt
                      ? `Closed ${formatDate(item.completedAt)}`
                      : `${item.state.replace(/_/g, " ")}`
                    : item.escalation.stage === 0
                      ? `Due ${formatDate(item.dueAt)}`
                      : `${Math.round(item.escalation.hoursLate)}h past target — ${item.escalation.note} Escalated to ${item.escalation.escalatedTo ? ROLE_LABELS[item.escalation.escalatedTo] : "nobody"}.`}
                </p>

                {/* The approval chain. Shown whole, always. */}
                {item.approvals.length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {item.approvals.map((a) => (
                      <li key={a.step} className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
                        <span
                          aria-hidden
                          style={{
                            color:
                              a.decision === "approved"
                                ? "var(--good-text)"
                                : a.decision === "rejected"
                                  ? "var(--critical-text)"
                                  : "var(--text-muted)",
                          }}
                        >
                          {a.decision === "approved" ? "✓" : a.decision === "rejected" ? "✕" : "○"}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>Step {a.step}:</span>
                        <span style={{ color: "var(--text-primary)" }}>
                          {a.decision
                            ? `${a.decision} by ${a.decidedByName} as ${a.decidedByRole ? ROLE_LABELS[a.decidedByRole] : "—"}${a.decidedAt ? `, ${formatDate(a.decidedAt)}` : ""}`
                            : `awaiting ${a.requiredRoles.map((r) => ROLE_LABELS[r]).join(" or ")}`}
                        </span>
                        <span style={{ color: "var(--text-secondary)" }}>
                          {a.grounds ? `— ${a.grounds}` : `— ${a.reason}`}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}

                {/* What can be done to it, now. */}
                {!closed && (
                  <div className="mt-2.5 flex flex-wrap items-start gap-2">
                    {item.state === "assigned" && (
                      <ActionButton
                        action={startAdminItem.bind(null, item.id)}
                        label="Start"
                        denied={perms.start}
                      />
                    )}

                    {item.track === "request" && ["raised", "assigned"].includes(item.state) && (
                      <ActionForm
                        action={reviewAdminRequest.bind(null, item.id)}
                        submitLabel="Review & cost"
                        denied={perms.review}
                        compact
                        fields={[
                          {
                            name: "amountPounds",
                            label: "Amount £",
                            kind: "number",
                            placeholder: item.amountPence ? String(item.amountPence / 100) : "0.00",
                          },
                          { name: "note", label: "Note", placeholder: "What you checked" },
                        ]}
                      />
                    )}

                    {item.track === "request" && outstanding > 0 && item.state !== "raised" && (
                      <>
                        <ActionForm
                          action={approveAdminRequest.bind(null, item.id)}
                          submitLabel={`Approve step ${item.awaiting?.step ?? ""}`}
                          variant="primary"
                          denied={perms.approve}
                          compact
                          fields={[
                            {
                              name: "grounds",
                              label: "Grounds",
                              placeholder: "Required over the high threshold",
                            },
                          ]}
                        />
                        <ActionForm
                          action={rejectAdminRequest.bind(null, item.id)}
                          submitLabel="Reject"
                          denied={perms.reject}
                          compact
                          fields={[
                            { name: "grounds", label: "Why", required: true, placeholder: "The person asking needs to know" },
                          ]}
                        />
                      </>
                    )}

                    {(item.track === "task" || outstanding === 0) && (
                      <ActionForm
                        action={completeAdminItem.bind(null, item.id)}
                        submitLabel="Complete"
                        variant={outstanding === 0 && item.track === "request" ? "primary" : "quiet"}
                        denied={perms.complete}
                        compact
                        fields={[{ name: "note", label: "Note", placeholder: "Optional" }]}
                      />
                    )}

                    <ActionForm
                      action={cancelAdminItem.bind(null, item.id)}
                      submitLabel="Cancel"
                      denied={perms.cancel}
                      compact
                      fields={[
                        { name: "reason", label: "Reason", required: true, placeholder: "Why it is being dropped" },
                      ]}
                    />
                  </div>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill severity={STATE_SEVERITY[item.state] ?? "neutral"} label={item.state.replace(/_/g, " ")} />
                {!closed && item.escalation.stage > 0 && (
                  <StatusPill
                    severity={escalationSeverity(item.escalation.stage, item.state)}
                    label={`Escalation ${item.escalation.stage}`}
                  />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
