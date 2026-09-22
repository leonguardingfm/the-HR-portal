# 03 — Release plan

Ordered by dependency, not by enthusiasm. Each release is usable on its own and nothing is built
twice.

## The sequencing principle

**Build the engines once, at the start.** They are 80% of the platform's value and every domain
depends on them. Building a domain before its engine exists means building the engine badly, inside
that domain, and then again in the next one. That is exactly how systems end up with four reminder
implementations.

Then: **HR first, operations second.** Not because HR matters more, but because
recruitment and vetting are already fully specified ([`docs/proposal`](../proposal/README.md)),
carry no operational risk if they wobble, and produce the officer records that scheduling needs. An
empty rota is not worth building.

## R0 — Foundation *(current)*

The nine engines in [document 02](02-shared-engines.md), the domain map, navigation, access model,
and a review-ready front end running on demonstration data.

| Built | State |
|-------|-------|
| Domain map and single-source-of-truth register | Done, and rendered in the app under Admin so it can be checked rather than trusted |
| Identity, Places, Assignment, Forms, Documents, Work, Scheduler, Events, Access — types and rules | Done as typed modules with the real logic |
| The database schema for all of it, with its constraints tested | Done — see `prisma/`. Not yet wired to the application |
| BS 7858 rule layer, Leon's policy layer, service levels | Done and in use |
| Sign-in with name + active role | Done |
| Command centre dashboard spanning all departments | Done |
| Live operations board — book-ons, check calls, welfare | Done against demonstration data |
| Compliance expiry register | Done against demonstration data |
| Scheduling — rota and shift-change history | Done against demonstration data |
| Every other module | Honest placeholder: what it will hold, which engine it uses, which release |

**Exit condition:** the process and the domain boundaries are signed off, and E1–E3 in
[document 04](04-decisions-needed.md) are answered.

## R1 — HR, for real *(started)*

A database, real authentication and the recruitment and vetting domains in live use.

**Done:** the schema (`prisma/schema.prisma`) for the engines and every domain, with the rules that
cannot be expressed in it written as database constraints (`prisma/constraints.sql`) and tested —
separation of duties on a screening file, no double-booked officer, an append-only event log, no
retained copy where the document type forbids one, and the standard's four-week extension limit.
Eighty-one assertions prove each one rejects what it should — including the ones that must
*succeed*, because a constraint that rejects everything is not a constraint, it is an outage.

**Also done:** the application reads the database. Dashboard, Live board, Scheduling and Compliance
are server-rendered from PostgreSQL through `lib/db/queries.ts`, which returns the same domain types
the rule modules already take — so `evaluateDeployability`, `checkCallStatus` and the BS 7858 gates
run unchanged against database rows. The retention queue is derived from when each application was
withdrawn and each employment ceased, rather than maintained as a list.

**Also done:** sessions, permissions and writes. A signed http-only cookie carries who you are
and the role you are working as; the proxy gate turns away every unauthenticated request before it
reaches a query; and every write goes through a server action that checks the role **on the
server** before it touches the database, then writes the event in the same transaction.
Presence is now a record — a work session opened at sign-in, closed at sign-out, moved when the
role changes — so "who is doing what right now" is a query.

**Also done:** the departmental navigation and the Admin department. The sidebar is grouped by the
department responsible, with collapsible headings remembered per person; system configuration moved
from `/admin` to `/system` so the Admin department could take that path. The Admin department itself
is on the database end to end — six categories, the two-track workflow, the approval ladder with its
three enforcement layers, and twelve KPIs computed from the items and the event log. It needed no new
engine, which is the clearest evidence so far that document 02 was right. See
[06](06-admin-department.md).

**Also done:** delegated roles (E15). A role can be lent to a named person for a named period, with
an end date that cannot be left off and a 90-day ceiling — `RoleDelegation`, the rules in
`lib/auth/delegation.ts`, the screen on `/system`. The property that made it worth building properly:
a delegation relaxes no separation rule, so somebody holding higher management in their own right and
Finance Officer by delegation can sign the Finance rung of a large payment and still cannot sign the
higher-management rung after it. Roles are resolved at the moment of acting rather than from the
session cookie, because a delegation can start or expire in the middle of a working day.

**Remaining:**

- The HR screens (requirements, candidates, vetting, onboarding) and Insight on the database.
- Company sign-on itself. The seam is built and the development sign-in refuses to run in
  production; what is left is the identity provider and mapping its subject onto `User.ssoSubject`.
- The rest of the writes: candidates, onboarding, tasks.
- Requirements → candidates → interviews → offer → onboarding, with the duplicate check at entry.
- BS 7858 screening files: checks, evidence, the 12-week clock, the three gates, controller reviews.
- The document engine with per-candidate checklists validated at upload.
- The chaser ladders, so no reminder is anyone's job to remember.
- Retention and disposal running (clause 11).

**Unlocks:** the four overlapping spreadsheets stop being maintained. Screening deadlines become
impossible to miss quietly.

## R2 — Operations spine

Assignments, the rota, shift changes, availability and absence.

- The rota fills **posts**, and an assignment cannot be published for a person who is not deployable.
  This is the release where compliance stops being advisory.
- Shift changes keep their history, with reason and author.
- Availability, absence, repeating shift patterns, clash detection and last-minute cover.

**Needs first:** E2 (availability and the outage fallback), and a discovery session with Control
about how they actually work rather than how the process document says they do. Rostering is the part
that looks simple in a specification and is not.

## R3 — Live operations

Book-ons, check calls, welfare checks, incidents, and the live site board.

- Book-on windows, late and no-show detection, and escalation that reaches a human.
- Hourly check calls generated from assignments, escalating at the hour per the confirmed process,
  and ending with a member of the operational team attending site.
- Welfare checks as a form on a timer.
- The board Control watches: every post, its state, and what needs a phone call now.

**This is the release with real-time consequences.** It needs an agreed uptime position and a
fallback for book-ons during an outage (E2). How officers interact with it is settled: their own
phones, plus the site phone where a post has one (E3).

**Messaging joins this release** (domain 13, from E5). It belongs here rather than later because it
is operational contact, and because `ContactChannel.app` already exists in the escalation ladder —
an officer's message can be the check-call evidence, rated above SMS, instead of a second system
beside it. Two things have to be true before it is built: the answers to E16 (does it replace the
WhatsApp groups, is a message a check call, what is the helpdesk, how long are messages kept), and a
decision on offline behaviour from E10. If any site has no signal, messages and book-ons both have to
queue and send later, and that is a materially different build.

The rule it must not break: an unanswered message is not a welfare check. The ladder still ends with
a person attending site.

## R4 — Quality and clients

Inspections, operational reports, corrective actions, client feedback and satisfaction.

- Inspection and report forms as definitions, so a client-specific sheet is configuration.
- Findings raise corrective-action tasks automatically, with an owner and a due date.
- Feedback captured as typed scores, so satisfaction trends without anyone compiling it.

**Nearly free by now:** it is the Forms, Work and Events engines with new definitions.

**The client portal joins this release** (domain 14, from E7), because it is mostly a view over what
R4 produces. It owns nothing — a scoped view over Places, Assignment, Live operations and Quality —
so the work is almost entirely in the scoping, not in the screens.

**It cannot start before the E6 data-protection review and E17.** Showing a third party a named
individual's data needs a lawful basis, and "their own sites, systems, inspections and everything"
needs a line drawn around "everything" first. The recommendation on the record: name and SIA number
where the contract requires it, nothing else — never screening contents, never the person record,
never another client's anything. A client raises a *request*; Control turns it into a requirement, so
the pool check and the timestamped handover to HR are not bypassed.

## R5 — Equipment, and the KPI layer completed

- Uniform measurements, issues and returns; radios, keys, PPE; who holds what.
- Department KPI sets finished across all fifteen domains.

**The KPIs are cheap here precisely because nothing counted anything of its own** — R5 is writing
queries over an event log that has been filling since R1.

## Not being built

Saying this now is cheaper than saying it later.

| Not building | Instead |
|--------------|---------|
| Payroll calculation, payslips, RTI | Export approved hours to payroll software |
| Invoicing, ledger, credit control | Export billable hours to accounts |
| CRM, tenders, quoting | Out of scope entirely |
| Course delivery / e-learning | Track that a certificate exists and when it expires |
| Access control, CCTV, alarm integration | Not until a client contract requires it and pays for it |
| A native mobile app | Build the web app mobile-first; officers need book-on and check-in, which the browser does. Revisit only if offline proves to need it |
| An AI chat layer over the data | Not until the data is real and trusted. It would only make invented numbers sound authoritative |

## A note on pace

R0 and R1 are well-defined and low-risk: the process is understood and the rules are written down.
**R2 and R3 are where the uncertainty is** — rostering is a genuinely hard problem, and live
operations carries the reliability burden. They should be estimated after the Control discovery
session, not before, and nothing in R1 should be designed on the assumption that those estimates
will be small.
