# 02 — Shared engines

The brief lists fourteen things the system should manage. Built literally, that is fourteen features,
and they would overlap badly: at least six of them need reminders, five need a form filled in, four
need documents with expiry dates, and every one of them needs tasks and KPIs.

Built properly, they are **nine engines and twelve thin domains on top of them**.

## 1. Where the duplication would have been

This table is the argument for the whole architecture. Left column: what the brief asks for. Right:
what it actually is.

| Looks like its own feature | Is really | Engine |
|----------------------------|-----------|--------|
| Application form | A form definition + the documents it demands | Forms, Documents |
| Welcome pack | A form definition needing signatures + a task to chase them | Forms, Work |
| Five-year employment history | Documents with a verification state, against a timeline | Documents |
| Uniform measurements | A form definition | Forms |
| Site inspection | A form definition + photos + corrective-action tasks | Forms, Documents, Work |
| Operational report | The same, with a different definition | Forms |
| Welfare check | A form definition on a timer | Forms, Scheduler |
| Client satisfaction survey | A form definition sent to a client contact | Forms |
| Hourly check call | A scheduled expectation + the event that satisfies it | Scheduler, Events |
| Book-on | An event against an assignment, inside a window | Assignment, Events |
| SIA licence expiry reminders | A document with an expiry + the reminder rule | Documents, Scheduler |
| Right-to-work and visa reminders | The same engine, a different document type | Documents, Scheduler |
| Daily departmental tasks | Work items with a recurrence rule | Work, Scheduler |
| Rotas and shift changes | Assignments, and their amendment history | Assignment, Events |
| Live KPIs for every department | Queries over the event log | Events |

**Five form definitions replace five separately built forms. One reminder engine replaces six sets of
reminders. One event log replaces every department's private counters.**

Configuration, not code, is what makes the platform fit Leon — and what lets it keep fitting when the
process changes.

## 2. The nine engines

### 2.1 Identity — one person, for life
One record per human being, ever. Applicant, candidate, conditionally employed officer, confirmed
officer, leaver and rehire are **states of one record**, not separate records in separate modules.

- Everything in the platform references `personId`. Nothing copies a name.
- Rehire is the case that proves it: a returning officer keeps their screening history, their
  previous assignments and their PIN lineage instead of being typed in again as a stranger.
- Duplicate prevention runs at the point of entry, on the fields that actually collide — name and
  date of birth, National Insurance number, SIA licence number, phone, email. Design in
  [`docs/proposal/02`](../proposal/02-portal-structure.md).

### 2.2 Places — client, site, post
A three-level hierarchy, because the rota fills **posts**, not sites: "Site X, night gatehouse,
Mon–Fri 1900–0700" is the thing that needs an officer, and the thing a client pays for.

- Site instructions, access details, hazards and the PIN↔PRN cross-reference hang off the site.
- A post carries its own requirements: screening period, licence type, regulated-activity flag.
  This is how a client's contractual vetting terms reach the screening file automatically instead of
  being remembered.

### 2.3 Assignment — the join between HR and operations
`person × post × time range`. Two words for what makes the platform one system rather than two.

- A **rota** is a projection of assignments over a date range.
- A **shift change** is an amendment with a reason and an author, not an overwrite — "multiple shift
  changes" in the brief means the history has to survive.
- A **book-on** is an event against an assignment.
- **Check calls** are generated from assignments; nobody maintains a separate list of who to ring.
- A **compliance block** is enforced here, once: an assignment cannot be published if the person is
  not deployable. That is the single choke point that makes compliance real.

### 2.4 Forms — one definition and response model
A form is data: a versioned definition of typed fields, with rules about who fills it, when, and what
happens to the answers.

- Answers are **typed fields, not free text**, so they feed KPIs without anyone re-keying them. A
  satisfaction score is a number; an inspection failure is a boolean with a photo.
- Definitions are **versioned**, and a response records the version it answered. Change the
  inspection form and last quarter's results still mean what they meant.
- New form, new row: a client asking for a bespoke inspection sheet is configuration, not a release.

### 2.5 Documents — one store, one expiry engine
Every document has an owner reference, a type, a source, a verification state and, where the type
says so, an expiry date.

- Types carry their own rules: which are acceptable as proof of what, whether an original is needed,
  the retention period, and whether a copy may be kept at all. Criminal record certificates are the
  case that matters — the outcome and date are retained, the certificate is not.
- **Expiry monitoring is one job over one table.** SIA licences, right to work, visas, insurance,
  training certificates and client contracts all warn at 90, 60 and 30 days
  ([`lib/sla.ts`](../../lib/sla.ts)) through the same code path.
- Retention and disposal run from here: 12 months for someone unsuccessful at preliminary checks,
  7 years after cessation of employment (BS 7858 clause 11).

### 2.6 Work — one task model
One work item, with a polymorphic subject and an owner.

- Chasers, controller reviews, corrective actions from an inspection, licence renewals, uniform
  issues and "the Tuesday morning departmental checks" are all rows in the same table.
- Therefore **one queue per person**, sorted most-overdue-first, across every department — not a
  to-do list per module that nobody opens.
- Recurrence is a rule on the definition, so a daily departmental workflow is configured once.
- Escalation is a property of the task type, and blocked tasks record *what* they are blocked on so
  the queue never lies about whose move it is.

### 2.7 Scheduler — one clock
Everything time-based is a rule in one engine: SLA breaches, chaser ladders, expiry warnings,
check-call windows, rota publication deadlines, recurring tasks, retention disposal.

- **A reminder cancels itself when the condition clears.** This is the fix for the chase–reject–chase
  loop: nobody is asked twice for something they already sent.
- Rules are data, editable in Admin. The standard's deadlines are not: they live in
  [`lib/bs7858.ts`](../../lib/bs7858.ts) and the Admin screen shows them as fixed.
- Escalation is part of the rule, so "overdue" always has a named next person.

### 2.8 Events — one append-only log
Everything that happens is an event: actor (person **and** the role they were working as), subject,
type, timestamp, payload.

- **Every KPI is a query over this log.** No module keeps counters; no two screens can disagree.
- The audit trail an SIA ACS assessor or an insurer asks for is the same log, filtered.
- "Who did what, when, acting as what" is answerable because the active role chosen at sign-in is
  recorded on every event.
- Delay analysis becomes possible without extra work: the gap between two events *is* the delay, so
  the Control→HR handover, the offer-to-deployment time and the time a document sat unverified are
  all measurable from day one.

### 2.9 Access — one permission model
Roles as data, never as code ([`lib/roles.ts`](../../lib/roles.ts)), extended with the operational
roles. Two rules that are structural rather than cosmetic:

- **Separation of duties is enforced, not documented.** Nobody screens themselves; the screening
  controller is never the administrator on the same file; a controller's own file is administered by
  higher management (BS 7858 clauses 6.1, 7.5.2b).
- **Screening detail is restricted to the people who need it for the decision.** Recruitment sees a
  status, not the contents of a file.

## 3. The single-source-of-truth register

The register that keeps the promise in the [README](README.md). Every fact, its one owner, and who
may only read it.

| Fact | Owned by | Read by | Note |
|------|----------|---------|------|
| Name, date of birth, contact details | People | Everything | Written once, at first contact |
| National Insurance number | People | Vetting, payroll export | Duplicate-check key |
| SIA licence number and name on badge | Compliance | Scheduling, Live ops, Places | Verified against the public register; never typed from the badge |
| Licence / right-to-work / visa expiry | Compliance (a Document) | Scheduling (blocks), Insight | Supersedes INDEL's alerting — never both |
| Screening status and the clock | Vetting | Recruitment (status only), Scheduling (blocks) | Contents restricted |
| Deployability | Compliance, derived from Vetting + Compliance | Scheduling — as a hard block | Derived, never set by hand |
| Recruitment stage | Recruitment | Insight | Separate track from vetting, by design |
| PIN | Onboarding (allocated, never reused) | Everything | Client-side PRN is a Places cross-reference |
| Post requirements (screening period, licence type) | Places | Vetting, Scheduling | How a contract term reaches a screening file |
| Who is on shift where | Scheduling (Assignment) | Live ops, Insight, payroll export | The rota is a projection, not a second table |
| Whether they turned up | Live ops (an Event) | Scheduling, Insight, payroll export | Book-on is evidence |
| Hours worked | Live ops, derived from book-on / book-off | Payroll export, client billing | Approved by an operations manager before export |
| Client satisfaction score | Clients (a Form response) | Insight | Typed field, so it trends without re-keying |
| Task ownership and due date | Work | Everything | One queue per person |
| Every KPI | Nobody — derived from Events | Insight | The reason reporting cannot drift |

## 4. How this maps onto the code

```
lib/
  core/        the engines — shared, domain-agnostic
    identity   person lifecycle, duplicate keys
    places     client / site / post
    assignment person x post x time, and the deployability block
    forms      definitions, versions, responses
    documents  types, verification, expiry
    work       tasks, recurrence, escalation
    scheduler  reminder rules, SLA clocks
    events     the log, and the KPI queries over it
    access     roles, permissions, separation of duties
  bs7858.ts    the standard. Fixed. Clause-referenced. Not configurable
  policy.ts    Leon's own stricter rules. Configurable, but deliberately separate
  sla.ts       Leon's service levels. Configurable
```

Two rules for anyone adding to this:

1. **A domain may not write a fact it does not own** in the register above. It reads it.
2. **If you are about to build a second form renderer, a second reminder, a second task list or a
   second place to count something — stop.** It already exists. That is the whole point.
