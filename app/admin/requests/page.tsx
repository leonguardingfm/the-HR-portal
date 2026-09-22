import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { AdminItemList } from "@/components/admin/AdminItemList";
import { adminPerms } from "@/lib/actions/admin-perms";
import { requireSession } from "@/lib/auth/server";
import { APPROVAL_CHASE_HOURS, formatPence } from "@/lib/core/admin";
import { getAdminItems } from "@/lib/db/admin-queries";
import { ROLE_LABELS } from "@/lib/labels";

export const dynamic = "force-dynamic";

/**
 * Everything waiting on a decision, and who it is waiting for.
 *
 * Grouped by whose move it is rather than by category, because the question
 * this screen answers is "what is stuck on me" — and an approval queue sorted
 * by subject is a report.
 */
export default async function AdminRequestsPage() {
  const session = await requireSession();
  const all = await getAdminItems({ limit: 200 });
  const perms = adminPerms(session.activeRole);

  const requests = all.filter((i) => i.track === "request");
  const waiting = requests.filter(
    (i) => i.awaiting !== null && !["completed", "cancelled", "rejected"].includes(i.state),
  );
  const mine = waiting.filter((i) => i.awaiting!.requiredRoles.includes(session.activeRole));
  const others = waiting.filter((i) => !i.awaiting!.requiredRoles.includes(session.activeRole));
  const decided = requests.filter((i) => ["approved", "completed", "rejected"].includes(i.state));

  const valueWaiting = waiting.reduce((s, i) => s + (i.amountPence ?? 0), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Requests & approvals"
        description="A request needs deciding before it can be done. The requester is never the approver, nobody decides a request about themselves, and one person may satisfy at most one rung of a chain — all three enforced in the database, not just here."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Waiting on you"
          value={mine.length}
          detail={`As ${ROLE_LABELS[session.activeRole]}`}
          severity={mine.length > 0 ? "warning" : "good"}
          hero={mine.length > 0}
        />
        <StatTile
          label="Waiting on someone else"
          value={others.length}
          detail="Not yours to sign"
        />
        <StatTile
          label="Value outstanding"
          value={formatPence(valueWaiting)}
          detail="Across everything undecided"
        />
        <StatTile
          label="Decided"
          value={decided.length}
          detail="Approved, completed or rejected"
        />
      </div>

      <Card
        title={`Waiting on you as ${ROLE_LABELS[session.activeRole]}`}
        subtitle="Approve the step, or reject it with your reason. An approval over the high threshold has to carry its grounds — the field is required by the server, not just by the form."
      >
        <AdminItemList
          items={mine}
          perms={perms}
          empty="Nothing is waiting on your signature."
        />
      </Card>

      <Card
        title="Waiting on someone else"
        subtitle="Shown so you can see where a request has got to, rather than ringing round to find out. The buttons are disabled with the reason."
      >
        <AdminItemList items={others} perms={perms} empty="Nothing outstanding anywhere." />
      </Card>

      <Card
        title="Chasing an unanswered approval"
        subtitle="An approval nobody answers is the commonest way an Admin workflow dies, so it is chased on its own clock — separate from the work's, because the work cannot start and the delay is not the requester's fault."
      >
        <ol className="space-y-1.5 text-[12px]">
          {APPROVAL_CHASE_HOURS.map((h, i) => (
            <li key={h}>
              <span style={{ color: "var(--text-muted)" }}>+{h}h → </span>
              {i === APPROVAL_CHASE_HOURS.length - 1
                ? `it goes in front of ${ROLE_LABELS.top_management}`
                : "the named approver is reminded"}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Nothing on this ladder approves anything. The last step puts the request in front of higher
          management; it does not decide on their behalf. The database refuses to mark a request approved
          while any rung is still outstanding, which is what makes that a fact rather than an intention.
        </p>
      </Card>

      <Card
        title="Decided"
        subtitle="Kept visible with the whole chain on each one. The useful question a fortnight later is not whether something was approved but who approved it, on what grounds, and whether that was the right person."
      >
        <AdminItemList items={decided.slice(0, 25)} perms={perms} empty="Nothing decided yet." />
      </Card>
    </div>
  );
}
