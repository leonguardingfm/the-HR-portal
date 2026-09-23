# 04 — Decisions needed

The HR decisions are logged in [`docs/proposal/07`](../proposal/07-open-questions.md) as A–D, and
still stand. The wider scope creates these. They are numbered **E** so the two lists never collide.

Answered ones stay in the log with the answer, because the answer is the reason the code is the way
it is. The ones that block a release are marked; the rest can be answered as the build reaches them.

## Answered

### E1 — INDEL — **answered**
> The portal will fully replace INDEL. No continuing INDEL integration is required.

So full replacement is the end state, and there is nothing to integrate with. That sits comfortably
with the earlier direction to stop weighing migration against integration: **the replacement happens
by the platform covering the ground, release by release, not by a cutover project.** Each release is
usable on its own, and INDEL stops being used for whatever the platform has taken over.

Nothing in the plan depends on INDEL, and no design decision is now waiting on it. The only thing
left is what should be loaded into the platform at the start, which is **E9**.

### E3 — How officers interact with the system — **answered**
> Officers have their own personal phones, and some sites also provide a phone.

So two channels, and the design uses both:

| Channel | What it proves | Used for |
|---------|----------------|----------|
| **Site phone at the post** | That the officer was **at the site** — the call comes from the site's own line | Preferred where a post has one. The strongest routine record we can get without installing anything |
| **Officer's own phone** — app or call | That the officer had their phone | Everywhere else, and always available as a fallback |

Recorded per contact and shown on the live board (`lib/core/ops.ts` — `CHANNEL_EVIDENCE`), so the
strength of each record is visible rather than assumed. Two consequences:

- **No app install can be made mandatory.** It is the officer's own handset, so the phone route has
  to work for someone who will not or cannot install anything. That is a design constraint, not a
  preference.
- **QR or NFC tags at the post** remain the only way to prove physical presence outright. Not
  needed now; worth knowing it is the upgrade path if a client ever asks for proof of patrol.

### E4 — The check-call ladder — **answered**
> After one hour, if the officer has not given the check call, it starts triggering. It gives instant
> triggers, if it crosses a minute. Then we take further measures to get in contact. If we cannot
> reach them, a person from the operational team goes to site to check everything is okay.

Implemented exactly as stated, in `lib/core/ops.ts`:

| Step | What moves it here | Who acts |
|------|--------------------|----------|
| — | Check call received | Nothing. The clock restarts |
| 1 | **The hour is crossed** — triggers immediately, no grace period | Control tries the officer: own mobile, then the site phone |
| 2 | That attempt failed | Control widens it — site phone, other officers on site, the client's on-site contact |
| 3 | Contact still cannot be made | **A member of the operational team attends site** |

**There are no timers between the steps, and nothing is assumed.** The only threshold in the whole
rule is the hour itself. The step advances when an **attempt fails**, which is what actually
happens: Control does not wait a set number of minutes before trying the site phone, it tries the
site phone because the mobile did not answer.

That has one consequence worth knowing, because it is a change to how Control works rather than just
to the software: **each attempt has to be logged.** The attempt log is what drives the escalation —
it is not paperwork after the fact. It is also the record that shows the duty of care was discharged,
which is the thing an insurer or a coroner would ask for.

One open option, not an assumption we have made: whether a **lone-working post** should escalate
faster than a post with several officers on it. The rule above is currently applied identically to
both.

## Blocking R3

### E2 — What availability does the operation need?
Once Control works the rota and the live board here, an outage is an operational incident rather
than delayed admin. Needed: an uptime position, a backup and recovery position, and what Control
does during an outage. A printed rota and a phone number is a perfectly good answer — it just has to
be the agreed one, and book-on needs a route that works when the system does not.

## Needed soon

### E5 — Telephony and messaging — **answered, and widened**
> **Already on WhatsApp and the SIM carrier. Build messaging in — officer contact and a helpdesk.**

This answers more than was asked. The question was about cost per message; the answer is that the
operation currently runs on WhatsApp and phone, and that an in-built messaging feature is wanted so
officers and a helpdesk are reachable inside the platform.

That is a **new domain**, not a setting — see [01 §2](01-scope-and-domains.md#2-the-thirteen-domains),
domain 14. The reason it is worth building rather than continuing on WhatsApp is not convenience:

- A WhatsApp message is **not a record.** It lives on two handsets, leaves when the officer leaves,
  and cannot be produced for an audit or a tribunal. A welfare conversation is exactly the thing
  somebody will later need to prove happened.
- It is **outside the retention policy.** Clause 11 and the company's own 12-month / 7-year rules
  cannot reach a WhatsApp group, so the platform would be deleting records that still exist
  elsewhere — which is worse than not having the policy.
- A message in the platform can **be** the check-call evidence. `ContactChannel` already has `app`
  and `CHANNEL_EVIDENCE` already rates it above SMS, so this slots into the escalation ladder that
  exists rather than sitting beside it.

What it does **not** replace is the phone for welfare escalation. The ladder ends with a person
attending site, and it must keep ending there: an unanswered message is not a welfare check.

Still needed before building it: see E16.

### E6 — Data protection — **answered**
> **Agreed.**

A data-protection review before R3, owned by the Portal Owner. It now has more to cover than when the
question was written: the two new domains add **message content** (potentially health-adjacent, in a
welfare conversation) and **a third party seeing officer data** through the client portal. The second
is the one to get right — see E17.

What the review has to cover: screening data, health-adjacent welfare records, possibly location,
message content, and disclosure of officer data to a client. A DPIA is very likely required, the
lawful basis for location needs stating, and the retention schedule needs extending across every new
domain. Before R3, not after.

### E7 — Do clients get access? — **answered**
> **Yes. A client portal: their own sites, systems, inspections and everything.**

In scope. Domain 15 in [01 §2](01-scope-and-domains.md#2-the-thirteen-domains), and it is the one
domain that should own **nothing at all** — like Insight. A client portal is a *scoped view* over
Places, Assignment, Live operations and Quality, not a copy of them. The moment it holds its own
records, two systems are describing the same site.

"Everything" is the word to be careful about, and E17 is where that gets settled.

### E8 — Where do hours go?
Which payroll and accounts systems consume the approved hours, and in what format. It shapes the
export, not the platform.

### E9 — What existing data should be loaded at the start?
Now the last INDEL question, and a narrow one: on day one of R1, which officer and candidate records
should already be in the platform, and where does each field come from? The spreadsheets and INDEL
are the sources.

This is a **load**, not a migration — a one-off import into a schema that already exists, not a
programme to keep two systems in step. What it needs is a list of fields and one person who can say
which value is right where two sources disagree. Worth doing before R1 goes live rather than after,
because a record loaded wrong is then chased, reminded about and reported on.

> **Answered: the data comes once the system is ready.** Parked until R1 go-live, which is the right
> point — loading before the screens are finished means loading twice.
>
> One thing to start early, because it is the slow part and does not depend on us: deciding **who
> arbitrates** where the spreadsheets and INDEL disagree about the same officer. That is a person,
> not a file.

### E10 — Signal at the posts — **answered, and built**
> **Yes, there are such sites. The officer books on before entering. For check calls, the helpdesk
> emails the client to say our officer has reached the location and there is no signal; the client
> then stays in contact with the officer, who uses the site phone. If the client cannot reach the
> officer, they tell the helpdesk or Control Room and somebody goes to site to check.**

This is the most consequential answer in the series so far, because it was not a gap in the plan — it
was a **bug in code already shipped**. The live board computes a missed check call the moment the hour
is crossed. On a post with no signal that would have fired every hour, all night, against an officer
who physically cannot call. A board that is always red is a board nobody reads, which is the exact
failure this platform has been designed around everywhere else.

What the answer changes, and it is a change of model rather than a tolerance:

- **Signal is a property of the post**, not of the shift. `Post.mobileSignal`, defaulting to true, so
  the exception is something somebody has to state.
- **The contact obligation moves to the client.** A new state, `client_held`: nobody is waiting for
  the officer to call. What is being watched is whether the client has been told, and whether they
  have come back.
- **The handover is recorded**, in `NoSignalHandover` — who at the client was told, and when. On an
  ordinary post the check calls are the trace that somebody was in contact with a lone officer
  overnight. Here there are none to have, so the handover is the only trace there is, and it is
  recorded whole or not at all.
- **The client's report is the failed contact.** There is no mobile to try, so it goes straight to
  attend site rather than starting at the top of the ladder.
- **Book-on precedes entry**, which is the only moment the officer has a signal to do it with. The
  seeded example books on ten minutes before the shift starts, from outside the site.

Two consequences elsewhere:

- **Offline queueing is not needed for book-ons**, because the book-on happens in signal, before
  going in. That is a real simplification of what E5 looked like it would require.
- **The in-built messaging of E5 cannot reach these posts at all.** Whatever is built there, the
  client-held model is the fallback, not a degraded version of messaging.

One thing built on judgement rather than on the answer, and worth confirming: a no-signal post with
no book-on at the start of the shift is treated as immediately actionable rather than given the usual
15-minute grace. The grace exists because an officer can book on late; on this post they cannot — once
they are inside, they have no signal. So the grace would only delay noticing.

### E11 — Who owns the platform? — **answered**
> **Portal Owner: Muhammad Shahzad. Operational Lead: Tanveer Mahmood.**

Two routes, which is better than one: build decisions, scope and sign-off go to the portal owner;
anything about how Control and the operations team actually work goes to the operational lead. The
Control discovery session ([document 05](05-control-discovery.md)) is the operational lead's to
convene.

Recorded here and **nowhere in the code**. Who holds which *role in the platform* stays data, set up
in Admin, so a transfer is an edit rather than a release — `lib/roles.ts` contains no names by
design. This supersedes D5.

### E12 — What is it called? — **closed**
> **It was only ever about clarifying the HR section.**

No rename. "HR" stays as the name of the section, and the repository name stays as it is. Closing
this rather than leaving it open, because an open naming question invites a rename halfway through a
release.

### E13 — What exactly are "Department of Work matters"? — **answered**
Read as **DWP correspondence** — earnings enquiries, benefit verification, and correspondence tied to
suspensions — and built that way in [06](06-admin-department.md).

Deliberately built so a wrong reading is cheap: the **body** is a fixed list (DWP, HMRC, Home Office,
tribunal, local authority, SIA, other) and the **kind of matter is free text**, so an enquiry we have
not seen before is a row rather than a migration. If it turns out to mean something else entirely, it
costs a label and not the workflow.

> **Answered: yes, the DWP reading is right. Details to be confirmed later.**

Built as described. The free-text matter type means a kind of enquiry we have not met yet is a row
rather than a migration, so "details later" costs nothing.

### E14 — Are £250 and £2,000 the right approval thresholds? — **answered**
The agreed starting figures, held as settings (`admin.approval.low_threshold_pence`,
`admin.approval.high_threshold_pence`) rather than constants, so changing them is an edit with an
event against it and no release. Only higher management may change them, and requests already raised
keep the chain they were raised with.

> **Answered: yes, and they can be changed later if they need to rise.**

Which is why they are settings. Changing one is an edit with an event against it and no release, and
requests already raised keep the chain they were raised with — so raising a threshold next year does
not rewrite the approvals that happened under the old one.

One thing to watch rather than act on: whoever can change a threshold should not be the same person
approving just above it. Today `threshold.change` is higher management only, and so is the top rung —
which means the Portal Owner could in principle raise the threshold and then approve under it. The
event log names both, so it is visible rather than silent, but if that ever matters the fix is to
require a second signature on a threshold change.

### E15 — Cover when the Finance Officer is away — **answered and built**
Designed, not built: a **time-boxed delegation to a named person**, recorded with its start and end
date. The alternative — a silent fallback to "anyone in higher management" — would widen who can
spend money every time somebody takes leave, which is the opposite of the control.

> **Answered: Mr Shahzad deputises.**

**Built.** A delegation is a named person, for a named period, with an end date that cannot be left
off — `RoleDelegation` in the schema, the rules in
[`lib/auth/delegation.ts`](../../lib/auth/delegation.ts), and the screen on `/system`. Not
open-ended, per the recommendation: 90 days maximum, and renewing leaves a second record.

Recorded here and **nowhere in the code**, like E11. The deputy is a row somebody grants, not a name
compiled into the build, so it can change without a release.

The property worth knowing, and it is tested: a delegation relaxes **no** separation rule. Somebody
holding higher management in their own right and Finance Officer by delegation can sign the Finance
rung of a large payment and then **cannot** sign the higher-management rung after it — the database
indexes the approver, not the role. So lending the role covers the absence without collapsing the
two-signature control, which was the whole worry. Anything approved while a delegation was in force
stays on the record with the delegation named, which is why it is revoked rather than deleted.

### E16 — What is the in-built messaging actually for? *(from E5)*
> **Question 1 answered: it replaces the WhatsApp groups.**

That raises the bar rather than lowering it. If it replaces them, it has to be good enough to be the
only channel — because the fallback, once the groups are wound down, is the telephone. Two things
follow that were not true of a messaging feature sitting alongside WhatsApp:

- **It needs a wind-down, not a launch.** A date, the groups archived, and people told. Two channels
  running in parallel means the platform's copy is the incomplete one.
- **It cannot reach a no-signal post** (E10). On those posts the client-held model is the answer, and
  it is not a degraded version of messaging — it is a different mechanism. Wind the groups down
  knowing that.

Still open, and all four change the build rather than the styling:

1. **Is a message ever the record of a check call?** `ContactChannel.app` exists and is rated above
   SMS, so it can be. If yes, an officer's "all well" message satisfies the hourly call and the
   ladder stops — a real operational change that needs Control's agreement, not just ours.
2. **What is the helpdesk?** A queue with a service level and named owners, or a shared inbox? A
   queue is Work-engine items and already half-built; an inbox is something else. Note the helpdesk
   already has a job in the E10 process — it is the desk that emails the client — so it exists as a
   function whether or not it becomes a queue.
3. **How long are messages kept?** They will carry welfare and health-adjacent detail. Retention has
   to reach them, which means a rule per conversation type, and it is the main reason building this
   beats staying on WhatsApp.
4. **Group or one-to-one?** A per-site group is the WhatsApp habit. It also means every officer on a
   site sees every message about it.

### E17 — What exactly can a client see? *(from E7)*
> **Officer identity agreed: name and SIA number where the contract requires it, nothing more.**

Recorded as the rule. It still belongs in the E6 data-protection review, because agreeing it and
having a lawful basis for it are different things — but the scope is now settled, and it is the
narrowest version that still works commercially.

Note it interacts with E10: on a no-signal post the client is holding contact with a named officer on
the site phone, so they necessarily know who that officer is. The rule above already permits that,
which is the right answer, but it means the no-signal process is a live example of officer identity
reaching a client rather than a hypothetical one.

Still open:

1. ~~**Officer identity**~~ — answered above.
2. **Inspections: results, or only the report?** Do they see a failed inspection and the corrective
   action still open, or only completed reports? The honest answer is more useful commercially and
   harder to swallow the first time it happens.
3. **Can a client raise a requirement directly?** If yes, that bypasses the Control pool check, which
   is where the timestamped handover to HR comes from. Recommendation: they raise a *request*, Control
   turns it into a requirement — same two-track pattern as Admin.
4. **Which client contacts, and who grants them?** A client portal user is an account somebody must
   create, review and revoke when a contact leaves that client. That is a real ongoing task, not a
   one-off setup.
5. **Live, or as-at?** Seeing the live board for their own site means seeing a no-show as it happens.
   Commercially brave. Worth deciding deliberately rather than discovering.

## Still open from the HR scope

Three items remain in [`docs/proposal/07`](../proposal/07-open-questions.md), and **none of them
blocks the build**:

- **C16** — which clients or posts involve contact with children or vulnerable adults, and what
  level of disclosure is obtained (clause 7.7j, Note 6). Real compliance work, currently
  unspecified. The schema carries the `regulatedActivity` flag ready for it
- **C18** — whether the contract wording making confirmation conditional on screening is signed off.
  A document to sign; no amount of software substitutes for it (clause 7.5.2)
- **C13 follow-up** — a setup task rather than a question: load each higher-management training
  record with the date it was last *reviewed*, because clause 6.2 asks for an annual review and
  "completed" carries no date

Answered and now implemented:

| # | Answer | Where it lives in the build |
|---|--------|-----------------------------|
| C13 | Higher management hold the required certifications and training | `lib/roles.ts` — `canGrantRole` refuses a screening role without in-date training |
| C14 | 12 months for unsuccessful applicants, 7 years for leavers, every deletion logged | `lib/bs7858.ts` — `RETENTION`; `prisma/schema.prisma` — `DisposalRecord`, append-only |
| C15 | The portal fully replaces INDEL | E1 above |
| C17 | Withdrawn — no INDEL integration required | Removed from the plan |
| C21 | The portal is the single source for SIA, right to work, visa and all compliance information | The register in [document 02 §3](02-shared-engines.md#3-the-single-source-of-truth-register) |
