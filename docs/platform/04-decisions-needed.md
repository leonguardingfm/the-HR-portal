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

### E5 — Telephony and messaging
SMS and voice cost per message, and which provider. It sets the reminder design: a chaser ladder is
free by email and not by SMS.

### E6 — Data protection
The scope now covers screening data, health-adjacent welfare records and possibly location. A DPIA is
very likely required, the lawful basis for location needs stating, and retention needs extending
across the new domains. Worth a data-protection review before R3, not after.

### E7 — Do clients get access?
A client portal — seeing their own site's inspections, reports and officer compliance — is a strong
commercial feature and a large amount of care about permissions. In or out?

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

### E10 — Signal at the posts
E3 settles what officers use. What is left is whether the posts themselves have usable mobile signal,
because that decides how much has to work offline — and it is the reason the site phone matters as
more than an evidence upgrade.

### E11 — Who owns the platform? — **answered**
> **Portal Owner: Muhammad Shahzad. Operational Lead: Tanveer Mahmood.**

Two routes, which is better than one: build decisions, scope and sign-off go to the portal owner;
anything about how Control and the operations team actually work goes to the operational lead. The
Control discovery session ([document 05](05-control-discovery.md)) is the operational lead's to
convene.

Recorded here and **nowhere in the code**. Who holds which *role in the platform* stays data, set up
in Admin, so a transfer is an edit rather than a release — `lib/roles.ts` contains no names by
design. This supersedes D5.

### E12 — What is it called?
"HR Portal" no longer describes it. Worth naming before people start referring to it by module.

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
