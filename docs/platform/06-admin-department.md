# 06 — The Admin department

Approved 22 September 2026. This is the record of what was agreed, and the
reasoning behind the parts that are easy to get wrong later.

Nothing here repeats the engines in [02](02-shared-engines.md) or the ownership
register it carries. Admin adds **no new engine**: its tasks are WorkItems, its
approvals hang off them, its documents are DocumentRecords, its reminders are
ReminderRules, its audit trail is the Event log and its thresholds are Settings.
What it adds is six categories of fact nobody owned, and one workflow over them.

The rules are in `lib/core/admin.ts`, in one place, and the screens read them.

---

## 1. Structure

Six categories. Each owns facts nothing else in the platform may write, and
reads the rest.

| Category | Owns | Reads (never copies) |
|---|---|---|
| **Payments & contracts** | Supplier, payment terms, recurring schedule and its agreed amount, each instalment, contract dates and notice period | Approval decisions, contract documents |
| **Premises & equipment** | Office asset register, service schedule, faults and what was done | Suppliers, spend approvals |
| **People admin** | Holiday entitlement and requests, external authority matters, suspensions | The person record, **whether they are rostered on the dates requested**, employment start date, forms |
| **Penalties & decisions** | Fines, penalties, vouchers, the decision behind each | The person record, approval decisions |
| **Uniform & stock** | Stock on hand per item and size, reorder level, movements | **Who holds what** — that was already modelled against the person; measurements; leaver date |
| **Accreditations** | Accreditation record, renewal and audit dates, which evidence satisfies what | Screening completions, inspection results, training records, documents |

The rule that keeps it honest: if something appears in both columns, one of the
two is wrong. The table is rendered in the app at `/admin`, so the claim is
checkable rather than a promise in a document nobody opens.

### Where this sits against the old `/admin`

Portal configuration — users, roles, service levels, retention, the audit log —
**moved to `/system`**. Configuring the portal and running the administration
department are different jobs done by different people, and one URL for both
would have sent Admin Officers to the wrong screen every time.

---

## 2. The workflow — one engine, two tracks

A **task** needs doing. A **request** needs deciding and then doing.

```
task     raised → assigned → in progress → completed
request  raised → assigned → reviewed → approved → completed
                                     ↘ rejected (final)
```

Two tracks of one thing, not two systems: "order a new kettle" and "approve
£189 for a kettle" are the same item at different points, not two items in two
modules. Every permitted move is in `canTransition`; anything not listed is
refused, and a request cannot jump from `reviewed` to `completed`.

A rejection is **final**. Raising it again is a new request, deliberately, so
the history shows two asks rather than one that changed its mind.

**Review** is where a request is checked and costed, and the last point the
amount can change. Re-costing rewrites the chain to match — but only while
nothing is signed; after that, the figure is what was approved.

---

## 3. Priorities, deadlines and escalation

| Priority | Target | When to use it |
|---|---|---|
| P1 | 4 hours | An officer cannot work, a site is at risk, or a legal deadline is today |
| P2 | 1 day | Someone is blocked with no workaround, or money is due this week |
| P3 | 3 days | Normal departmental work with a date attached |
| P4 | 10 days | Housekeeping. Real work, no deadline pressing |

Escalation is a **multiple of the item's own target**, not a fixed clock, so one
rule covers a four-hour job and a ten-day one:

| At | Goes to | What happens |
|---|---|---|
| 1× target | Admin Manager | Told it is late |
| 1.5× target | Admin Manager | Asked to intervene |
| 2× target | Higher management | Out of the department |

Escalation puts a **second name** on the work. It never reassigns it: taking it
off the first person is a decision a manager makes, not something a timer does
behind their back.

`dueAt` is **stored** when the item is raised, not derived on read. It is the
deadline that was promised; re-deriving it would let a later change to the
priority table quietly rewrite whether past work was on time.

An unanswered approval is chased on its **own** clock — +24h, +48h, +72h, then
in front of higher management — separate from the work's, because the work
cannot start and the delay is not the requester's fault.

---

## 4. The approval ladder

**A role is a job, not a rank.** This is the decision the whole department rests
on, and it exists because the Finance Officer sits inside higher management.
Written in terms of seniority, the ladder's top two rungs would be the same
person and the second signature on a large payment would be worth nothing.

| Amount | Who approves |
|---|---|
| ≤ £250 | Admin Manager, alone |
| £251 – £2,000 | Finance Officer |
| > £2,000 | Finance Officer **plus** one other higher-management approver — two distinct people, and the approval must carry its grounds |

On top of the money, **anything against an employee** takes the HR Manager
**and** higher management. A penalty with a value therefore gathers both chains
— they are answering different questions.

Four structural rules, whatever the amount:

1. The **requester is never the approver**, even when they hold the role.
2. **Nobody decides a request about themselves.**
3. **One person may satisfy at most one rung** of a chain.
4. **Nothing auto-approves.** The chase ladder puts a request in front of a
   person; it never decides.

All four are enforced three times over — the role matrix, the chain rules, and
the database. The third is the one that survives a bug in the first two:

- `admin_approval_separation` (trigger) refuses the requester and the subject.
- `@@unique([itemId, decidedByUserId])` makes rule 3 impossible, not unlikely.
  Postgres treats NULLs as distinct, so outstanding rungs are unaffected.
- `admin_approval_complete` (trigger) refuses `state = 'approved'` while any
  rung is undecided.

**Thresholds are settings, not constants** (`admin.approval.*_threshold_pence`).
Changing one is an edit with an event against it rather than a release, and only
higher management may do it. Requests already raised keep the chain they were
raised with, because the chain is written out when the request is created.

**Recurring payments are approved once, with the contract.** Only a variance
from the agreed figure, a new payee, or a renewal asks again. Approving an
unchanged rent figure twelve times a year teaches people to approve without
looking, which is the opposite of a control. The ladder then sizes the approval
on the **variance**, not the whole payment, so a £13 difference on the rent stays
with the Admin Manager.

**Cover when the Finance Officer is away** is a time-boxed delegation to a named
person, recorded with its start and end — not a silent fallback to "anyone
senior". An absence should not widen who can spend money.

**Built** (E15; the deputy is the Portal Owner). `RoleDelegation` in the schema,
the rules in [`lib/auth/delegation.ts`](../../lib/auth/delegation.ts), the screen
on `/system`. `endsAt` is not nullable and 90 days is the ceiling, because an
open-ended delegation is indistinguishable from a permanent grant; renewing
leaves a second record. Nobody may lend a role they do not hold, and nobody may
arrange their own cover — both refused in the database as well as the
application.

The property that matters: **a delegation relaxes no separation rule.** Somebody
holding higher management in their own right and Finance Officer by delegation
can sign the Finance rung of a large payment and then cannot sign the
higher-management rung after it, because `@@unique([itemId, decidedByUserId])`
indexes the *approver*, not the role. So the absence is covered without
collapsing the two-signature control. Anything approved while a delegation was
in force stays on the record with the delegation named in the event, which is
why a delegation is revoked rather than deleted.

Roles are resolved at the moment of acting rather than read from the session
cookie, since a delegation can start, expire or be revoked in the middle of
somebody's working day.

---

## 5. Reminders

Ten rules, in `ADMIN_REMINDER_RULES`, all of them **self-cancelling**. The
cancel condition is the important column and the reason these are rules rather
than a cron job that emails a list: a reminder that keeps arriving after the
thing was done is how people learn to ignore reminders.

| Rule | Offsets (days) | Cancels when |
|---|---|---|
| Recurring payment due | −7, −2, 0, +1 | The instalment is marked paid |
| Payment variance | on the day | The variance is approved, or the amount corrected |
| Supplier contract ending | −90, −60, −30, −7 | Renewed, replaced, or ending deliberately |
| Accreditation renewal | −120, −90, −60, −30, −7 | A submission is recorded with a new expiry |
| Accreditation evidence gap | −60, −30, −14 | Every requirement is satisfied |
| Holiday awaiting decision | +2, +5 | Approved or rejected |
| Entitlement at risk of being lost | −90, −30 | Booked, carried over, or paid |
| Asset service due | −14, −3, 0, +7 | A completed maintenance job is recorded |
| Uniform out with a leaver | +7, +14, +30 | Returned, or written off with a reason |
| Approval unanswered | +1, +2, +3 | Decided. Nothing here approves it |

The eleventh is the shared task-SLA rule; Admin does not add its own.

---

## 6. Documents and the audit trail

Documents attach to **the thing they are about** — the supplier, the asset, the
person, the accreditation — never to a folder organised by year. Retention and
expiry are properties of the subject, so a document filed by date cannot be
swept correctly.

The audit trail is the existing append-only `Event` log, plus an `AdminApproval`
row per rung carrying who, when, the grounds and the amount approved. A parallel
Admin log would be editable, which makes it worse than none.

---

## 7. KPIs

Twelve measures, in `ADMIN_KPIS`, each computed in `lib/db/admin-queries.ts` and
nowhere else. No counter is stored anywhere, which is why no two screens can
disagree. Where a figure cannot be computed honestly it shows as `—` with the
reason: a number whose provenance is unclear is worse than no number.

| Measure | Target | Watch band |
|---|---|---|
| Tasks completed on time | ≥ 95% | 5 |
| Overdue tasks | ≤ 3 | 5 |
| Average completion time against target | ≤ 100% | 20 |
| **Renewal deadlines missed** | **0** | **none** |
| Upcoming renewals with evidence complete | ≥ 100% | 10 |
| Recurring payments made on time | ≥ 100% | 2 |
| Holiday requests pending over 5 days | 0 | 2 |
| Uniform outstanding from leavers | ≤ 5 | 7 |
| Fines, penalties and vouchers outstanding | ≤ £500 | £1,000 |
| **Accreditations inside 30 days with no submission** | **0** | **none** |
| Workload spread (busiest ÷ median) | ≤ 1.5× | 0.5 |
| Recurring cost against agreed figures | ≤ 100% | 5 |

Two measures have **no watch band at all**, on purpose. A missed renewal and an
accreditation inside 30 days with nothing submitted are either fine or not fine;
a band would only soften the one figure the department exists to protect.

---

## 8. Permissions

Who may see what is `components/layout/nav.ts`; who may **do** what is
`lib/auth/permissions.ts`. Both are rendered at `/system/permissions`, read from
the matrix rather than transcribed from it.

The separations that matter:

| Role | Holds | Explicitly does not hold |
|---|---|---|
| Admin Officer | Start, review, complete; payments; maintenance; stock; evidence | Assigning, approving, cancelling |
| Admin Manager | All of the above, plus assign, approve, reject, cancel, holiday, authority responses | Changing a threshold |
| **Finance Officer** | Approve and reject; record payments; see every cost | **Holidays, suspensions, authority matters, stock** |
| HR Manager | Approve and reject; holiday; authority responses | **Recording payments** |
| Higher management | Assign, approve, reject, complete, cancel, holiday, evidence, thresholds | Nothing operational in Control or HR |
| Auditor | Nothing at all | Everything. Read-only, including the log |

Raising a task or request is open to **every** member of staff. An Admin request
that has to be asked for through Admin is a request that gets asked for by
WhatsApp instead, and then it is not in the platform at all.

Approving happens **on the active role**, not on every role a person holds:
someone who holds two roles has to be working as the one that signs, so the
event records what they were acting as.

---

## 9. What is not built yet

Honest list, so nobody plans around it:

- **The scheduler does not run.** The ten reminder rules are configured and the
  screen lists them; nothing sends yet. That is the next release item across the
  whole platform, not an Admin gap.

- **Escalation stages are computed on read**, not written by a job, so
  `AdminItem.escalatedStage` stays 0 until the scheduler runs. The board is
  right; the column is not yet.
- **Document upload** attaches through the existing Documents engine, which has
  no uploader yet — the same gap as everywhere else.
- **Assigning work** has an action and a permission but no picker on screen.

## 10. Watch item

Both of the questions this document opened with have been answered (E13, E14):
the DWP reading is right, and £250 / £2,000 stand and can be raised later
without a release. What remains is a watch item rather than a question — whoever
can change a threshold should not also be the person approving just above it.
Today both are higher management, so the Portal Owner could in principle raise
the threshold and then approve under it. The event log names both, so it is
visible rather than silent; if it ever matters, the fix is a second signature on
a threshold change.
