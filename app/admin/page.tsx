import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClauseRef, Tag } from "@/components/ui/StatusPill";
import { CHASERS, EXPIRY_WARNING_DAYS } from "@/lib/sla";
import { CLOCK_THRESHOLDS, MAX_EXTENSION_WEEKS, RETENTION } from "@/lib/bs7858";

/**
 * Admin.
 *
 * The distinction shown here matters: rules from the standard are displayed as
 * fixed, while our own service levels are editable. A local preference should
 * never be mistaken for a regulatory requirement.
 */
export default function AdminPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin"
        description="Users and roles, clients and sites, templates, service levels, retention, the vetting team competence register, and the audit log."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card
          title="Fixed by BS 7858:2019"
          subtitle="Not editable. These come from the standard, not from local preference."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {[
              ["Full screening deadline", "12 weeks (5-year period) / 16 weeks (10-year)", "7.6"],
              ["Maximum extension", `${MAX_EXTENSION_WEEKS} weeks, once, with director approval and evidence of written requests`, "7.6"],
              ["Minimum screening period", "5 years, or back to age 16", "3.13"],
              ["Limited screening history", "At least the 3 years before application", "7.5.2a"],
              ["Maximum unverified gap", "31 days", "7.7"],
              ["Statutory declaration cover", "One period of up to 6 months, prior documented approval", "7.7i"],
              ["Risk acceptance threshold", "CCJs over £10,000, bankruptcy, or a directorship", "7.4f"],
              ["Retention — unsuccessful at preliminary", `${RETENTION.unsuccessfulAtPreliminaryMonths} months, then secure disposal`, "11.1"],
              ["Retention — after employment ends", `${RETENTION.afterCessationYears} years`, "11.3"],
              ["Training review", "At least annually", "6.2"],
            ].map(([label, value, clause]) => (
              <li key={label} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-[13px]">
                    {label} <ClauseRef clause={clause} />
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {value}
                  </p>
                </div>
                <Tag>Fixed</Tag>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Our service levels"
          subtitle="Editable here without a code change, once agreed."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {[
              ["Clock escalation", `Amber at ${CLOCK_THRESHOLDS.warning * 100}%, red at ${CLOCK_THRESHOLDS.serious * 100}%, critical at ${CLOCK_THRESHOLDS.critical * 100}% of the allowed period`],
              ["Application chasers", `Days ${CHASERS.application.days.join(" and ")}, escalate at ${CHASERS.application.escalateAfterDays}`],
              ["Document chasers", `Days ${CHASERS.documents.days.join(", ")} — maximum ${CHASERS.documents.maxAttempts} attempts, then escalate`],
              ["Signature chasers", `Days ${CHASERS.signatures.days.join(" and ")}, escalate at ${CHASERS.signatures.escalateAfterDays}`],
              ["Reference ladder", `2nd request day ${CHASERS.reference.secondRequestDay}, documentary route day ${CHASERS.reference.documentaryRouteDay}, escalate day ${CHASERS.reference.escalateDay}`],
              ["Task escalation", "Amber at 80% of the service level, red once past it, manager at twice it"],
              ["Expiry warnings", `${EXPIRY_WARNING_DAYS.join(", ")} days ahead`],
            ].map(([label, value]) => (
              <li key={label} className="flex flex-wrap items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-[13px]">{label}</p>
                  <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {value}
                  </p>
                </div>
                <Tag>Configurable</Tag>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ModuleOutline
        note="The vetting team competence register is easy to overlook and is explicitly required: screening staff must themselves be screened, must not screen themselves, must have signed confidentiality agreements, and their training must be reviewed at least annually."
        items={[
          {
            label: "Users, roles and separation of duties",
            detail: "Seven roles with the permission matrix from docs/proposal/06, enforced in the API layer rather than only in the interface.",
            clause: "6.1",
            phase: 1,
          },
          {
            label: "Vetting team competence register",
            detail: "Who is a controller, who is an administrator, their own screening status, NDA on file, training dates and next annual review. A role grant is blocked once the review lapses.",
            clause: "6.1, 6.2",
            phase: 1,
          },
          {
            label: "Clients, sites and screening periods",
            detail: "Screening period set per client contract, which is what drives the 12 or 16 week deadline on every candidate for that client.",
            clause: "7.6",
            phase: 1,
          },
          {
            label: "Email and letter templates",
            detail: "Every stage message merged from the record, so nobody retypes a name or a date, and every outbound message is stored against the candidate.",
            phase: 2,
          },
          {
            label: "Append-only audit log",
            detail: "Every read of a screening file as well as every write — proving that unauthorised access is prevented requires logging the reads.",
            clause: "7.2",
            phase: 1,
          },
          {
            label: "Retention and secure disposal",
            detail: "Retention clocks per record category, with a controller-approved disposal action and a record that disposal happened.",
            clause: "11",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
