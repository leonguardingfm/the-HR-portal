# 01 — Scope and domains

## 1. What the platform is for

One place where the whole business is visible and the routine work runs itself. Stated as a test we
can hold the build to:

> A manager should be able to answer any question about who is working, where, whether they are
> legally allowed to be there, whether they turned up, whether the client is happy, and what is
> overdue — from one screen, without asking anyone.

Two constraints shape every design decision that follows:

1. **The officers are the product.** Guarding is sold as people on site at agreed times with valid
   licences. Almost every failure mode is a person problem: not vetted, not licensed, not there, not
   checked on. The platform is therefore built around the **person** and the **assignment**, not
   around departments.
2. **Compliance is not a module.** BS 7858 screening, SIA licensing and right to work are conditions
   on *doing the work*, so they belong in the path of the work — blocking a rota assignment — not in
   a compliance section someone remembers to visit.

## 2. The fifteen domains

Each domain is a **view plus its own rules** over the shared engines in
[document 02](02-shared-engines.md). None of them owns a database of its own.

| # | Domain | Owns (the facts nothing else may write) | Reuses |
|---|--------|------------------------------------------|--------|
| 1 | **People** | The person record and its lifecycle state; contact details; next of kin; bank and payroll reference | Identity, Documents, Events |
| 2 | **Recruitment** | Requirements, candidate pipeline stage, interviews, offers, onboarding steps | Identity, Forms, Documents, Work, Scheduler |
| 3 | **Vetting** | The BS 7858 screening file, its checks, the clock, the gates | Identity, Documents, Work, Scheduler, Access |
| 4 | **Compliance** | Licence, right-to-work and visa status and their expiry dates; deployability | Documents, Scheduler, Events |
| 5 | **Places** | Clients, sites, posts, site instructions, PIN/PRN cross-references | Documents, Events |
| 6 | **Scheduling** | Assignments, rota publication, shift changes, availability, absence | Identity, Places, Work, Scheduler, Events |
| 7 | **Live operations** | Book-ons, check calls, welfare checks, incidents, live site state | Assignment, Forms, Scheduler, Events |
| 8 | **Quality** | Inspections, operational reports, corrective actions | Forms, Documents, Work, Events |
| 9 | **Clients** | Contracts, service levels, feedback, satisfaction scores, reviews | Places, Forms, Events |
| 10 | **Equipment** | Uniform measurements, issues and returns; radios, keys, PPE | Identity, Forms, Documents, Work |
| 11 | **Work** | Departmental task definitions, recurring workflows, ownership | Work, Scheduler, Access |
| 12 | **Administration** | Suppliers and recurring payments with their agreed amounts; the premises asset register and its service schedule; holiday entitlement and requests; external authority matters and suspensions; fines, penalties and vouchers; uniform stock levels and movements; accreditations, renewal dates and evidence links | Identity, Forms, Documents, Work, Scheduler, Events, Access |
| 13 | **Messaging** | Conversations and their messages; delivery and read state; which conversation a message belongs to | Identity, Places, Documents (attachments), Scheduler, Events |
| 14 | **Client access** | Nothing. A scoped view, nothing more | Places, Assignment, Live operations, Quality, Access |
| 15 | **Insight** | Nothing. Every number is derived | Events (only) |

Domain 12 is the one added last, in September 2026, and it is worth noting what it did **not** need:
no engine of its own, and no second task list, form renderer, reminder clock or audit log. Its
approval chain hangs off the existing Work engine, which is what a thirteenth domain costing almost
nothing looks like. Its structure and workflow are [document 06](06-admin-department.md). Note also
that "who holds what uniform" stays with Equipment (domain 10) — Administration owns the *stock*, not
the issues, and the two meet on the same item record.

Domains 13 and 14 were added in September 2026 from the answers to E5 and E7.

**Messaging** exists because a WhatsApp message is not a record: it lives on two handsets, leaves when
the officer leaves, and cannot be produced for an audit or a tribunal — and it sits outside the
retention rules the platform is otherwise held to. It is also the one new domain that genuinely owns
facts, because a message is a fact nobody else holds. What it must not do is replace the phone in the
welfare ladder: an unanswered message is not a welfare check, and the ladder still ends with somebody
attending site.

**Client access owns nothing at all**, and that is the whole design. A client portal is a *scoped
view* over Places, Assignment, Live operations and Quality. The moment it keeps its own record of a
site or an inspection, two systems are describing the same site and one of them is stale. It is the
second domain after Insight to own nothing, and for the same reason.

Domains 14 and 15 owning nothing is the point: **management reporting cannot drift from operations if it has
no numbers of its own.**

## 3. Where the boundaries sit

Scope is defined as much by what stays out. These are the six edges that would otherwise creep.

| Edge | In scope | Out of scope | Why |
|------|----------|--------------|-----|
| **Pay** | Hours worked, approved, and exported | Calculating gross-to-net, payslips, RTI filing | Payroll is a regulated calculation with its own software. We own the *inputs*, which is where the errors actually come from |
| **Money** | Billable hours per site per period, ready to invoice | Invoicing, credit control, ledger | Accounts software already does this |
| **Sales** | Client contract terms the operation depends on | Pipeline, quotes, tenders | A CRM problem, not an operations one |
| **Training** | That a licence or a training record exists and when it expires | Delivering or marking courses | An LMS problem. We own the expiry, not the content |
| **Messaging** | Operational contact with officers, and a helpdesk — because those are records | Being a general chat product: threads about anything, social features, voice and video calls | The edge that will creep hardest. A message that is a record of operational contact earns its retention rule; a conversation about the football does not, and mixing them makes the retention rule unenforceable |
| **Client access** | A client seeing their own sites, cover, inspections and reports | A client seeing the person record, screening contents, or anything about another client | The first is a commercial feature. The second is a data-protection incident |

## 4. INDEL

**The portal fully replaces it, and there is no integration.** Confirmed 21 September 2026.

The thing worth being clear about is *how*. This is not a cutover project with a date on it. The
replacement happens because the platform takes over the ground release by release, and INDEL stops
being used for whatever has been taken over:

| Release | What stops being done in INDEL |
|---------|-------------------------------|
| R1 | The officer and candidate record, compliance dates, documents, expiry alerting |
| R2 | The rota, shift changes, availability |
| R3 | Book-ons, check calls, the live picture |

So there is no migrate-or-integrate question to weigh, and no design decision in this plan waits on
INDEL. The one remaining question is narrow: **which existing records should be loaded at the start**
(E9 in [document 04](04-decisions-needed.md)) — a one-off import, not a programme.

Two things follow from the scope itself rather than from INDEL, and they hold regardless:

1. **Availability stops being a nicety.** Once Control works the rota and the live board here, an
   outage on a Friday night is an operational incident, not delayed HR admin. An uptime position, a
   backup and recovery position, and a fallback for what Control does during an outage have to be
   agreed before the operations release — a printed rota and a phone number is a perfectly good
   answer, but it has to be the agreed one. This is **E2** in
   [document 04](04-decisions-needed.md).
2. **Nothing goes live big-bang.** Each release is usable on its own and is proved against real work
   before the next one depends on it. See [document 03](03-release-plan.md).

## 5. Departments, and why the navigation is grouped by them

The platform is navigated the way the business is organised, so that "the whole of my job is on one
screen" is true for each team rather than only for management.

The groups are **departments**, in the order the day runs. Approved 22 September 2026, replacing
the earlier Operate / Grow / Assure / Run / See grouping, which described what a module was for
rather than who was responsible for it.

| Group | Modules | Whose day it is |
|-------|---------|-----------------|
| **Dashboard** | Dashboard, My tasks | Everyone, first thing |
| **Control Room** | Live board, Book-ons, Check calls, Scheduling & shift changes, Client requirements, Officers, Control Room tasks | Control and the Operations Manager, every hour |
| **HR** | Recruitment & candidates, Interviews, Forms & packs, Vetting (BS 7858), Right to work & SIA, Onboarding, Officer & employee records, HR tasks | Recruitment, screening and the HR Manager |
| **Admin** | Admin overview, Requests & approvals, Payments & contracts, Premises & equipment, People admin, Penalties & decisions, Uniform & stock, Accreditations, Admin tasks | The Admin team, the Finance Officer — see [06](06-admin-department.md) |
| **Management** | Department board, Clients & contracts, Quality & inspections | Management, and account management |
| **System** | Users, roles & rules, Permissions, Platform map | The portal owner, and the auditor |

Three things about that table are deliberate:

- **Management is no longer at the top.** The day's work comes first; oversight follows it.
- **There is no Operations group.** Everything it held is under Control Room, because that is who
  does it.
- **Headings collapse**, and which are open is remembered per person — Control and an Admin Officer
  want opposite things from the same sidebar.

Where the business names several things that are one screen, the navigation links to the **view**,
not to a copy. Book-ons and check calls are `?view=` links into the live board; Interviews is the
candidate pipeline narrowed to the interview stages; the departmental task lists are the one queue,
filtered. A second page would only be the same data with a second chance to disagree with itself.

A role sees only the groups it works in ([`docs/proposal/06`](../proposal/06-access-permissions.md)
governs this, extended with the operational roles). Control's day starts on the live board; a
recruiter's on their task queue; a director's on the dashboard. What a role may *do* on a screen it
can see is separate, and is [`lib/auth/permissions.ts`](../../lib/auth/permissions.ts) — both
matrices are rendered at `/system/permissions`.

## 6. What this is not a copy of

AREZ and SmartTask both solve the generic guarding problem and then ask you to fit it. Three things
here are specific to Leon and are the reason for building rather than buying:

1. **BS 7858 is enforced, not recorded.** The 12-week clock, the three gates, separation of duties
   and the retention rules are encoded with their clause references
   ([`lib/bs7858.ts`](../../lib/bs7858.ts)), and deployment is blocked on them. Generic products give
   you a checklist and trust you.
2. **The company's own stricter rules are separate and protected.** Leon completes criminality and
   right to work before site, which the standard does not require. That lives in
   [`lib/policy.ts`](../../lib/policy.ts), deliberately outside the standard's module, so it can
   never be dropped later as "not a requirement".
3. **The real process, including its handovers.** Control raising a requirement, the pool check, the
   timestamped release to HR, the two Control teams, PIN and PRN, the three interview stages. These
   are where the delays actually are, and a generic pipeline does not have them.
