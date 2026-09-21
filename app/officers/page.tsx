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
        description="The officer pool and the compliance record behind it. Control's first action on any requirement is to check here, so it has to be searchable and trustworthy. Scheduling reads deployability from this record — see Compliance."
      />

      <Card
        title="Officer pool"
        subtitle="Sorted by licence expiry — an officer whose SIA licence lapses is not deployable."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[54rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Name as per SIA badge</th>
                <th className="pb-2 pr-3 font-medium">PIN</th>
                <th className="pb-2 pr-3 font-medium">Control</th>
                <th className="pb-2 pr-3 font-medium">Licence expiry</th>
                <th className="pb-2 pr-3 font-medium">Right to work</th>
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
                    {o.rightToWorkExpiry ? (
                      <StatusPill
                        severity={expirySeverity(o.rightToWorkExpiry)}
                        label={formatDate(o.rightToWorkExpiry)}
                      />
                    ) : (
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        Not time-limited
                      </span>
                    )}
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
          otherwise roster them. The same applies to right to work: once the
          recorded expiry passes, no further shifts can be assigned until
          updated evidence has been provided and verified.
        </p>
      </Card>

      <ModuleOutline
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
          {
            label: "Handover to operations",
            detail: "At onboarding the officer becomes rosterable: the PIN is allocated, the record is complete, and Scheduling can publish assignments for them once deployability clears. No retyping, because it is the same record.",
            phase: 3,
          },
        ]}
      />
    </div>
  );
}
