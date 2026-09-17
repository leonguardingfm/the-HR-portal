import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { RequirementBoard } from "@/components/dashboard/RequirementBoard";

export default function RequirementsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Requirements"
        description="Client staffing requirements, the officer pool check, and the timestamped handover from Control to HR that replaces the Sourcing Sheet."
      />
      <RequirementBoard />
      <ModuleOutline
        items={[
          {
            label: "Raise a requirement",
            detail: "Client, site, control, post, headcount, shift pattern, start date — and the screening period required by that client's contract, which is what the whole deadline engine depends on.",
            phase: 1,
          },
          {
            label: "Officer pool check",
            detail: "Search existing officers for suitable and available cover, and record the outcome. Every requirement covered internally is a recruitment cycle avoided.",
            phase: 1,
          },
          {
            label: "Release to sourcing",
            detail: "The formal Control to HR handover, timestamped — which is how we later report honestly on whether a delay sat with Control or with HR.",
            phase: 1,
          },
          {
            label: "Partial fill tracking",
            detail: "Headcount tracked as required, allocated and remaining, so a requirement for three officers is not either open or closed.",
            phase: 1,
          },
          {
            label: "Export in the legacy Sourcing Sheet layout",
            detail: "One click, exact column order — so the spreadsheet can be retired without anyone losing the view they are used to.",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
