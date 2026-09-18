import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import { CHASERS, EXPIRY_WARNING_DAYS } from "@/lib/sla";
import {
  CLOCK_THRESHOLDS,
  DEFAULT_SCREENING_PERIOD_YEARS,
  MAX_EXTENSION_WEEKS,
  RETENTION,
} from "@/lib/bs7858";
import {
  AUTHORISED_PERSON,
  FINAL_INTERVIEWER,
  INTERNAL_FILE_ASSIGNMENTS,
  VETTING_PAIR,
} from "@/lib/policy";

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
              ["Full screening deadline", "12 weeks — we screen to 5 years (16 weeks would apply to a 10-year period)", "7.6"],
              ["Maximum extension", `${MAX_EXTENSION_WEEKS} weeks, once, approved by ${AUTHORISED_PERSON}, with evidence of written requests`, "7.6"],
              ["Minimum screening period", "5 years, or back to age 16", "3.13"],
              ["Limited screening history", "At least the 3 years before application", "7.5.2a"],
              ["Maximum unverified gap", "31 days", "7.7"],
              ["Statutory declaration cover", "One period of up to 6 months, prior documented approval", "7.7i"],
              ["Risk acceptance threshold", "CCJs over £10,000, bankruptcy, or a directorship", "7.4f"],
              ["Retention — unsuccessful at preliminary", `${RETENTION.unsuccessfulAtPreliminaryMonths} months, then secure disposal`, "11.1"],
              ["Retention — after employment ends", `${RETENTION.afterCessationYears} years`, "11.3"],
              ["Training review", "At least annually", "6.2"],
            ].map(([label, value, clause]) => (
              <li key={label} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
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
              ["Default screening period", `${DEFAULT_SCREENING_PERIOD_YEARS} years — per client, so a contract or insurer needing longer is a setting rather than a code change`],
              ["Pre-deployment policy", `Criminality (7.7j) and right to work must be complete before an officer reaches site — stricter than the standard`],
              ["Vetting pair", `${VETTING_PAIR.join(" and ")}, alternating administrator and controller per file`],
              ["Final interview", `Held by ${FINAL_INTERVIEWER}, mandatory before any offer (7.3.4). An initial team interview is optional and does not substitute for it`],
            ].map(([label, value]) => (
              <li key={label} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0 flex-1">
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

      <Card
        title="Vetting team competence register"
        subtitle="Who screens the screeners. Screening staff must themselves be screened, may not screen themselves, and the controller reviewing a file may not be the administrator who built it."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Whose file</th>
                <th className="pb-2 pr-3 font-medium">Administrator</th>
                <th className="pb-2 pr-3 font-medium">Controller</th>
                <th className="pb-2 font-medium">Rule check</th>
              </tr>
            </thead>
            <tbody>
              {INTERNAL_FILE_ASSIGNMENTS.map((row) => {
                const noSelfScreening =
                  row.administrator !== row.subject && row.controller !== row.subject;
                const fourEyes = row.administrator !== row.controller;
                return (
                  <tr key={row.subject} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                    <td className="py-2.5 pr-3 text-[13px] font-medium">{row.subject}</td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {row.administrator}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {row.controller}
                    </td>
                    <td className="py-2.5">
                      <StatusPill
                        severity={noSelfScreening && fourEyes ? "good" : "critical"}
                        label={
                          noSelfScreening && fourEyes
                            ? "6.1 and 7.5.2b satisfied"
                            : "Conflict — reassign"
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {AUTHORISED_PERSON} administering the vetting team&rsquo;s own files is what makes this
          work: the controller then has to be someone who is neither the subject nor the
          administrator, which leaves the other half of the pair. Because it makes him a person
          engaged in screening, clause 6.2 training and a confidentiality agreement apply to him
          too — and his own file is administered by {VETTING_PAIR[1]} and controlled by{" "}
          {VETTING_PAIR[0]}. {FINAL_INTERVIEWER} also holds the final interview, so no controller
          ever signs off a candidate they interviewed.
        </p>
      </Card>

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
            detail: "Screening period set per client contract, which is what drives the deadline on every candidate for that client. Five years by default, so 12 weeks.",
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
