# 02 — Portal Structure

## 1. The organising idea

One candidate record, created once, carrying the person from first contact to confirmed
employment. Everything else — Sourcing Sheet, Interview Sheet, Recruitment Sheet, Watch List —
becomes a **saved view** of that record rather than a separate file that has to be kept in step
by hand.

Alongside it, **two status tracks that never merge**:

- **Recruitment / onboarding progress** — where the person is in getting hired and deployable.
- **Vetting (BS 7858) completion** — where their screening file is.

They are reported separately because they answer different questions and are owned by different
people, but they are **linked by hard gates**: recruitment cannot pass certain stages until
vetting has reached a particular state. Those gates are set out in document 03.

## 2. Navigation

Nine top-level areas. The left-hand navigation stays the same for everyone; items the user's role
cannot access simply are not shown.

```
Dashboard              Landing page, role-aware
My Tasks               Everything assigned to me, oldest and most overdue first
Requirements           Client staffing requirements  (Control)
Officers               The existing officer pool, deployability, licence expiry
Candidates             The single candidate record and the recruitment pipeline
Vetting                Screening files, checks, evidence, controller review queue
Onboarding             The post-offer admin checklist
Reports                KPIs, delays, workload, team performance, audit extracts
Admin                  Users and roles, clients and sites, email templates,
                       SLA configuration, retention, audit log
```

### 2.1 Dashboard
Role-aware landing page. Detail in [document 04](04-management-dashboard-kpis.md).

### 2.2 My Tasks
The single most useful screen for day-to-day HR, and the answer to "so employees know what to do
next". A flat, sorted work queue: what is mine, what is overdue, what is due today, what is
blocked and waiting on someone else. Every task carries the candidate, the stage, the action, the
due date, and a one-click way to do the thing (send the chaser, record the check, upload the
evidence).

### 2.3 Requirements — Control's area
A requirement is a client's request for cover. It holds: client, site, control (**Alpha / 3** or
**Bravo / 2**), post type, headcount, shift pattern, start date, screening period required by that
contract (5 or 10 year), and status.

Lifecycle: `Received → Pool check → Covered internally` (closed) or `→ Released to sourcing →
Candidate(s) allocated → Filled` (closed). A requirement for 3 officers can be partly filled, so
headcount is tracked as *required / allocated / remaining*.

"Released to sourcing" is the formal Control→HR handover and replaces the Sourcing Sheet. It
creates work in HR's queue the moment it happens, with a timestamp — which is how we later measure
how long HR took to react, and how long requirements sit unfilled.

### 2.4 Officers — the officer system of record
Control's first action is to check whether existing officers can cover a requirement, so the
portal needs the pool to be searchable and trustworthy: name as per SIA badge, PIN, licence number
and expiry, sites worked, availability, current deployability status, and whether their BS 7858
file is complete or conditional.

This is also where licence-expiry monitoring lives. An officer whose SIA licence lapses is not
deployable, and that should surface 90, 60 and 30 days ahead, not on the day. The same applies to
right to work: once the recorded expiry passes, no further shifts can be assigned until updated
evidence is verified.

**Where this stops.** The portal takes the **HR part** — the officer's compliance record, documents
and expiry dates, and the chasing that hangs off them, which continues naturally from the screening
file. **Shift assignment and operational deployment stay in INDEL.** The boundary is the handover
at onboarding. See [document 08](08-officer-system-of-record.md).

### 2.5 Candidates — the recruitment pipeline
The single record. Created at the point of shortlisting, and **never created twice** — see the
duplicate-check design in section 4 below. A Kanban-style pipeline view by stage, plus a table
view with filters, plus the individual candidate page.

The candidate page shows, on one screen: who they are, which requirement they are against,
recruitment stage and days in stage, vetting status as a simple colour with a reason, outstanding
items, the full communication history (every email and chaser sent, with timestamps), documents,
and the audit trail.

### 2.6 Vetting — the screening file
One screening file per individual [7.2a], with conditionally-employed files flagged distinctly, as
the standard requires. The file is structured as **a checklist of named checks**, each with its
own status, owner, evidence, and dates. This is a direct digital equivalent of the standard's
verification progress sheet (Form 2), which is the closest thing the standard gives us to a data
model — and it is worth following closely because it is what an auditor will recognise.

**Checks held on the file:**

| Group | Check | Clause |
|-------|-------|--------|
| Consent | Authorisation to approach employers/government/CRA | 7.3.2f, 7.3.3 |
| Consent | Signed declaration, misrepresentation acknowledgement | 7.3.2e, g |
| Preliminary | Information complete and reviewed as likely to complete | 7.4b |
| Preliminary | Identity confirmed from original documents (who examined, who copied) | 7.4c |
| Preliminary | SIA licence verified against the public register, search result retained | 7.4c1 |
| Preliminary | Current address confirmed | 7.4d |
| Preliminary | Global watchlist / sanctions check | 7.4e |
| Preliminary | Public record search via credit reference agency | 7.4f |
| History | One row **per career-history period**: education, employment, self-employment, unemployment, gap, travel, residence abroad | 7.7a–h |
| Criminality | SIA licence, or NPCC Appendix C, or DBS-equivalent disclosure held/obtained | 7.7j |
| Legal (separate) | Right to work, with follow-up date if time-limited | outside scope |
| Sign-off | Administrator named; **controller reviewed** limited screening | 7.5.2b |
| Sign-off | Controller reviewed completed full screening file | 7.7 |
| Exception | Acceptance of risk — CCJ >£10k, bankruptcy, directorship | 7.4f, Form 5 |
| Exception | Statutory declaration | 7.7i, Form 4 |
| Exception | Deadline extension approval | 7.6 |

**Each history period row carries**, following Form 2: dates as stated by the applicant, dates as
confirmed, the verifier's organisation and contact, **how that contact detail was independently
verified**, 1st request sent date, 2nd request sent date, confirmation received date, the
documentary evidence fallback if no reference came back, and an audit column.

The request-type codes on Form 2 are worth adopting verbatim so the file reads the same as the
paper one: `WR` work reference, `ER` education reference, `TR` trade reference, `AR` accountant's
reference, `DR` documentation request, `FI` further information request, `SDR` statutory
declaration request, `CL` chaser letter, `RA` executive risk of acceptance.

**The file also displays, prominently:** conditional employment start date, the 12-week
deadline, days remaining, and the date employment must cease if screening does not complete [7.2].

### 2.7 Onboarding
The eight current post-offer tasks, as a checklist with owners and due dates: online checks
recorded, name added to the Recruitment Sheet exactly as per SIA badge, PIN assigned, Indeed
profile created, added to Watch List, added to Maps, hired in Casper, New Recruit Onboarding Group
notified. Nothing changes about *what* these are — the portal just makes them a tracked checklist
instead of a memory exercise, and several can be pre-filled or automated (document 05).

### 2.8 Reports
KPIs, stage-by-stage delay analysis, workload by owner, source effectiveness, and — importantly —
**audit extracts**: give me every file in conditional employment with its deadline; every
extension granted and who approved it; every risk acceptance; every record due for disposal.

### 2.9 Admin
Users and roles, clients and sites, control assignment, email and letter templates, SLA and chaser
timings, screening-period defaults per client, retention policy, the vetting team competence
register (screening status, NDA, training dates, annual review date [6.1, 6.2]), and the
append-only audit log.

## 3. Data model sketch

```
Client ──< Site ──< Requirement >── Control (Alpha/3 | Bravo/2)
                          │
                          └──< Allocation >── Candidate ──── Officer
                                                  │             │
                                                  │             └──< Deployment
                                                  │
                        ┌─────────────────────────┼──────────────────────┐
                        │                         │                      │
                 RecruitmentStage          ScreeningFile           Communication
                   (history of              (one per person)        (every email,
                    stage changes)               │                  chaser, note)
                                                 ├──< Check
                                                 ├──< HistoryPeriod ──< EvidenceDoc
                                                 ├──< Signoff
                                                 └──< Exception (risk / statdec / extension)

Person (identity spine) ─── dedupe keys: NI number, DOB+surname, email, phone, SIA licence
User ──< Role ──< Permission        AuditEvent (append-only, every read of a screening file)
Task (owner, due date, SLA, source stage)
```

Two design points worth agreeing:

- **`Person` is the identity spine.** A candidate, a previous applicant, a current officer and a
  former employee are all the same `Person` with different states. This is what makes "has this
  person worked for us before?" a lookup rather than a memory test.
- **`Check` is generic, with a type.** Adding a new check later (a new client's extra requirement,
  a new insurer condition) is configuration, not a code change.

## 4. Duplicate prevention — how it should work

Today the duplicate check is three manual questions asked before creating an Interview Sheet row.
The portal should do it at the point of typing a name, before a record exists.

**Matching on:** National Insurance number (exact — the strongest key), SIA licence number
(exact), email, mobile number, and fuzzy surname + date of birth. Fuzzy matching matters because
the same person appears as "Mohammed", "Mohammad" and "Muhammed" across four spreadsheets.

**What the portal shows** when a possible match is found, before allowing a new record:

- This person has applied before — when, for which requirement, and what the outcome was
- This person has worked for us before — dates, sites, and why they left
- This person already has an open application at stage X, owned by Y
- This person has already been sent an interview invitation / application link / Welcome Pack on
  date Z
- This person's previous screening file exists and may be reusable (relevant to 7.1 and 7.7,
  where an existing file can confirm part of the required information)

**Then offer three actions:** open the existing record, merge into it, or explicitly confirm this
is a genuinely different person and create a new record — with that confirmation logged. The last
option matters: forcing a hard block creates workarounds, whereas an audited override does not.

## 5. Recommended technology

Put here for agreement, not as a decision already taken.

| Layer | Recommendation | Why |
|-------|----------------|-----|
| Framework | **Next.js (App Router) + TypeScript** | One codebase for UI and server logic; server-side rendering keeps sensitive screening data off the client where possible |
| UI | Tailwind CSS + a component library (shadcn/ui) | Fast to build consistent tables, forms and checklists, which is 90% of this portal |
| Database | **PostgreSQL** with Prisma | Relational data with real constraints; the gate rules and dedupe keys belong in the database, not only in the UI |
| Authentication | SSO against the company identity provider (Microsoft Entra ID / Google Workspace), MFA enforced | No separate passwords for a system holding criminal-record and financial data |
| Documents | Encrypted object storage (S3 or Azure Blob), UK region, access only via short-lived signed URLs issued after a permission check | Never serve candidate documents from a public path |
| Background jobs | A scheduled worker for clocks, chasers, expiry and retention sweeps | The reminder engine is the portal's real value; it must run reliably |
| Audit | Append-only audit table; **every read** of a screening file logged, not just writes | 7.2 requires preventing unauthorised access; proving it requires read logging |

**Data protection notes to build in from the start**, not retrofit: UK data residency; field-level
encryption for NI number, DOB and financial findings; criminal-record **outcomes** stored but
certificate copies **not retained**; retention clocks with secure deletion; and a documented
lawful basis for each category of data held.
