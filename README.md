# Leon Guarding — Workforce & Operations Platform

One platform for how the business actually runs: officer and employee records, recruitment, the
complete BS 7858:2019 vetting process, scheduling and shift changes, book-ons and check calls,
compliance and expiry dates, uniform and equipment, departmental tasks, inspections, client
feedback, and live KPIs for every department.

The test it is built to pass:

> A manager should be able to answer any question about who is working, where, whether they are
> legally allowed to be there, whether they turned up, whether the client is happy, and what is
> overdue — from one screen, without asking anyone.

## The idea that keeps it from becoming a mess

The brief lists fourteen things to manage. Built literally, that is fourteen features that overlap
badly — six of them need reminders, five need a form filled in, four need documents with expiry
dates, and every one needs tasks and KPIs.

Built properly it is **nine shared engines and twelve thin domains on top of them**. Five form
definitions replace five separately built forms; one reminder engine replaces six sets of
reminders; one event log replaces every department's private counters. And one rule governs all of
it:

> **Every fact has exactly one owner.** A second place to record an officer's licence expiry is a
> second place for it to be wrong.

The engines, the domains and the ownership register are in
[`docs/platform/02`](docs/platform/02-shared-engines.md) — and rendered in the application itself at
**/platform**, from the same definitions the code reads, so the plan and the build cannot drift
apart.

## Status

**Release R0 — the foundation.** The engines are written as typed modules with their real logic; the
domain map, the grouped navigation and the access model are in place; and four areas are built
against demonstration data rather than outlined:

- **Live board** (`/live`) — every post on now, attendance and contact tracked as separate columns,
  the escalation ladder, and a "needs a call now" queue ordered by severity.
- **Scheduling** (`/scheduling`) — the rota as a projection of assignments, the compliance block on
  publication, and shift changes that keep their reason and author.
- **Compliance** (`/compliance`) — every document with a date on it, and who it stops. Deployability
  is derived on demand, so it cannot go stale.
- **Platform map** (`/platform`) — the domains, the engines and the single-source-of-truth register.

Plus the HR modules from the earlier phase: requirements, candidates, vetting, onboarding, tasks,
insight and admin. Modules that are planned rather than built say so and show what they will sit on.

**All data in the application is demonstration data.** No integration is connected. The database,
real authentication and the first live use arrive in R1 — see
[`docs/platform/03`](docs/platform/03-release-plan.md).

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
```

**Sign in with your name and the role you are working as.** People hold more than one role and move
between teams, so a job title cannot answer "who is doing the vetting today" — a role chosen at
sign-in can, and it is recorded against every event. The active role can be changed without signing
out. This records intent; it does not verify identity. Real authentication comes with R1, where
identity is from company sign-on and permissions are enforced server-side.

**No names or team sizes are compiled into the build.** Who holds which role is set up in Admin, so
a new starter or an internal transfer is an edit rather than a release. The separation-of-duty rules
are expressed as conditions on whoever is assigned, so they hold at any team size.

## What is real logic and what is a stub

| Real logic | Where |
|-----------|-------|
| 12-week screening clock (16 for a 10-year period), extension cap, severity thresholds | `lib/bs7858.ts` — `clockState`, `weeksAllowed` |
| Gate 1 (conditional offer) and Gate 3 (confirmed employment), with plain-English blocking reasons | `lib/bs7858.ts` — `evaluateGate1`, `evaluateGate2` |
| Gate 2 (deployment to site) — our own policy, stricter than the standard | `lib/policy.ts` — `evaluateDeploymentGate` |
| **Deployability, derived from the screening file and the expiry dates** | `lib/core/deployability.ts` — `evaluateDeployability`, `canPublishAssignment` |
| **Book-on windows, late and no-show detection** | `lib/core/ops.ts` — `attendance` |
| **Check-call state and the escalation ladder, with a shorter tolerance when lone working** | `lib/core/ops.ts` — `checkCallStatus`, `ESCALATION_LADDER` |
| Separation of duties: no self-screening, controller ≠ administrator, controllers screened by higher management | `lib/roles.ts` — `validateFileAssignment` |
| A screening role cannot be granted without own screening, NDA and in-date training (6.1, 6.2) | `lib/roles.ts` — `canGrantRole` |
| Interview before any offer (7.3.4), for every stage the client requires | `lib/bs7858.ts` — `evaluateGate1` |
| Division of functions: warns if a controller signs off a candidate they interviewed | `lib/policy.ts` — `reviewIndependence` |
| Retention periods, risk-acceptance threshold, gap limits | `lib/bs7858.ts`, `lib/core/documents.ts` |
| Expiry warnings at 90 / 60 / 30 days, one engine for every document type | `lib/core/documents.ts`, `lib/sla.ts` |
| Service levels, chaser ladders, task severity | `lib/sla.ts` — ours and configurable, deliberately separate from the standard's rules |
| **The platform map, the engine list and the ownership register** | `lib/core/domains.ts` — rendered at `/platform` |
| Sign-in with name and active role, and who is working on what | `components/layout/SessionContext.tsx`, `components/dashboard/ActiveNow.tsx` |
| Role-based, department-grouped navigation | `components/layout/nav.ts` |

| Stub | Note |
|------|------|
| All records | `lib/mock/data.ts` and `lib/mock/ops.ts`, replaced by database queries in R1. No component reads anything but their exported selectors. |
| Presence of other users | A browser cannot see another person's session. The shape is what the R1 API will return; the current viewer's own row is real. |
| Department KPIs | Marked **asserted** on screen where the prototype has no event history behind them yet. The derivable ones are computed. |
| Quality, Clients, People, Equipment | Outlines, not mock-ups. A screen full of invented detail looks like progress and is not. |

## Structure

```
app/                     Routes, one per navigation area
  page.tsx               Role-aware dashboard
  live/                  Live board — book-ons, check calls, welfare, incidents
  scheduling/            The rota, shift changes, the publication block
  compliance/            Every document with a date on it, and who it stops
  platform/              The domain map and ownership register
  requirements/          Control's requirements and the handover to HR
  candidates/ vetting/ onboarding/   The HR pipeline and BS 7858 screening
  officers/ people/ equipment/ tasks/
  quality/ clients/      Planned — outline plus the engines they will sit on
  reports/ admin/
components/
  layout/                Shell, grouped sidebar, top bar, session, nav config
  ui/                    Card, StatTile, StatusPill, PageHeader, ModuleOutline, useNow
  charts/                Funnel, stage-vs-SLA, workload — inline, no chart library
  dashboard/ live/ scheduling/ compliance/ platform/
lib/
  core/                  The shared engines — domain-agnostic
    types.ts             Identity, Places, Assignment, Forms, Documents, Work, Events
    deployability.ts     The single choke point: may this person be put on a post
    ops.ts               Book-on windows, check calls, the escalation ladder
    documents.ts         Document type registry, retention rules, expiry
    forms.ts             Nine form definitions — the engine that replaces nine features
    domains.ts           The platform map, engines and ownership register, as data
  bs7858.ts              The standard. Fixed, clause-referenced, not configurable
  policy.ts              Leon's own stricter rules. Configurable, deliberately separate
  sla.ts                 Service levels and chaser rhythms
  roles.ts types.ts labels.ts format.ts
  mock/                  Demonstration data — data.ts (HR) and ops.ts (operational)
docs/platform/           The platform plan — read this first
docs/proposal/           The HR detail: process review, BS 7858 mapping, decisions
```

## Design notes

**Two status tracks, never merged.** Recruitment progress and vetting completion are separate
columns everywhere, because they answer different questions and are owned by different people. They
are linked only by the gates.

**Three gates, one of them ours.** Gate 1 is BS 7858's conditional-employment minimum. Gate 2 is our
own, stricter rule: nobody reaches a client site until the criminality element and right to work are
also done. Gate 3 is confirmed employment, once the five-year history is verified. Gate 2 lives in
`lib/policy.ts` rather than `lib/bs7858.ts` precisely so nobody can drop it later on the grounds
that the standard does not require it.

**Compliance is enforced in the path of the work, not in a compliance section.** An assignment
cannot be published for a person who is not deployable, and the rota uses the same function the
compliance register does — a rota that enforced something slightly different would be worse than one
that enforced nothing, because it would be trusted.

**Rules from the standard are separated from our own preferences.** `lib/bs7858.ts` holds what
BS 7858 fixes, each with its clause reference; `lib/sla.ts`, `lib/policy.ts` and `lib/core/ops.ts`
hold what we chose and can change. The Admin screen shows the same split, so a local preference is
never mistaken for a regulatory requirement — and vice versa.

**Attendance and contact are separate columns** on the live board, because they fail separately: an
officer can book on and then go quiet. And every contact record shows *how* it was made, because a
QR tag at the post and an SMS are not worth the same as evidence.

**Charts** are built inline rather than with a charting library: thin marks capped at 14px, 4px
rounded data-ends, hairline gridlines, a 2px surface gap between stacked segments, a legend whenever
there are two or more series, and a hover tooltip on every mark. Colours come from a validated
palette — categorical hues assigned in fixed order and never cycled, and status colours (good /
watch / at risk / critical) reserved and always paired with a glyph and a text label, so colour is
never the only channel. Light and dark are each validated against their own surface.

## Start here

**[`docs/platform/README.md`](docs/platform/README.md)** — the platform plan.

| Document | Covers |
|----------|--------|
| [Platform 01 Scope and domains](docs/platform/01-scope-and-domains.md) | The twelve domains, what each owns, the four scope edges, and the consequence for INDEL |
| [Platform 02 Shared engines](docs/platform/02-shared-engines.md) | The nine engines, what would have been built twice, and the single-source-of-truth register |
| [Platform 03 Release plan](docs/platform/03-release-plan.md) | What is built in which order, and what we are deliberately not building |
| [Platform 04 Decisions needed](docs/platform/04-decisions-needed.md) | The E-series questions this scope creates, and which releases they block |

**[`docs/proposal/README.md`](docs/proposal/README.md)** — the HR detail, unchanged and still
authoritative for recruitment and vetting. Documents 01–07 cover the process review, the BS 7858
mapping, stages and SLAs, the dashboard, automation, permissions and the decision log. Document 08
is superseded by Platform 01 §4.

## Note on the standard

BS 7858:2019 is a licensed BSI publication and is not redistributable. These documents and the code
comments paraphrase its requirements and cite clause numbers rather than quoting it, and the
standard itself is deliberately not committed to this repository.
