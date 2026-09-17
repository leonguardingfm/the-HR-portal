# 05 — Automation and Integrations

## 1. Where the manual effort actually goes today

Before proposing automations, it is worth naming the four things that consume the time:

1. **Re-typing the same person into several places.** Interview Sheet, Recruitment Sheet, Watch
   List, Maps, Casper, Indeed. One person, six entries, six chances to introduce an error.
2. **Chasing.** Missing application fields, missing documents, missing signatures, silent
   employers. All of it by hand, all of it dependent on someone remembering.
3. **Re-requesting documents that were wrong.** A document is uploaded, reviewed days later,
   rejected for a reason the candidate could not have known, and requested again. This is the
   loop that makes applications take weeks.
4. **Working out where things stand.** Reading across spreadsheets to answer "is this officer's
   file finished?" or "what is outstanding on this requirement?"

Every automation below targets one of those four. That is the test for whether it is worth
building.

## 2. Automations the portal can do entirely on its own

No integration needed. These are available from day one and account for most of the benefit.

### 2.1 Eliminating re-typing

| Automation | What it replaces |
|------------|------------------|
| One candidate record flowing through every stage | Re-entry into Interview Sheet, Recruitment Sheet and Watch List |
| Sheets become saved views and filters on that record | Maintaining four spreadsheets in parallel |
| **SIA-badge name derived from the verified register result** | Retyping the name "exactly as shown on the SIA badge" and getting it subtly wrong |
| **Automatic PIN allocation** from the next free number | Manual PIN assignment and the risk of a clash |
| Requirement fields pre-filled from the client and site records | Re-entering client details per requirement |
| Candidate-facing forms pre-filled from what we already hold | Asking people for information they have already given us |
| One-click export in the exact column layout of any legacy sheet | The "but I need it in the spreadsheet" objection, without keeping the spreadsheet |

### 2.2 Duplicate and history checks

Runs automatically as a name is typed, before a record is created. Matches on NI number, SIA
licence, email, phone, and fuzzy surname + date of birth, and surfaces previous employment,
previous applications, open applications, and any recruitment email already sent to that person.
Full design in [document 02 §4](02-portal-structure.md).

This replaces three manual lookups per shortlisted candidate and is the single highest-value
automation relative to effort.

### 2.3 The reminder and chaser engine

The portal owns every deadline, so it should own every reminder.

| Reminder | Trigger | To whom |
|----------|---------|---------|
| Application not returned | +3 days, +7 days, escalate +14 | Candidate, then recruiter |
| Missing information or documents | 48h after the gap is identified, then every 3 working days, **max 3 attempts** | Candidate, then escalate |
| Signed documents outstanding | 48h, 5 days, escalate at 10 | Candidate, then recruiter |
| Employment reference not returned | 2nd request at +10 working days, documentary route at +20, escalate at +30 | Verifier, then candidate, then controller |
| Screening clock | 50% amber, 75% red, 90% critical | Vetting admin, controller, then management |
| SIA licence expiry | 90 / 60 / 30 days | Officer, Control, Recruitment |
| Right-to-work follow-up | 60 / 30 days before time-limited leave expires | Recruitment |
| Training review due | Annually [6.2] | Vetting team, management |
| Records due for disposal | 12 months (unsuccessful) and 7 years (leavers) [11.1, 11.3] | Administrator, with a controller-approved disposal action |
| Daily digest | Every morning | Each owner, their own overdue and due-today items |

Two design rules worth agreeing up front. **Chasers stop themselves** — when the document arrives,
the chaser sequence cancels, which is how we avoid the classic "we asked you three times for
something you already sent" failure. And **chasers are capped**; after the third attempt the
portal escalates to a human rather than continuing to email.

### 2.4 The missing-document engine — the big one

This is what kills the re-request loop, and it is entirely internal.

- The portal derives **exactly which documents this candidate needs** from their own declared
  history: each employment period, each gap over 31 days, each period abroad, each period of
  self-employment or benefits, plus identity and address.
- It generates **one personalised checklist** — "for Jan 2019 to Dec 2021 with Acme Ltd we need one
  document dated around Jan 2019 and one dated around Dec 2021, and they must be different types"
  `[SV]` — instead of a generic list the candidate has to interpret.
- It **validates at the point of upload**: document type, that the two documents for a period are
  different types, that the dates fall at the start and end of the period, and address-document age
  limits (3 months for bank, credit card, utility and benefit statements; 12 months for council
  tax, HMRC documents, P45/P60 and mortgage statements) `[SV]`.
- It tells the candidate immediately why something will not be accepted, while they are still
  sitting at their computer with their documents open.
- It **calculates gap coverage automatically**: total unverified days, every gap over 31 days
  highlighted, and eligibility for the statutory declaration route (one unverified period of six
  months or less in the recent five years) computed rather than judged by eye [7.7i].
- It includes the PAYE self-download instructions for periods where a reference is not coming
  `[SV]`.

### 2.5 Status, gates and audit

- Stage advances automatically when its checklist completes — no one "updates the tracker".
- Gates 1 and 2 enforced in the data layer, with the blocking reason shown in plain English.
- Clock computed from the screening period, and the cease-employment date displayed prominently as
  the standard requires [7.2].
- Conditionally-employed files flagged distinctly from other files [7.2a].
- Verification progress sheet generated from the file — not maintained separately [7.8, Form 2].
- Every reference request logged with its 1st and 2nd request dates, which is also the evidence
  needed to justify an extension [7.6].
- Append-only audit log, including **reads** of screening files.
- Exception routing: risk acceptances and statutory declarations to top management automatically,
  with the evidence already attached.
- Retention clocks with a controller-approved secure-disposal step.

### 2.6 Templates and generated documents

Email and letter templates for every stage, merged from the record so nobody retypes a name or a
date: application invitation, information request, document chaser, reference request, chaser
letter, Welcome Pack cover, offer letter, statutory declaration request, disposal notice. All
outbound messages stored against the candidate, which is what makes "has this person already been
emailed?" a fact rather than a recollection.

## 3. Automations that need an integration

Realistic view of each, including where the answer is "there is no API and there never will be".

| System | What we would automate | Feasibility |
|--------|------------------------|-------------|
| **Casper** | Pull submitted application data into the candidate record, so nothing is retyped; push the hire at onboarding; sync officer records | **Depends entirely on whether Casper exposes an API or export.** This is the most valuable integration and the biggest unknown — see document 07. Fallback: scheduled CSV import/export, or a tracked manual step with a link |
| **Indeed** | Pull new applications into the sourcing queue; post adverts; create officer profiles | Indeed offers partner APIs but access is limited and depends on the account type. Likely partial. Fallback: a structured import from the Indeed dashboard export |
| **Email (Microsoft 365 / Google Workspace)** | Send every templated message and chaser from a real HR mailbox; capture replies and attachments against the candidate automatically | **Straightforward and high value.** Graph API or Gmail API. Inbound capture is the part that pays off — a candidate replying with documents shouldn't need anyone to file them |
| **E-signature** (DocuSign, Adobe Sign, or similar) | Issue the Welcome Pack for signature; track which documents are signed per person; store the signed copies automatically | Straightforward. The standard permits electronic authorisation and references the Electronic Communications Act 2000 [7.3.2, Note 5]. Removes the entire "check which signatures came back" task |
| **WhatsApp Business API** | Capture candidate enquiries into the sourcing pool; send chasers by the channel candidates actually read | Feasible via the official Business API. **Do not** automate against personal WhatsApp accounts — it breaches their terms and leaves no defensible record. Needs a data protection position agreed first |
| **Credit reference agency / screening provider** | Submit the public record search and receive results into the file [7.4f] | Experian, TransUnion and the main screening providers have APIs. If we outsource to a provider, use their API and keep our controller review step [6.3] |
| **HM Treasury sanctions list** | Automated watchlist screening [7.4e] | **Easy.** The consolidated list is published as a downloadable file. Sync daily and re-screen automatically, which also catches someone appearing on the list *after* they were cleared |
| **SIA public register** | Verify licence number, status and expiry, and retain the search result [7.4c1] | **No public API.** Expect a manual lookup with a screenshot or PDF uploaded as evidence. The portal can still prompt, diary the expiry, and store the result. Worth asking the SIA whether bulk verification is available to ACS-approved contractors |
| **DBS / Disclosure Scotland / Access NI** | Track disclosure applications [7.7j] | No API for individual employers. Portal tracks the application, reference number, dates and **outcome only** — the certificate is not retained, consistent with the standard's example declaration |
| **DWP** | Confirm registered unemployment periods [7.7c] | No API. Manual written request; the portal tracks request and response dates, and treats a "records unavailable" reply as an unverified period, as the standard requires |
| **HMRC PAYE records** | Career history evidence | No employer API. Candidate self-serves via their Personal Tax Account and uploads; the portal provides the step-by-step instructions `[SV]` |
| **Watch List / Maps** | Add the officer automatically at onboarding | **Unknown until we know what these systems are** — see document 07. If they are spreadsheets, the portal can replace them outright rather than integrate |
| Calendar | Interview scheduling | Straightforward via Graph or Google Calendar |
| SMS | Chasers to candidates who do not read email | Straightforward via Twilio or similar |

## 4. Sequencing

Deliberately ordered so that the portal is useful before any integration exists. If Casper and
Indeed access turn out to be slow to arrange, phases 1 and 2 still deliver most of the benefit.

**Phase 1 — the spine.** Requirements, candidate record, duplicate checks, recruitment pipeline,
vetting file with all checks, gates, the clock, My Tasks, dashboard. Manual data entry, but single
entry. *This is where the compliance risk gets fixed.*

**Phase 2 — the effort.** Email integration both ways, templates, the full reminder engine,
personalised document checklists with upload-time validation, automatic gap calculation. *This is
where the typing and chasing go away.*

**Phase 3 — the connections.** Casper, Indeed, e-signature, sanctions list sync, credit reference
agency or provider API.

**Phase 4 — the polish.** Candidate self-service portal, WhatsApp Business, SMS, forecasting,
automated audit packs.
