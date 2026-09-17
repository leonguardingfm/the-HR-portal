import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { TaskDigest } from "@/components/dashboard/TaskDigest";

export default function TasksPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="My Tasks"
        description="A flat work queue: what is mine, what is overdue, what is due today, and what is blocked waiting on someone else. The most useful screen for day-to-day HR."
      />
      <TaskDigest />
      <ModuleOutline
        note="The escalation rule is deliberately uniform rather than per-stage: amber at 80% of the service level, red once past it, escalated to the manager at twice it. One consistent rule is easier to trust than a dozen special cases."
        items={[
          {
            label: "One-click actions",
            detail: "Send the chaser, record the check, upload the evidence — from the queue, without opening three screens first.",
            phase: 1,
          },
          {
            label: "Filter to mine, my team, or everything",
            detail: "Managers need the team view for balancing work; everyone else needs their own list first.",
            phase: 1,
          },
          {
            label: "Blocked-and-waiting state",
            detail: "A task waiting on a third party — a DWP written request, a disclosure application — is not overdue work, and showing it as overdue trains people to ignore red.",
            phase: 1,
          },
          {
            label: "Daily morning digest",
            detail: "Each owner gets their own overdue and due-today items by email, so the queue does not depend on anyone remembering to open the portal.",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
