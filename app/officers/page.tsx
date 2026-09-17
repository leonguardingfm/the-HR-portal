import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import { CONTROL_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { officers } from "@/lib/mock/data";
import { EXPIRY_WARNING_DAYS } from "@/lib/sla";
import type { Severity } from "@/lib/types";

function expirySeverity(expiry: string): Severity {
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "critical";
  if (days <= EXPIRY_WARNING_DAYS[2]) return "critical";
  if (days <= EXPIRY_WARNING_DAYS[1]) return "serious";
  if (days <= EXPIRY_WARNING_DAYS[0]) return "warning";
  return "good";
}

export default function OfficersPage() {
  const rows = [...officers].sort(
    (a, b) =>
      new Date(a.siaLicenceExpiry).getTime() - new Date(b.siaLicenceExpiry).getTime(),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Officers"
        description="The existing pool. Control's first action on any requirement is to check here, so it has to be searchable and trustworthy."
      />

      <Card
        title="Officer pool"
        subtitle="Sorted by licence expiry — an officer whose SIA licence lapses is not deployable."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Name as per SIA badge</th>
                <th className="pb-2 pr-3 font-medium">PIN</th>
                <th className="pb-2 pr-3 font-medium">Control</th>
                <th className="pb-2 pr-3 font-medium">Licence expiry</th>
                <th className="pb-2 pr-3 font-medium">Employment</th>
                <th className="pb-2 font-medium">Availability</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <td className="py-2.5 pr-3 text-[13px] font-medium">{o.siaBadgeName}</td>
                  <td className="tnum py-2.5 pr-3 text-[12px] tabular-nums">{o.pin}</td>
                  <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {CONTROL_LABELS[o.control].name}
                  </td>
                  <td className="py-2.5 pr-3">
                    <StatusPill
                      severity={expirySeverity(o.siaLicenceExpiry)}
                      label={formatDate(o.siaLicenceExpiry)}
                    />
                  </td>
                  <td className="py-2.5 pr-3">
                    <Tag>
                      {o.employmentState === "conditional"
                        ? "Conditional — screening incomplete"
                        : o.employmentState === "confirmed"
                          ? "Confirmed"
                          : "Suspended"}
                    </Tag>
                  </td>
                  <td className="py-2.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {o.available ? "Available" : "Deployed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Deployability is derived from the screening file and is never set by
          hand. An officer whose clock expires without screening completing is
          flagged here, and Control is notified — because Control is who would
          otherwise roster them.
        </p>
      </Card>

      <ModuleOutline
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
            label: "Right-to-work follow-up dates",
            detail: "Outside BS 7858's scope but a separate legal obligation, so it is tracked as its own check with its own expiry.",
            phase: 1,
          },
          {
            label: "Retrospective screening backlog",
            detail: "Where BS 7858 screening cannot be demonstrated for an officer already in relevant employment, the file is carried here as tracked work rather than assumed complete.",
            clause: "7.1, 10",
            phase: 1,
          },
          {
            label: "Subcontractor and agency assurance",
            detail: "Certification evidence plus a written statement that the specific individuals supplied were screened, with expiry dates monitored.",
            clause: "8",
            phase: 3,
          },
        ]}
      />
    </div>
  );
}
