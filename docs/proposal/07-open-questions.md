# 07 — Open Questions

Grouped by how much they block the build. Nothing here is an assumption — each item is something
the process description and the two supporting documents do not settle.

## Answered — 18 September 2026

All eight blocking questions came back. Recorded here as the decision log; the design documents
have been updated to match.

| # | Question | Answer |
|---|----------|--------|
| A1 | Are officers deployed before screening? | **No.** Deployment happens only after initial screening. The single element that runs afterwards is **five-year career-history verification**, completed within the 12 weeks the standard allows. Everything else is done before anyone goes to site — which on the criminality element is stricter than the standard's minimum. |
| A2 | 5-year or 10-year? | **Five years**, so a **12-week** clock on every file. The 10-year path stays available but unused, since the period must be extended for contractual or insurer reasons [7.3.2b, Clause 1 Note 2]. |
| A3 | In-house or outsourced? | **In-house.** Clause 6.3 does not apply. Clauses 6.1 and 6.2 — screening the screeners, NDAs, annual training review — are ours directly. |
| A4 | Who is responsible? | **Ahmed** and **Usman** — recruitment. **Anas** and **Talha** — vetting. |
| A5 | Who is top management for approvals? | **Farhan** — risk acceptance, deadline extensions, statutory declarations. |
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

Two new items, both in section C below: **C11**, who acts as screening controller on Anas's and
Talha's own files, since neither may screen themselves and the controller cannot be the
administrator either; and **C10**, already open, is now more pressing because the Employment
Contract is signed before history verification completes.

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

## B. Needed before the relevant module is built

| # | Question |
|---|----------|
| B1 | **What are the Watch List and Maps?** Separate systems, spreadsheets, or something else? If they are spreadsheets, the portal should replace them rather than integrate with them. |
| B2 | **What is a PIN used for, and what is its format?** Sequential, structured, or tied to a client or site? Needed before automatic allocation can be built. |
| B3 | **Why is an Indeed profile created for each officer at onboarding?** This is unusual for a hired employee and we want to make sure we automate the right thing. |
| B4 | **What is the New Recruit Onboarding Group?** A WhatsApp group, a distribution list, or a Teams channel? Determines how the notification is sent. |
| B5 | **Is an interview actually held, by whom, and is the outcome recorded?** The standard requires an interview before any offer [7.3.4], and there is an Interview Sheet, but the written process has no interview step. |
| B6 | **What exactly do the "online history checks" consist of today?** Mapping needed against the four distinct requirements in [01 §3.4](01-process-and-compliance-review.md). |
| B7 | **Do Control Alpha (3) and Bravo (2) split by client, geography, or contract type?** And should the numeric or the alpha name be the primary label in the interface? |
| B8 | **What is the current system of record for the officer pool?** Casper, a spreadsheet, or Maps? The portal needs one authoritative source to seed from. |
| B9 | **Which credit reference agency or screening provider do we use** for the public record search [7.4f], and does it have an API? |
| B10 | **How are WhatsApp enquiries currently retained**, and what is our data protection position on holding them as part of a recruitment record? |
| B11 | **Is there an existing right-to-work follow-up process** for candidates with time-limited leave? |

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
| C10 | **Does the employment contract currently state** that confirmed employment depends on satisfactory full screening within the period allowed, and that conditional employment ends if it does not complete [7.5.2]? If not, the contract needs amending, not just the portal. **Now more pressing:** A1 confirms the contract is signed before history verification completes, so this wording is what makes that sequence defensible. |
| C11 | **Who is the screening controller on Anas's and Talha's own files?** Both must be screened themselves and neither may screen themselves [6.1], and the reviewing controller cannot be the administrator who built the file [7.5.2b] — which rules out both of them for each other's review. Options in [01 §4.2](01-process-and-compliance-review.md): Farhan reviews those files (trained to 6.2 and screened himself), or buy those two files in from an accredited provider and review the returned file ourselves. Also: who screens Farhan? |
| C12 | **Are Anas and Talha recorded as competent in both roles?** The alternating controller/administrator arrangement only works if both are trained for both, with training records maintained and reviewed annually [6.2]. |

## D. Preferences we can proceed without, but would rather know

| # | Question |
|---|----------|
| D1 | Do you want a **candidate self-service portal** (log in, see outstanding items, upload documents) or should everything stay over email? Self-service is a large part of the effort saving, but it is more to build. |
| D2 | Do you want **e-signature** for the Welcome Pack, or continue with signed scans returned by email? |
| D3 | Should the portal **replace** the existing spreadsheets outright, or keep exporting to them during a transition period? A transition is safer but keeps the duplicate-entry problem alive for longer. |
| D4 | How many people will use it, and do we need **mobile access** — particularly for Control and for officers checking their own outstanding items? |
| D5 | Who is the **portal owner** on your side for decisions during the build? |
| D6 | Do you want **open-source internet or social media checks** included? They are explicitly *not* a provision of the standard and carry discrimination risk; our recommendation is to leave them out. |
| D7 | Hosting preference and data residency — UK region is assumed and recommended given the data involved. |

## Suggested way to work through these

A1 to A8 are answered, and Phase 1 can proceed on them.

**Next, in order of how much they hold things up:**

1. **B1 to B4** — Watch List, Maps, the PIN format, and the New Recruit Onboarding Group. These
   four are the only thing standing between us and a fully automated onboarding checklist, and
   three of them may turn out to be spreadsheets the portal should simply replace.
2. **C11 and C12** — the controller arrangement for Anas's and Talha's own files. Needed before
   either can be granted their role in the portal, because the system checks it.
3. **C10** — the contract wording. A document review rather than a build decision, but it is what
   makes the confirmed sequence defensible.
4. **B5, B6** — whether the interview is recorded, and what the "online history checks" consist of
   in practice, mapped to the four distinct requirements they cover.

C1 to C9 can be answered in writing as the relevant modules come up. D can wait until the Phase 1
spine is working and you have something to react to.
