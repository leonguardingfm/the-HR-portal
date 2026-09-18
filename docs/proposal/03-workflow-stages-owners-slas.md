# 03 — Stages, Owners, Checklists and Deadlines

This document answers "how does a requirement travel from Control to a deployable officer, and how
does each person know what to do next?"

Deadlines marked **HARD** come from BS 7858 and are not ours to change. Everything else is a
proposed internal service level — sensible starting numbers, to be agreed and then adjustable in
Admin without a code change.

## 1. The three tracks at a glance

```
 TRACK A — REQUIREMENT  (Control)
 Received ─> Pool check ─> [covered internally: CLOSED]
                        └─> Released to sourcing ─> Allocated ─> Filled

 TRACK B — RECRUITMENT  (Ahmed, Usman)
 Sourcing ─> Shortlisted ─> Invited ─> Application received ─> Application complete
   ─> Interviewed ─> ((GATE 1)) ─> Conditional offer ─> Welcome pack ─> Signed docs complete
   ─> Onboarding complete ─> ((GATE 2)) ─> DEPLOYED ─> ((GATE 3)) ─> Confirmed employment

 TRACK C — VETTING  (Anas, Talha — alternating administrator / controller)
 Not started ─> Consent captured ─> Information complete ─> Preliminary checks done
   ─> Limited screening: 3-year history ─> CONTROLLER REVIEW #1 ══> unlocks GATE 1
   ─> Criminality + right to work                            ══> unlocks GATE 2
   ─> Five-year history verification  [12 WEEK CLOCK RUNNING]
   ─> Full screening complete ─> CONTROLLER REVIEW #2 ══> unlocks GATE 3

 Exception branches (any time): Risk acceptance required · Statutory declaration required
                                Extension requested · Adverse finding · Time expired · Withdrawn
```

## 2. The gates

These are the only places the tracks touch, and they are the reason the portal exists.

**Confirmed (Sept 2026):** deployment to a client site happens only after initial screening. The
one element that runs afterwards is verification of the **five-year career history**, which
completes within the 12 weeks the standard allows. So there are three gates, not two — and one of
them is ours rather than the standard's.

### GATE 1 — conditional offer (BS 7858 minimum)
This is the standard's own gate. A conditional offer is **blocked** until all four are true:

1. Risk in the intended role evaluated, deemed acceptable, and **documented** [7.5.1a]
2. Preliminary checks complete — identity from originals, current address, sanctions and
   watchlist, public record search via a credit reference agency [7.4]
3. Limited screening complete — continuous history confirmed for at least the 3 years before
   application [7.5.2a]
4. **The screening controller has reviewed the file and confirmed it** [7.5.2b]

On passing Gate 1 the portal **starts the clock**: it records the conditional employment
commencement date, computes the 12-week deadline, and displays both alongside the date employment
must cease if screening does not complete [7.2, 7.6].

### GATE 2 — deployment to a client site (our policy, stricter)
Gate 1 is not enough to put someone on a client site. Deployment additionally requires:

5. The **criminality element** satisfied — SIA licence, NPCC Appendix C, or a disclosure from the
   appropriate body [7.7j]
6. **Right to work** confirmed, with a follow-up date recorded where leave is time-limited
   (outside BS 7858's scope, but a separate legal obligation)
7. Signed Welcome Pack documents received — returned same day or next day in practice

Points 5 and 6 are **stricter than the standard**, which treats the criminality element as part of
full screening. It is worth keeping and worth recording as a deliberate choice, so it does not
quietly drift back. In the portal this gate is implemented separately from Gate 1, in the local
policy module rather than the BS 7858 module, precisely so the distinction stays visible.

The portal shows every block as a plain sentence — "Deployment blocked: SIA licence not yet
verified against the public register" — never a greyed-out button with no explanation.

### GATE 3 — confirmed employment
Confirmed employment is blocked until the **whole five-year screening period** is verified with no
unverified gap over 31 days [7.7], and the controller has reviewed the completed file. The
standard is unambiguous: no offer of confirmed employment unless full screening has completed
satisfactorily [7.7].

Because Gate 2 already covers everything else, the 12-week clock now measures **one well-defined
piece of work**: five-year history verification. That is a genuine improvement for forecasting —
it can be estimated from the number of employers and gaps on the file, rather than being an
open-ended wait.

If the clock expires without completion, the file moves to **Time expired** and the officer is
flagged as not to continue in relevant employment [7.6]. That flag has to reach Control, because
Control is who would otherwise roster them.

## 3. Track A — Requirement (owner: Control)

| Stage | Owner | Checklist | Target |
|-------|-------|-----------|--------|
| A1 Received | Control | Client, site, post, headcount, shift pattern, start date, **screening period required (5 years by default)** | Logged same working day |
| A2 Pool check | Control | Search officer pool for suitable and available officers; record the outcome | 1 working day |
| A3a Covered internally | Control | Allocate officers; close requirement | — |
| A3b Released to sourcing | Control | Release to HR with a note on why the pool cannot cover it | Same working day as A2 completes |
| A4 Allocated | Control | Accept the candidate HR puts forward; confirm site fit | 1 working day of HR proposing |
| A5 Filled | Control | Officer deployed; requirement closed | — |

Two points worth noting. First, **capturing the screening period at A1** is what makes the whole
deadline engine work later — it must come from the client contract, not be guessed at the vetting
stage. Second, "Released to sourcing" is a timestamped handover, which is what lets us report
honestly on whether a delay sat with Control or with HR.

## 4. Track B — Recruitment (owners: Ahmed, Usman)

| Stage | Owner | Checklist | Target |
|-------|-------|-----------|--------|
| B1 Sourcing | Recruitment | Search, in order: previous WhatsApp/email enquirers → existing Indeed applications → post a new Indeed ad | First action within **1 working day** of release; new ad posted by day 3 if the pool is dry |
| B2 Shortlisted | Recruitment | Automated duplicate/history check reviewed and cleared; any previous employment, open application or prior communication reviewed **before** proceeding; candidate record created once | 2 working days |
| B3 Invited | Recruitment | Casper application link sent with instructions. The authorisation [7.3.2f] and declaration [7.3.2g] are already part of that form, so consent to screen arrives with the application | Same day as B2 |
| B4 Application received | Recruitment | Application returned | Chase at **+3 days**, again at **+7**, escalate at **+14** |
| B5 Application complete | Recruitment | Completeness judged against the **full 7.3.2 list**, not just "form submitted"; document rules validated at upload `[SV]`; missing items chased | Chase within **48h** of a gap being identified, then every 3 working days, **max 3 attempts** then escalate |
| B6 Interviewed | Recruitment | Interview held **before any offer** [7.3.4]; interviewer, date, outcome and notes recorded | Within 5 working days of B5 |
| — | — | **GATE 1** — conditional offer permitted | — |
| B7 Conditional offer | Recruitment (+ Vetting controller sign-off) | Documented risk evaluation; conditional offer issued; **contract states that confirmed employment depends on full screening completing within the period allowed, and that conditional employment ends if it does not** [7.5.2] | 1 working day of Gate 1 clearing |
| B8 Welcome pack | Recruitment | Confidentiality & Disclosure, Employee Handbook, Employment Contract, Restrictive Covenant issued | Same day as B7 |
| B9 Signed docs complete | Recruitment | All required signatures received and checked. Returned same day or next day in practice, so a chaser here should be rare — if it fires often, that is a signal worth reading | Chase at **48h**, **5 days**, escalate at **10 days** |
| B10 Onboarding complete | Recruitment | The eight-item checklist in §6 below | **2 working days** of B9 |
| — | — | **GATE 2** — deployment permitted | — |
| B11 Deployed | Control | Officer allocated to the site and rostered; requirement headcount updated | On Gate 2 clearing |
| — | — | **GATE 3** — confirmed employment permitted | — |
| B12 Confirmed employment | Vetting controller → Recruitment | Five-year history verified and the completed file reviewed; status updated; officer record finalised | On Gate 3 clearing, within the 12-week clock |

## 5. Track C — Vetting (owners: Anas and Talha, alternating administrator and controller)

| Stage | Owner | Checklist | Target |
|-------|-------|-----------|--------|
| C1 Consent captured | Vetting admin | Authorisation to approach employers, government departments, educational establishments and a credit reference agency [7.3.2f]; signed declaration [7.3.2g]; **permission-to-contact flag recorded per employer**, current employer excluded unless permitted [7.7b] | Automatic on application submission — the Casper form already carries both |
| C2 Information complete | Vetting admin | Full 7.3.2 set present; history timeline continuous across the screening period; **portal calculates unverified days and flags every gap over 31 days** | 2 working days of application complete |
| C3 Preliminary checks | Vetting admin | Screening file opened [7.4a]; information reviewed as likely to complete [7.4b]; identity from originals with who-examined/who-copied recorded [7.4c]; SIA register check with search result retained [7.4c1]; current address [7.4d]; watchlist/sanctions [7.4e]; credit reference agency public record search [7.4f] | **3 working days** of C2 |
| C4 Limited screening | Vetting admin | Continuous history confirmed for the **3 years** before application [7.5.2a]; verifier contact details **independently verified** and how recorded [7.5.2a, 7.7]; administrator named | **5 working days** of C3 |
| C5 Controller review #1 | Vetting **controller** | File reviewed and confirmed; controller named on file [7.5.2b]; may not be the administrator on this file; may not be their own file [6.1] | **2 working days** of C4 |
| C6 Criminality and right to work | Vetting admin | SIA licence, NPCC Appendix C or a disclosure from the appropriate body held or obtained [7.7j]; right to work confirmed with a follow-up date where leave is time-limited. **Before deployment** — stricter than the standard, which places 7.7j inside full screening | **3 working days** of C5 — this is on the critical path to deployment |
| C7 Five-year history verification | Vetting admin | Whole screening period verified; **no unverified period over 31 days** [7.7]; education leaving date [7.7a]; employment periods and type [7.7b]; registered unemployment via DWP [7.7c]; self-employment [7.7d]; career breaks [7.7e]; residence abroad [7.7f]; travel abroad over 31 days [7.7g]; incomplete-record evidence [7.7h] | **HARD: 12 weeks** from conditional employment start [7.6] |
| C8 Controller review #2 | Vetting **controller** (not the administrator on this file) | Completed file reviewed and signed off; the alternating pairing means whoever built the file cannot be the one who reviews it [6.1, 7.5.2b] | Within the clock |

**Reference chasing rhythm inside C7** (proposed):

| Day | Action | Form 2 code |
|-----|--------|-------------|
| 0 | 1st request sent to verifier | `WR` / `ER` / `TR` / `AR` |
| +10 working days | 2nd request sent | `CL` |
| +20 working days | Switch to the documentary-evidence route — ask the candidate for two different documents dated at the start and end of the period `[SV]`, or PAYE records | `DR` |
| +30 working days | Escalate to controller; consider statutory declaration route if eligible [7.7i] | `SDR` |

The 1st and 2nd request dates are exactly the columns Form 2 asks for, and they are also the
evidence needed to justify a deadline extension [7.6] — which is why logging them automatically
rather than by hand matters.

## 6. The onboarding checklist (B10)

| # | Task | Owner | Automatable? |
|---|------|-------|--------------|
| 1 | Online history checks recorded | Vetting admin | Already captured at C3 — should not be re-done here |
| 2 | Name added to the Recruitment Sheet **exactly as per SIA badge** | Recruitment | Yes — derived from the verified SIA register result, not retyped |
| 3 | PIN assigned | Recruitment | Yes — portal allocates the next free PIN |
| 4 | Indeed profile created | Recruitment | Partly — depends on Indeed API access |
| 5 | Added to Watch List | Recruitment | Depends what the Watch List is — see document 07 |
| 6 | Added to Maps | Recruitment | Depends what Maps is — see document 07 |
| 7 | Hired in Casper from the submitted application | Recruitment | Depends on Casper API — otherwise a tracked manual step |
| 8 | New Recruit Onboarding Group notified | Portal | Yes — automatic on B10 completing |

Note task 1: in the current process the checks happen here. In the proposed order they have already
happened at C3, which means this becomes a confirmation rather than a task — and removes the
single biggest compliance risk in the current workflow.

## 7. Escalation and delay handling

A consistent rule, applied everywhere, is better than per-stage special cases:

| Trigger | What happens |
|---------|--------------|
| Task reaches 80% of its SLA | Amber on the owner's My Tasks and on the dashboard |
| Task passes its SLA | Red; appears in the owner's manager's overdue list |
| Task 2× its SLA | Escalated to the HR manager with the ageing shown |
| Third chaser sent with no response | Escalated automatically; candidate flagged as unresponsive; Control notified that the requirement may need a different candidate |
| Screening clock reaches 50% | Amber on the vetting clock board |
| Screening clock reaches 75% | Red; controller notified; extension eligibility checked |
| Screening clock reaches 90% | Critical; notified to management daily; extension decision forced |
| Clock expires | File moves to **Time expired**; officer flagged as not to continue in relevant employment; Control notified [7.6] |
| Extension requested | Routed to top management with the evidence of written requests already attached [7.6]; approval, reason and date recorded |
| CCJ >£10k / bankruptcy / directorship found | File pauses; candidate invited to make representation [7.4f]; risk-acceptance task routed to top management [Form 5] |

Two things the portal must **not** do: auto-approve an extension, and auto-clear a risk finding.
Both require a named human decision, and the standard expects that decision to be recorded and
retrievable.
