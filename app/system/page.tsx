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
import { Delegations } from "@/components/admin/Delegations";
import { PeopleRoles } from "@/components/system/PeopleRoles";
import { canDo } from "@/lib/auth/permissions";
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
  const [active, past, userRows, policy] = await Promise.all([
    getActiveDelegations(),
    getPastDelegations(),
    db.user.findMany({
      where: { active: true, status: "active" },
      orderBy: { displayName: "asc" },
      include: { roles: { where: { revokedAt: null } } },
    }),
    db.setting.findUnique({ where: { key: "security.require_2fa" } }),
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

      <PeopleRoles
        rows={userRows.map((u) => {
          const screening = u.roles.map((r) => r.role as Role).filter(isScreeningRole);
          const blocked = screening
            .map((role) => canGrantRole({ role, ownScreeningComplete: u.ownScreeningComplete, confidentialityAgreementOnFile: u.confidentialityAgreementOnFile, trainingReviewedAt: u.trainingReviewedAt?.toISOString() ?? null }))
            .find((r) => !r.permitted);
          return {
            id: u.id,
            name: u.displayName,
            username: u.username,
            roles: u.roles.map((r) => r.role as Role),
            lockedUntil: u.lockedUntil?.toISOString() ?? null,
            twoFactor: !!u.totpEnabledAt,
            lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
            screening: screening.length ? { own: u.ownScreeningComplete, nda: u.confidentialityAgreementOnFile, training: u.trainingReviewedAt?.toISOString() ?? null, blocked: blocked?.reason ?? null } : null,
          };
        })}
        meId={session.userId}
        can={{ grant: canDo(session.activeRole, "role.grant"), reset: canDo(session.activeRole, "account.reset"), policy: canDo(session.activeRole, "security.policy") }}
        policy={policy?.value ?? "off"}
      />

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
        ]}
      />
    </div>
  );
}
