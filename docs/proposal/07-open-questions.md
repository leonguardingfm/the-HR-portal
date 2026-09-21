# 07 — Open Questions

Grouped by how much they block the build. Nothing here is an assumption — each item is something
the process description and the two supporting documents do not settle.

> **Standing note on names.** This document records who answered what and when,
> so some answers name individuals. Those are *current* assignments, not fixed
> policy: nothing about who is on which team, or how many people each team has,
> is compiled into the portal. Roles are assigned in Admin and the
> separation-of-duty rules are written as conditions on whoever holds them, so
> a new starter or an internal transfer is an edit rather than a release. See
> [01 §4](01-process-and-compliance-review.md).

## Answered — 18 September 2026

All eight blocking questions came back. Recorded here as the decision log; the design documents
have been updated to match.

| # | Question | Answer |
|---|----------|--------|
| A1 | Are officers deployed before screening? | **No.** Deployment happens only after initial screening. The single element that runs afterwards is **five-year career-history verification**, completed within the 12 weeks the standard allows. Everything else is done before anyone goes to site — which on the criminality element is stricter than the standard's minimum. |
| A2 | 5-year or 10-year? | **Five years**, so a **12-week** clock on every file. The 10-year path stays available but unused, since the period must be extended for contractual or insurer reasons [7.3.2b, Clause 1 Note 2]. |
| A3 | In-house or outsourced? | **In-house.** Clause 6.3 does not apply. Clauses 6.1 and 6.2 — screening the screeners, NDAs, annual training review — are ours directly. |
| A4 | Who is responsible? | Recruitment and vetting sit with different people, which is the separation clause 6.1 asks for. **Current** assignments were given by name; see the standing note below. |
| A5 | Who is top management for approvals? | Named, for risk acceptance, deadline extensions and statutory declarations. |
| A6 | Does Casper capture everything 7.3.2 needs? | **Yes, and the form can be changed.** Worst case avoided. |
| A7 | Move consent into the application form? | **Not needed.** Consent is already in the Casper form (A6), and the Welcome Pack comes back signed the same day or the next. |
| A8 | Does Casper have an API? | **Yes.** The most valuable integration is available. |

### What those answers changed

- **The 12-week clock now covers one well-defined piece of work** — five-year history verification
  — rather than an open-ended set of checks. That makes it forecastable and staffable, and it is
  what the clock board in the portal now measures.
- **Two gates became three states:** everything-but-history before deployment, then history within
  12 weeks, then confirmed employment. The portal models the deployment gate separately from the
  standard's own conditional-employment gate, because ours is stricter and that distinction should
  not blur.
- **Casper integration moves from "biggest unknown" to a Phase 2 item**, and with it most of the
  duplicate typing disappears earlier than planned.

### What they raised

**C10**, already open, is now more pressing: the Employment Contract is signed before history
verification completes, so its wording is what makes that sequence defensible.

## Also answered — 18 September 2026

| # | Question | Answer |
|---|----------|--------|
| B5 | Is an interview held, by whom, and is it recorded? | Superseded by the fuller answer of 18 September — see the corrections table below. There are **three** stages, not two. |
| C11 | Who screens the controllers? | **Higher management administers the controllers' own files.** The controller then falls to another controller, since the administrator is excluded from reviewing and the subject from both. Every combination satisfies 6.1 and 7.5.2b, and no external provider is needed. |

### What these changed

- **Gate 1 now enforces clause 7.3.4.** It was the one requirement in the standard that nothing in
  the portal checked. The blocking reason reads "Final interview not yet held (7.3.4)".
- **The pipeline gained a stage.** Initial interview and final interview are separate, so the
  funnel shows where candidates actually sit rather than collapsing both into "interviewed".
- **People and roles is now a real screen** on Admin, with the grant check computed rather than
  asserted — a screening role cannot be granted without own screening, a confidentiality agreement
  and in-date training, and the grant lapses when the annual review does.
- **A division-of-functions check came for free.** Interviewing and file control sit with different
  teams, so no controller ordinarily signs off a candidate they interviewed. The portal verifies
  this per file and records an exception rather than blocking, per clause 6.1's "particular
  attention" wording.

### What these raised

Administering files makes whoever does it **a person engaged in screening**, so clauses 6.1 and 6.2
apply to them directly: screened themselves, a confidentiality agreement covering employment and
post-employment, and training on the standard, data protection law and relevant regulatory
requirements — **recorded and reviewed at least annually**. The portal will not grant the
administrator role without those on file. New item **C13** below.

It is also worth noting the concentration of roles where one person interviews, accepts risk,
approves extensions, and administers the vetting team's files. The standard does not forbid it, and
top management is explicitly the party that accepts risk [7.4f]. The mitigation is already in place
— controllers review what higher management administers, and nobody controls their own file — and
it is worth revisiting as the team grows.

## B and C answered — 18 September 2026

All of section B, and C1 to C9, came back. Several corrected assumptions in the
earlier documents rather than merely filling gaps.

### The corrections that matter

| What we had | What is actually true |
|-------------|----------------------|
| "Indeed profile created for each officer — unusual, clarify" | It is **INDEL**, Leon's internal system, and the current system of record for personnel, compliance and operational data. Not Indeed at all. The question was built on a misreading. |
| "Watch List — possibly a spreadsheet the portal should replace" | It is the **SIA website**, checked **twice daily** to catch officers who have gone inactive. Not something to replace — something to **automate**, since the portal already holds every licence number. |
| "Maps — possibly a spreadsheet" | **Google Maps**, used by Control to see officer areas for shift deployment. |
| "Control Alpha / Bravo may split by client, geography or contract" | Neither. The split is **workload and communication** — each team runs its own WhatsApp group, and one group cannot hold that many officers without things being missed. So control is a property of the officer, not of the client, and the two teams can be rebalanced freely. |
| "An interview is held, by whom?" | **Three stages**: first by Recruitment on the phone, second by the HR Manager on site or by video, and an **additional stage where a particular client requires one**. Our earlier note of "optional initial, mandatory final" was close but wrong in both directions. |

### The rest of section B

| # | Question | Answer |
|---|----------|--------|
| B2 | PIN — purpose and format? | A unique identifier per officer, linked to the officer and their site. **No two officers may share one**, so the portal generates and controls allocation. Some sites also issue their own **PRN**; we supply the PIN and the site records the PRN against it. |
| B4 | New Recruit Onboarding Group? | An internal **WhatsApp management group** that tells Control a new officer is on. HR posts the details so Control can contact them and fit them to shifts. The portal replaces it with an automatic notification to the right Control team. |
| B6 | What are the "online history checks"? | In order: **SIA licence and status**; **right-to-work share code**, checked independently by HR where immigration status applies; then, after the Welcome Pack is signed, **Creditsafe**, **UK sanctions** and **OFAC sanctions**. All before operational deployment. |
| B8 | System of record for the officer pool? | **INDEL** is authoritative today, with the SIA site, Google Maps and Google recruitment sheets as supporting tools. The answer adds that the new portal *should become* the primary source of officer data — see the scope question below. |
| B9 | Credit reference agency? | **Creditsafe**, on Leon's own account, run manually by HR with the officer's consent taken first. The portal records completion and retains the outcome. |
| B10 | How are WhatsApp enquiries retained? | They are **not** the formal record. WhatsApp is a first-contact channel; the completed Casper application is the authoritative recruitment record. That removes most of the data-protection concern we raised. |
| B11 | Right-to-work follow-up? | Yes. Visa expiry recorded at onboarding, **INDEL alerts one month out**, HR chases by email and WhatsApp, and **no further shifts** may be assigned until updated evidence is verified. A daily report tracks status across the workforce. |

### Section C

| # | Answer |
|---|--------|
| C1 | **Yes** — BS 7858 screening can be demonstrated for every deployed officer. No retrospective backlog to carry. |
| C2 | All officers screened under **BS 7858:2019**, none under an earlier edition. |
| C3 | **No subcontractors or agency officers.** Clause 8 does not apply. |
| C4 | Ancillary staff **are** screened. |
| C5 | The **data protection officer** owns secure disposal. (Partial — see below.) |
| C6 | Confidentiality agreements in place; training records maintained with an annual review. |
| C7 | **Yes — some posts bring officers into contact with children or vulnerable adults.** See below; this is new work. |
| C8 | No insurer requirements beyond BS 7858. |
| C9 | **SIA ACS approved** (not NSI). |
| C10 | **Partially compliant, and the contract needs amending** — see below. |
| C11, C12 | Answered previously: higher management screens the controllers; both vetting staff are trained for both roles. |

### Three things these answers opened

**C7 — regulated activity.** Some posts involve contact with children or
vulnerable adults, which may call for a higher level of disclosure [7.7j,
Note 6]. Nothing in the proposal covered this, because we had assumed not. The
portal now carries a `regulatedActivity` flag per client and an enhanced
disclosure check on the screening file, which applies only where the flag is
set. **To confirm:** which clients or posts, and what level of disclosure is
being obtained today.

**C10 — the contract.** The current wording requires screening in accordance
with BS 7858 during probation and allows termination in probation, but it does
**not** say that confirmation of employment depends on satisfactory completion
of full screening within the permitted period, nor that conditional employment
ends if it does not [7.5.2]. Since the contract is signed before history
verification completes, that wording is what makes the sequence defensible.
**This is a document to amend, not a portal change** — the portal cannot fix it.

**C5 — retention, partially answered.** We know who is responsible. We still do
not know whether unsuccessful applicants are disposed of at 12 months, whether
leavers' records go at 7 years, or whether disposal is recorded [11.1, 11.3].
Carried forward as C14.

### A scope question the answers raise

B8 says INDEL is the system of record **and** that the new portal should become
the primary source of officer data. Those are two very different builds:

- **Portal as the recruitment and vetting system**, writing to INDEL through its
  API. INDEL stays authoritative for shifts, compliance monitoring and expiry
  alerts. This is what the proposal costs and phases assume.
- **Portal replaces INDEL** as the officer system of record, which means taking
  on shift assignment, compliance monitoring, expiry alerting and the daily
  reports INDEL produces today.

The second is a materially larger programme. **Settled as the first** — see C15
above. The portal is the recruitment and vetting system, and hands the officer
over to INDEL at onboarding.

## C10 and C15 answered — 19 September 2026

| # | Question | Answer |
|---|----------|--------|
| C10 | Does the contract make confirmed employment depend on screening completing within the permitted period? | **Yes — confirmation depends on satisfactory completion within the permitted period, and conditional employment ends if it does not.** |
| C15 | Does the portal replace INDEL, or write to it? | **Superseded.** First answered "replace it", then scoped back on 19 Sept: *do not replace INDEL completely — take the HR part and build that*. Boundary in [document 08](08-officer-system-of-record.md). |

### C10 — one thing to close out

The position is now confirmed, and it is the right one: it is what makes signing
the contract before history verification completes defensible [7.5.2].

But the earlier, fuller answer to this question said the **current wording does
not expressly state it** and that the contract therefore needs amending. Those
two answers are only compatible if this one is read as *"yes, that is how it
should work"* rather than *"yes, the contract already says so"*. We have taken
it the first way, because taking it the second way and being wrong would leave a
real hole.

**So the remaining action is on the document, not the portal:** amend the
contract so the condition is explicit, and confirm when that is signed off.
Tracked as **C18**. The portal enforces the rule either way — it is what Gate 3
and the clock already do — but the portal cannot make a contract say something
it does not say.

### C15 — settled: the HR part only

First answered as "replace INDEL", then scoped back the same week to **take the
HR part and build that**. The right call, and the analysis in
[document 08](08-officer-system-of-record.md) is what shows why: replacing
INDEL outright would have added shift assignment, which is a different
application used by Control to the hour, to fix a problem that is entirely on
the HR side.

**Where the line sits.** The portal owns candidates, the recruitment pipeline,
screening files, the clock, the gates, onboarding, and the documents and expiry
chasing that hang off them. INDEL keeps shift assignment, operational
deployment and the officer's running operational record. The boundary is the
handover at onboarding.

One thing still to agree: **who owns the compliance expiry dates** — SIA
licence, right to work, visa. The portal needs them because the chasing is HR
work; INDEL alerts on them today; running both invites drift. Recommendation is
the portal owns them and INDEL reads them. **C21** below.

## A. Blocking — answered above, kept for the record

| # | Question | Why it blocks |
|---|----------|---------------|
| A1 | **Are officers ever deployed to a client site before any screening has been done?** In the process as written, the online history checks and the Casper hire happen in the same step, after the contract is signed. | Determines whether the portal enforces the BS 7858 order (checks → conditional offer → deployment) or has to accommodate the current order. This is the single most important question in this document. See [01 §3.1](01-process-and-compliance-review.md). |
| A2 | **Do we screen to 5 years or 10 years?** Any client contracts or insurers requiring 10 years or an extended period? | Drives the 12-week vs 16-week clock [7.6], and needs capturing on the requirement at the point Control raises it. |
| A3 | **Is vetting done in-house or outsourced?** The acceptable-documents guide provided is from Staffvetting.com. | If outsourced, we still retain ultimate responsibility and our controller must review the completed file [6.3] — which is an extra step in the workflow, not a removed one. |
| A4 | **Who is the named screening controller, and who are the administrators?** | The permission model, the sign-off gates and the four-eyes rule all need real names. These people must also be screened and trained themselves [6.1, 6.2]. |
| A5 | **Who counts as top management / authorised persons** for risk acceptance, extension approval and statutory declarations? | Three approval queues need a named, short list [7.4f, 7.6, 7.7i]. |
| A6 | **Does the Casper application form collect everything clause 7.3.2 requires, and can we change it?** Full list in [01 §3.6](01-process-and-compliance-review.md). | If the form cannot be changed, the portal needs its own supplementary form, which is a materially different build. |
| A7 | **Can we move the Declaration & Consent from the Welcome Pack into the application form?** The standard explicitly permits this [7.3.2, Note 6]. | Without it, checks cannot legitimately start until the Welcome Pack comes back signed, which costs days on every single candidate. |
| A8 | **Does Casper have an API, or at least a structured export and import?** | The most valuable integration and the biggest unknown. Determines whether onboarding is automated or remains a tracked manual step. |

## B. Needed before the relevant module is built — all answered

Every item in this section came back on 18 September 2026 and is recorded above.
Five of them corrected an assumption rather than filling a gap, which is why the
table above leads with the corrections.

## C. Compliance scope — needed for a complete picture

| # | Question |
|---|----------|
| C1 | **Can we demonstrate BS 7858 screening for every officer currently deployed?** If not, retrospective screening is required [7.1, Clause 10], and the portal will need to carry that backlog as tracked work. |
| C2 | **Are there officers screened under BS 7858:2012 or earlier?** They need not be re-screened, but only if evidence of the previous screening can be clearly demonstrated [7.1, Note 3]. Can it? |
| C3 | **Do we use subcontractors or agency officers?** If so, do we hold the evidence Clause 8 requires — UKAS-accredited certification covering BS 7858 or SIA Approved Contractor status, **plus a written statement that the specific individuals supplied were screened** — and do we track its expiry? |
| C4 | **Are ancillary staff screened?** Office, admin, maintenance and cleaning staff with access to sensitive information, assets or equipment should be [Clause 9]. And do we have procedures preventing unscreened people from getting that access? |
| C5 | **What is our current retention practice?** Anything disposed of at 12 months for unsuccessful applicants, or 7 years after leaving [11.1, 11.3]? Is there a secure disposal step and a record of it? |
| C6 | **Have the screening controller and administrators signed confidentiality agreements** covering employment and post-employment [6.1], and are training records maintained with an annual review [6.2]? |
| C7 | **Do any posts bring officers into contact with children or vulnerable adults?** A higher level of disclosure may be needed [7.7j, Note 6]. |
| C8 | **Do our insurers impose requirements beyond BS 7858** — a longer screening period, or additional checks [Clause 1, Note 2]? |
| C9 | **Are we NSI or SIA ACS approved?** This affects audit expectations and what evidence the portal should be able to produce on demand. |
| ~~C10~~ | ~~Does the employment contract currently state~~ that confirmed employment depends on satisfactory full screening within the period allowed, and that conditional employment ends if it does not complete [7.5.2]? If not, the contract needs amending, not just the portal. **Now more pressing:** A1 confirms the contract is signed before history verification completes, so this wording is what makes that sequence defensible. |
| ~~C11~~ | ~~Who screens the controllers?~~ **Answered:** higher management administers their files, so the review falls to another controller. See [01 §4.1](01-process-and-compliance-review.md). |
| ~~C12~~ | ~~Are the vetting staff recorded as competent in both roles?~~ **Answered:** yes, with training records maintained and reviewed annually [6.2]. |
| ~~C13~~ | ~~Is higher management's clause 6.2 training recorded?~~ **Answered 21 Sept 2026:** all higher-management personnel have completed the required certifications and training. That closes the gap created by higher management administering the controllers' own files. **One thing the portal still needs from it:** a *date*. Clause 6.2 asks for training to be reviewed at least annually, so the record has to be "reviewed on <date>", not "completed" — `canGrantRole` blocks a screening role once that date passes 12 months. Loading the dates is a setup task, not an open question. |
| ~~C14~~ | ~~Retention practice?~~ **Answered 21 Sept 2026:** unsuccessful-applicant records are securely disposed of after 12 months, leaver records after 7 years, and **every deletion is recorded in the disposal log** [11.1, 11.3]. Note that this is slightly wider than the standard: 11.1 sets 12 months for applicants unsuccessful *at preliminary checks*, and the policy applies it to all unsuccessful applicants. Simpler and stricter, so it is the rule the portal implements. The disposal log is now a table (`DisposalRecord`), append-only, holding what was destroyed, under which rule, by whom, and what was deliberately kept instead. |
| ~~C15~~ | ~~Does the portal replace INDEL, or write to it?~~ **Answered 21 Sept 2026: the portal will fully replace INDEL.** That is the end state, and it is consistent with the direction to stop weighing migration against integration — nothing in the build depends on INDEL, and the replacement happens by the platform covering the ground rather than by a cutover project. What INDEL holds that should be loaded at the start is E9 in [platform/04](../platform/04-decisions-needed.md). |
| C16 | **Which clients or posts involve contact with children or vulnerable adults, and what level of disclosure is obtained for them today?** C7 confirms some do [7.7j, Note 6]. |
| C18 | **Has the contract been amended so the condition is explicit, and when is it signed off?** The position is confirmed; the wording was previously reported as not stating it. See C10 above. |
| ~~C19~~ | ~~Who rosters, and where?~~ **Closed by the rescope:** rostering stays in INDEL. |
| ~~C20~~ | ~~A field-level inventory of INDEL?~~ **Closed by the rescope:** no migration, so no inventory needed — only the onboarding handover. |
| ~~C21~~ | ~~Who owns the officer's compliance expiry dates?~~ **Answered 21 Sept 2026: the portal is the single source** for SIA licences, right-to-work evidence, visa expiry dates and all other compliance information. One place, one reminder rule, nothing running alongside. This is the register in [platform/02 §3](../platform/02-shared-engines.md#3-the-single-source-of-truth-register) confirmed rather than recommended. |
| ~~C17~~ | ~~Does INDEL expose an API?~~ **Withdrawn 21 Sept 2026.** No continuing INDEL integration is required, so the question has nothing hanging off it. |

## D. Preferences — answered

| # | Question | Answer (18 Sept 2026) |
|---|----------|-----------------------|
| D1 | Candidate self-service portal? | **Yes.** Candidates log in and upload documents; HR sees what has arrived and what is missing and prompts from there. Explicitly wanted to cut the email back-and-forth — so this moves from Phase 4 to **Phase 2**, alongside the validation that makes it work. |
| D2 | E-signature for the Welcome Pack? | **Yes**, with signing status visible so outstanding packs are obvious. Moves to **Phase 2**. |
| D3 | Replace the spreadsheets outright? | **Yes**, with a **short transition** where the portal exports to them until confidence is there, then they stop. |
| D4 | Users and mobile access? | Candidates, Control and officers, and **mobile access is required** — particularly Control and officers away from a desk, and candidates uploading from a phone. Must scale as candidate numbers grow. |
| ~~D5~~ | Portal owner? | **Answered 21 Sept 2026. Portal Owner: Muhammad Shahzad. Operational Lead: Tanveer Mahmood.** Build decisions route to the portal owner; anything about how Control and the operations team actually work routes to the operational lead. Recorded here and nowhere in the code — who holds which *role* in the platform stays data, set up in Admin. |
| D6 | Social media / open-source checks? | **No.** Agreed they sit outside the standard and carry discrimination and consistency risk. Left out. |
| D7 | Hosting and data residency? | **UK hosting, UK data residency.** As assumed. |

**What D changed.** Self-service and e-signature moving to Phase 2 is the
significant one: together they remove most of the document chasing rather than
automating it, and D1 is explicit that the point is to cut email traffic.
Mobile is now a requirement rather than a preference, which affects every screen
rather than being a later pass — the build has been checked at phone width from
the start for that reason.

## What is left

Sections A, B and D are answered. In C, everything is answered except three
items, and none of them blocks the build:

| # | What it needs | Who |
|---|---------------|-----|
| **C16** | Which clients or posts involve contact with children or vulnerable adults, and what level of disclosure is obtained for them. C7 confirms some do, so this is real compliance work that is currently unspecified [7.7j, Note 6]. | Operational lead, with the vetting team |
| **C18** | The contract amendment making confirmation conditional on satisfactory screening, signed off. A document to sign; the portal cannot cover for it [7.5.2]. | Portal owner |
| **C13 follow-up** | Not a question — a setup task. Load each higher-management training record with the date it was last *reviewed*, so the annual review under 6.2 is measurable. | Portal owner |

Everything else has moved into the platform decision log as the E-series, in
[`docs/platform/04`](../platform/04-decisions-needed.md). The one still blocking
a release is **E2**: what availability the operation needs, and what Control
does during an outage.
