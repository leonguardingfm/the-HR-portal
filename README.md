# The HR Portal

A portal to monitor, manage and track the HR department of a security company, covering its two
sections — **Recruitment** and **Vetting** — with BS 7858:2019 screening built into the workflow
rather than bolted on afterwards.

## Status

The **proposal is written** and the **application scaffold is now in place**: folder structure,
role-aware navigation, and the landing dashboard. The compliance rules that drive the whole system
— the screening clock, the two gates, separation of duties, retention — are implemented as real
logic in `lib/bs7858.ts`. Data is still demonstration data; the database lands in Phase 1.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

Use the **Viewing as** control in the top bar to switch role and see how the navigation and
dashboard change. In production the role comes from SSO and is enforced server-side; the switcher
exists so the seven role views can be reviewed without seven logins.

## What is real and what is a stub

| Real logic | Where |
|-----------|-------|
| 12 / 16 week screening clock, extension cap, severity thresholds | `lib/bs7858.ts` — `clockState`, `weeksAllowed` |
| Gate 1 (conditional offer) and Gate 2 (confirmed employment), with plain-English blocking reasons | `lib/bs7858.ts` — `evaluateGate1`, `evaluateGate2` |
| Separation of duties: no self-screening, controller ≠ administrator | `lib/bs7858.ts` — `canSignOff` |
| Retention periods, risk-acceptance threshold, gap limits | `lib/bs7858.ts` |
| Service levels, chaser ladders, task severity | `lib/sla.ts` — ours and configurable, deliberately separate from the standard's rules |
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
  sla.ts                 Our own service levels and chaser rhythms
  types.ts               Domain model
  labels.ts              Human labels and the reserved status-palette mapping
  mock/data.ts           Demonstration data
docs/proposal/           The agreed design — read this first
```

## Design notes

**Two status tracks, never merged.** Recruitment progress and vetting completion are separate
columns everywhere, because they answer different questions and are owned by different people.
They are linked only by the two gates.

**Rules from the standard are separated from our own preferences.** `lib/bs7858.ts` holds what
BS 7858 fixes, each with its clause reference; `lib/sla.ts` holds what we chose and can change.
The Admin screen shows the same split, so a local preference is never mistaken for a regulatory
requirement.

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
| [07 Open questions](docs/proposal/07-open-questions.md) | What needs confirming before we build further |

## Note on the standard

BS 7858:2019 is a licensed BSI publication and is not redistributable. The proposal documents and
the code comments paraphrase its requirements and cite clause numbers rather than quoting it, and
the standard itself is deliberately not committed to this repository.
