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
import { canGrantRole, isScreeningRole, ROLE_OPTIONS } from "@/lib/roles";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { users } from "@/lib/mock/data";
import { Delegations } from "@/components/admin/Delegations";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import { db } from "@/lib/db/client";
import { getActiveDelegations, getPastDelegations } from "@/lib/db/roles";
import type { Role } from "@/lib/types";

/**
 * System.
 *
 * Portal configuration — users and roles, our own service levels, retention
 * and the audit log. It moved here from /admin when the Admin department took
 * that path: configuring the portal and running the administration department
 * are different jobs done by different people, and one URL for both was going
 * to send Admin Officers to the wrong screen every time.
 *
 * The distinction shown here matters: rules from the standard are displayed as
 * fixed, while our own service levels are editable. A local preference should
 * never be mistaken for a regulatory requirement.
 */
export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const session = await requireSession();
  const [active, past, userRows] = await Promise.all([
    getActiveDelegations(),
    getPastDelegations(),
    db.user.findMany({
      where: { active: true },
      orderBy: { displayName: "asc" },
      include: { roles: { where: { revokedAt: null } } },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users, roles & rules"
        description="People and roles, clients and sites, templates, service levels, retention, and the audit log. Role assignment is set up here rather than fixed in the build, so new starters and internal transfers are an edit."
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Card
          title="Fixed by BS 7858:2019"
          subtitle="Not editable. These come from the standard, not from local preference."
        >
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {[
              ["Full screening deadline", "12 weeks — we screen to 5 years (16 weeks would apply to a 10-year period)", "7.6"],
              ["Maximum extension", `${MAX_EXTENSION_WEEKS} weeks, once, approved by higher management, with evidence of written requests`, "7.6"],
              ["Minimum screening period", "5 years, or back to age 16", "3.13"],
              ["Limited screening history", "At least the 3 years before application", "7.5.2a"],
              ["Maximum unverified gap", "31 days", "7.7"],
              ["Statutory declaration cover", "One period of up to 6 months, prior documented approval", "7.7i"],
              ["Risk acceptance threshold", "CCJs over £10,000, bankruptcy, or a directorship", "7.4f"],
              ["Retention — unsuccessful applicants", `${RETENTION.unsuccessfulApplicantMonths} months, then secure disposal, recorded in the disposal log`, "11.1"],
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
              ["Interview stages", `First (Recruitment, by phone), second (HR Manager, on site or video), and an additional stage only where a client asks for one. All required stages must be held before any offer (7.3.4)`],
              ["Role assignment", `Set per person in Admin, not fixed in the build — ${ROLE_OPTIONS.length} roles to choose from, and people may hold more than one`],
              ["Contract condition", "Confirmation depends on screening completing within the permitted period, and conditional employment ends if it does not (7.5.2)"],
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
        title="People and roles"
        subtitle="Who holds which role, and whether they may. Set up here — nothing about team size or composition is fixed in the build, so a new starter or an internal transfer is an edit rather than a release."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Name</th>
                <th className="pb-2 pr-3 font-medium">Roles held</th>
                <th className="pb-2 pr-3 font-medium">Own screening</th>
                <th className="pb-2 pr-3 font-medium">NDA</th>
                <th className="pb-2 pr-3 font-medium">Training reviewed</th>
                <th className="pb-2 font-medium">Grant check</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                // Screening roles carry the 6.1 and 6.2 obligations; the check
                // is computed from the evidence on file, not asserted.
                const screeningRoles = user.roles.filter(isScreeningRole);
                const failures = screeningRoles
                  .map((role) => ({
                    role,
                    result: canGrantRole({
                      role,
                      ownScreeningComplete: user.ownScreeningComplete,
                      confidentialityAgreementOnFile: user.confidentialityAgreementOnFile,
                      trainingReviewedAt: user.trainingReviewedAt,
                    }),
                  }))
                  .filter((r) => !r.result.permitted);

                return (
                  <tr key={user.id} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                    <td className="py-2.5 pr-3 text-[13px] font-medium">{user.name}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((r) => (
                          <Tag key={r}>{ROLE_LABELS[r]}</Tag>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {user.ownScreeningComplete ? "Complete" : "Outstanding"}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {user.confidentialityAgreementOnFile ? "On file" : "Missing"}
                    </td>
                    <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {formatDate(user.trainingReviewedAt)}
                    </td>
                    <td className="py-2.5">
                      {screeningRoles.length === 0 ? (
                        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          Not a screening role
                        </span>
                      ) : (
                        <StatusPill
                          severity={failures.length === 0 ? "good" : "critical"}
                          label={
                            failures.length === 0
                              ? "6.1 and 6.2 satisfied"
                              : failures[0].result.reason ?? "Blocked"
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A screening role cannot be granted until the person is screened
          themselves, has a confidentiality agreement on file and holds training
          that is in date <ClauseRef clause="6.1" /> <ClauseRef clause="6.2" />.
          The portal blocks the grant rather than trusting it to be remembered,
          and the grant lapses when the annual review does.
        </p>
      </Card>

      <Card
        title="Assignment rules"
        subtitle="Applied to whoever holds the roles, so they hold at any team size."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {[
            ["Nobody screens themselves", "Neither the administrator nor the controller on a file may be its subject.", "6.1"],
            ["Four eyes on sign-off", "The controller who reviews a file may not be the administrator who built it.", "7.5.2b"],
            ["Controllers are screened by higher management", "Where the subject of a file is themselves a screening controller, the file is administered by higher management — which is also the only way to satisfy the two rules above without going outside the company.", "6.1"],
            ["Division of functions", "Whoever signs off a file should not be someone who interviewed the candidate. Warned and recorded rather than blocked, because the standard asks for attention to it rather than forbidding it.", "6.1"],
          ].map(([label, detail, clause]) => (
            <li key={label} className="py-2.5">
              <p className="text-[13px] font-medium">
                {label} <ClauseRef clause={clause} />
              </p>
              <p className="mt-0.5 max-w-3xl text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                {detail}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Delegations
        active={active}
        past={past}
        users={userRows.map((u) => ({
          id: u.id,
          name: u.displayName,
          roles: u.roles.map((r) => r.role as Role),
        }))}
        denied={deniedReason(session.activeRole, "role.delegate")}
      />

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
