# 04 — Decisions needed

The HR decisions are logged in [`docs/proposal/07`](../proposal/07-open-questions.md) as A–D, and
still stand. The wider scope creates these. They are numbered **E** so the two lists never collide.

Answered ones stay in the log with the answer, because the answer is the reason the code is the way
it is. The ones that block a release are marked; the rest can be answered as the build reaches them.

## Answered

### E1 — INDEL — **parked**
Whether the platform eventually replaces, integrates with, or simply coexists with INDEL is set
aside, at the client's direction, and nothing in this plan depends on it. We are building the
platform's own scheduling, book-on and check-call capability. Revisit when there is something
running to have the conversation about. See
[document 01 §4](01-scope-and-domains.md#4-a-note-on-indel).

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
> After one hour, if the officer has not given the check call, it starts triggering. Then we take
> further measures to get in contact. If we cannot reach them, a person from the operational team
> goes to site to check everything is okay.

Implemented exactly as stated, in `lib/core/ops.ts`:

| Step | Trigger | Who acts |
|------|---------|----------|
| — | Check call received | Nothing. Clock restarts |
| 1 | One hour with no check call | Control tries the officer — own mobile, then the site phone |
| 2 | Contact still not made | Control widens it — site phone, other officers on site, the client's on-site contact |
| 3 | Contact cannot be made | **A member of the operational team attends site** |

**Two intervals are assumed rather than confirmed**, because the process says "further measures"
without naming a time: 15 minutes from step 1 to step 2, and 30 minutes from step 1 to someone
setting off for site. The second one is worth agreeing deliberately — it is the point at which this
stops being an administrative problem and becomes a welfare one. Both are single values in one file
and become Admin settings, so changing them is not a release.

One open option, not an assumption we have made: whether a **lone-working post** should have a
shorter ladder than a post with several officers on it. The rule above is currently applied
identically to both.

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
Not a migration question — just: on day one of R1, which officer and candidate records should
already be in the platform, and where do they come from? The spreadsheets are the obvious source.
Worth listing the fields before the schema is fixed rather than after.

### E10 — Signal at the posts
E3 settles what officers use. What is left is whether the posts themselves have usable mobile signal,
because that decides how much has to work offline — and it is the reason the site phone matters as
more than an evidence upgrade.

### E11 — Who owns the platform?
One named person who makes the calls during the build. This supersedes D5, which asked the same
question about the smaller portal. Without it, every decision here waits for a meeting.

### E12 — What is it called?
"HR Portal" no longer describes it. Worth naming before people start referring to it by module.

## Still open from the HR scope

Carried over unchanged from [`docs/proposal/07`](../proposal/07-open-questions.md), because they
block R1:

- **C13** — training evidence for whoever administers the controllers' own screening files (clause 6.2)
- **C14** — current retention practice, and how disposal is recorded (clause 11)
- **C16** — which clients or posts involve contact with children or vulnerable adults, and what level
  of disclosure is obtained (clause 7.7j, Note 6)
- **C18** — whether the contract wording making confirmation conditional on screening is signed off
- **C21** — now answered by the register in [document 02](02-shared-engines.md#3-the-single-source-of-truth-register):
  **the platform owns the compliance expiry dates**, and they are held in one place only
