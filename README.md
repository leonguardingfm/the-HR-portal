# The HR Portal

A portal to monitor, manage and track the HR department of a security company, covering its two
sections — **Recruitment** and **Vetting** — with BS 7858:2019 screening built into the workflow
rather than bolted on afterwards.

## Status

The **proposal is written**, the **eight blocking questions are answered** (September 2026, logged
in [document 07](docs/proposal/07-open-questions.md)), and the **application scaffold is in
place**: folder structure, role-aware navigation, and the landing dashboard. The compliance rules
that drive the whole system — the screening clock, the three gates, separation of duties,
retention — are implemented as real logic. Data is still demonstration data; the database lands in
Phase 1.

Confirmed process: **we screen to five years**, vetting is **in-house**, and officers reach a
client site only after initial screening — the one element that runs afterwards is **five-year
career-history verification**, inside the 12 weeks the standard allows. Interviews run in up to
three stages (first by Recruitment, second by the HR Manager, plus an additional stage where a
client requires one), and Gate 1 enforces every stage that client needs.

The systems around it: **Casper** holds the application, the **Watch List is the SIA website**
checked twice daily, and **Maps is Google Maps** used by Control for deployment. **INDEL** is the
current system of record for officers, and the portal is confirmed as **replacing** it rather than
integrating with it — which roughly doubles the scope and is set out in
[document 08](docs/proposal/08-officer-system-of-record.md).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

**Sign in with your name and the role you are working as.** People hold more than one role and
move between teams, so a job title cannot answer "who is doing the vetting today" — a role chosen
at sign-in can, and the dashboard shows it in real time. The active role can be changed without
signing out. This records intent; it does not verify identity. Real authentication comes with the
Phase 1 backend, where identity is from company sign-on and the active role is recorded against
every action in the audit log.

**No names or team sizes are compiled into the build.** Who holds which role is set up in Admin, so
a new starter or an internal transfer is an edit rather than a release. The separation-of-duty
rules are expressed as conditions on whoever is assigned, so they hold at any team size.

## What is real and what is a stub

| Real logic | Where |
|-----------|-------|
| 12-week screening clock (16 if a 10-year period is ever required), extension cap, severity thresholds | `lib/bs7858.ts` — `clockState`, `weeksAllowed` |
| Gate 1 (conditional offer) and Gate 3 (confirmed employment), with plain-English blocking reasons | `lib/bs7858.ts` — `evaluateGate1`, `evaluateGate2` |
| Gate 2 (deployment to site) — our own policy, stricter than the standard | `lib/policy.ts` — `evaluateDeploymentGate` |
| Separation of duties: no self-screening, controller ≠ administrator, controllers screened by higher management | `lib/roles.ts` — `validateFileAssignment` |
| A screening role cannot be granted without own screening, NDA and in-date training (6.1, 6.2) | `lib/roles.ts` — `canGrantRole` |
| Interview before any offer (7.3.4), for every stage the client requires | `lib/bs7858.ts` — `evaluateGate1` |
| Division of functions: warns if a controller signs off a candidate they interviewed | `lib/policy.ts` — `reviewIndependence` |
| Sign-in with name and active role, and who is working on what | `components/layout/SessionContext.tsx`, `components/dashboard/ActiveNow.tsx` |
| Retention periods, risk-acceptance threshold, gap limits | `lib/bs7858.ts` |
| Service levels, chaser ladders, task severity | `lib/sla.ts` — ours and configurable, deliberately separate from the standard's rules |
| Company policy that exceeds the standard | `lib/policy.ts` — the deployment gate, the pre/post-deployment split, the contract condition |
| Role-based navigation | `components/layout/nav.ts` |

| Stub | Note |
|------|------|
| All records | `lib/mock/data.ts`, replaced by Prisma queries in Phase 1. No component reads anything but its exported selectors. |
| Module screens beyond the dashboard | Each shows its planned contents and delivery phase rather than a blank page. |

## Structure

```
app/                     Routes, one per navigation area
  page.tsx               Landing dashboard
  requirements/          Control's requirements and the handover to HR
  officers/              Existing officer pool, deployability, licence expiry
  candidates/            The single candidate record and the pipeline
  vetting/               BS 7858 screening files, checks, gates, the clock
  onboarding/            The post-offer admin checklist
  tasks/                 My Tasks work queue
  reports/               KPIs, delay analysis, audit extracts
  admin/                 Roles, service levels, retention, audit log
components/
  layout/                Shell, sidebar, top bar, role context, nav config
  ui/                    Card, StatTile, Meter, StatusPill, PageHeader, ModuleOutline
  charts/                Funnel, stage-vs-SLA, workload — inline, no chart library
  dashboard/             The dashboard sections
lib/
  bs7858.ts              The compliance core: clock, gates, separation of duties, retention
  roles.ts               Role options and the assignment rules — no names, works at any team size
  policy.ts              Company policy stricter than the standard (the deployment gate)
  sla.ts                 Our own service levels and chaser rhythms
  types.ts               Domain model
  labels.ts              Human labels and the reserved status-palette mapping
  mock/data.ts           Demonstration data
docs/proposal/           The agreed design — read this first
```

## Design notes

**Two status tracks, never merged.** Recruitment progress and vetting completion are separate
columns everywhere, because they answer different questions and are owned by different people.
They are linked only by the gates.

**Three gates, one of them ours.** Gate 1 is BS 7858's conditional-employment minimum. Gate 2 is
our own, stricter, rule: nobody reaches a client site until the criminality element and right to
work are also done. Gate 3 is confirmed employment, once the five-year history is verified. Gate 2
lives in `lib/policy.ts` rather than `lib/bs7858.ts` precisely so nobody can drop it later on the
grounds that the standard does not require it.

**Rules from the standard are separated from our own preferences.** `lib/bs7858.ts` holds what
BS 7858 fixes, each with its clause reference; `lib/sla.ts` and `lib/policy.ts` hold what we chose
and can change. The Admin screen shows the same split, so a local preference is never mistaken for
a regulatory requirement — and vice versa.

**Charts** are built inline rather than with a charting library: thin marks capped at 14px, 4px
rounded data-ends, hairline gridlines, a 2px surface gap between stacked segments, a legend
whenever there are two or more series, and a hover tooltip on every mark. Colours come from a
validated palette — categorical hues assigned in fixed order and never cycled, and status colours
(good / watch / at risk / critical) reserved and always paired with a glyph and a text label, so
colour is never the only channel. Light and dark are each validated against their own surface.

## Start here

**[`docs/proposal/README.md`](docs/proposal/README.md)** — the process review and design proposal.

| Document | Covers |
|----------|--------|
| [01 Process and compliance review](docs/proposal/01-process-and-compliance-review.md) | Current process mapped against BS 7858:2019, and the gaps found |
| [02 Portal structure](docs/proposal/02-portal-structure.md) | Modules, navigation, data model, recommended stack |
| [03 Stages, owners and deadlines](docs/proposal/03-workflow-stages-owners-slas.md) | Requirement → sourcing → onboarding → vetting, with SLAs |
| [04 Dashboard and KPIs](docs/proposal/04-management-dashboard-kpis.md) | What management sees, and what we measure |
| [05 Automation and integrations](docs/proposal/05-automation-and-integrations.md) | In-portal automation vs. Casper / Indeed / email integrations |
| [06 Access and permissions](docs/proposal/06-access-permissions.md) | Role matrix and separation-of-duty rules |
| [07 Open questions](docs/proposal/07-open-questions.md) | Decision log, and what is still open |
| [08 Officer system of record](docs/proposal/08-officer-system-of-record.md) | What replacing INDEL involves, and how to stage it |

## Note on the standard

BS 7858:2019 is a licensed BSI publication and is not redistributable. The proposal documents and
the code comments paraphrase its requirements and cite clause numbers rather than quoting it, and
the standard itself is deliberately not committed to this repository.
