# 08 — Scope of the Officer Record

> **Parked, 21 September 2026.** The question this document exists to answer — where the line sits
> between the platform and INDEL — has been set aside at the client's direction. We are building the
> platform's own officer, scheduling and compliance capability; whether anything is ever migrated
> from INDEL, integrated with it, or left alone is a later conversation. Read this for the analysis
> of what INDEL does and what each part costs to replace, which is still useful; do not read the
> boundary in §0 or the staging in §4 as current. In particular the availability note at the end no
> longer holds: Control will depend on this platform daily, so uptime, backup and recovery are real
> requirements (**E2**).

**Superseded 19 September 2026.** An earlier answer confirmed the portal would replace INDEL
outright. That has since been scoped back:

> **Do not replace INDEL completely. Take the HR part and build that.**

This document is kept because the analysis behind the decision is still useful — it is what shows
why taking only the HR part is the right call. The staging in §4 becomes a map of what we are
*not* doing, and what the boundary is.

## 0. Where the line now sits

| Stays in INDEL | Comes to the portal |
|----------------|---------------------|
| Shift assignment and rostering | Candidates and the recruitment pipeline |
| Day-to-day operational deployment | BS 7858 screening files, checks and evidence |
| Whatever else Control works in daily | The screening clock and the three gates |
| The officer's operational running record | Onboarding, PIN allocation, the Recruitment Sheet view |
| | Documents, expiry dates and the chasing that hangs off them |

**The boundary is the handover at onboarding.** The portal owns everything up to the point an
officer is deployable, and the compliance record that continues after it. INDEL keeps the
operational side.

That leaves one thing to agree: **who owns the officer's compliance expiry dates** — SIA licence,
right to work, visa. The portal needs them, because chasing and blocking deployment are HR work.
INDEL alerts on them today. Running both invites drift. Our recommendation is that the **portal
owns them and INDEL reads them**, because the chasing lives with HR, but this needs a decision —
it is C21 in [document 07](07-open-questions.md).

## 1. The size of the decision, plainly

The proposal so far builds a **recruitment and vetting** system. That is a well-bounded problem:
candidates, screening files, a 12-week clock, three gates, a document engine.

Replacing INDEL adds a second system — **everything that happens to an officer after they are
live**. Those are different problems with different users, different failure modes and different
urgency. The recruitment side is mostly administrative: a delay costs days. The operational side is
not. If the portal is the system of record for shift assignment and it is down on a Friday night,
nobody knows who is covering which site.

Roughly: **recruitment and vetting is about half the job.** This is not a reason to say no. It is a
reason not to treat it as one more phase on the end of the existing plan.

## 2. What INDEL does today

From the answers to B3 and B8. This list is almost certainly incomplete — see C20.

| Function | What it means | Who depends on it |
|----------|---------------|-------------------|
| Officer personnel record | Personal and employment information, the authoritative copy | HR, Control, management |
| Compliance record | Recording and monitoring compliance requirements per officer | Vetting, HR, audit |
| SIA status | Verifying and monitoring licence status | HR, Control (deployability) |
| Visa and immigration | Status where applicable, with expiry recorded | HR |
| Documents and expiry dates | Held with their expiry dates | HR, audit |
| **Expiry alerting** | One month before a recorded expiry | HR — and it is the trigger for chasing |
| **Daily reporting** | A daily visa and right-to-work list across the workforce | HR, management |
| **Shift assignment** | Assigning and managing shifts | **Control — every day** |
| Ongoing operational record | The running history for each officer | Everyone |

The two in bold with a daily rhythm are the ones that carry real risk. An officer whose visa
expires unnoticed cannot legally be deployed, and the daily report is how that is currently caught.

## 3. What each part costs to replace

| Function | Difficulty | Notes |
|----------|-----------|-------|
| Officer personnel record | **Low** | The portal already models this. It is the natural extension of the candidate record — the same `Person` carries through. |
| Compliance record | **Low** | Already built as the screening file. Extending it past onboarding into ongoing compliance is a small step. |
| SIA status monitoring | **Medium** | No public API, so it is a prompted or semi-automated sweep. But the portal already holds every licence number, and the twice-daily Watch List check is manual today — this is one of the clearer wins. |
| Visa and immigration, documents and expiry | **Low** | Dates and documents with a clock on them. The portal already does exactly this for the screening deadline. |
| Expiry alerting | **Low** | The reminder engine already planned for Phase 2 covers it, and improves on it: 90/60/30 days rather than one month. |
| Daily reporting | **Low** | A saved query and a scheduled send. |
| **Shift assignment** | **High** | This is a different application. Rosters, patterns, availability, clashes, last-minute cover, and a Control team working to the hour. It needs its own design, and probably its own conversation with Control about how they actually work rather than how the process document says they do. |
| Ongoing operational record | **Medium** | Cheap to store, but it is what everything else hangs off, so the model needs to be right first. |

**Everything except shift assignment is a natural extension of what is already being built.** Shift
assignment is the second programme.

## 4. What we are not doing — kept for reference

The staging below was the recommendation when the portal was to replace INDEL outright. It is kept
because it shows what the boundary now excludes, and because if the question is ever revisited this
is the route that avoids a big-bang cutover.

**Stages A and B are in scope. Stages C and D are not.**

### Stage A — recruitment and vetting (Phases 1–2) — IN SCOPE
The portal is authoritative for candidates, screening files and onboarding. INDEL still holds live
officers. Nothing operational changes, so nothing operational can break.

### Stage B — the compliance record — IN SCOPE, partially
The portal becomes authoritative for officer personnel, compliance, documents and expiry dates.
This is the natural moment: an officer who was onboarded through the portal already has all of it
there, so the record simply does not stop at deployment.

**Run in parallel.** INDEL keeps producing its alerts and daily report while the portal produces
the same ones, and the two are compared until they agree. Only then does INDEL's version stop.

### Stage C — monitoring and reporting — OUT OF SCOPE for now
SIA status sweeps, visa and right-to-work expiry, the daily report, and the shift block once an
expiry passes. By this point the portal is already producing them in parallel, so this stage is
mostly turning INDEL's off.

### Stage D — shift assignment — OUT OF SCOPE
Stays in INDEL. This was always the part that is a different application rather than another
phase, and scoping it out is the right call: rostering is where Control's day happens, and it does
not need rebuilding to fix the HR problem this portal exists to fix.

## 5. What could go wrong, and what to do about it

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| **Expiry monitoring lapses during cutover** | An officer deployed on expired right to work is a legal problem, not an inconvenience | Parallel running with comparison, per Stage B. INDEL's alerts stay on until the portal's have matched them for a full cycle |
| **Data migration is incomplete** | We are working from a description of INDEL, not an inventory | C20: field-level inventory before migration is planned. Ask the people who use it daily what is in it that nobody documented |
| **Getting data out of INDEL** | If there is no API and no export, migration is manual | C17: confirm what INDEL offers. This matters more now than when we were only integrating |
| **Rostering underestimated** | It is the part that looks simple in a process document and is not | Separate discovery with Control before any estimate |
| **Single point of failure** | Once the portal is the system of record, an outage stops the operation, not just HR | Uptime, backup and recovery requirements need to be agreed before Stage B, not after |
| **Scope creep by default** | "Replace INDEL" can quietly become "replace everything" | Each stage gated on the previous one being stable and signed off |

## 6. What changes in the existing proposal

- **[Document 02](02-portal-structure.md)** — the Officers module grows from a pool view into the
  officer system of record. A Shifts module is added, unbuilt, for Stage D.
- **[Document 05](05-automation-and-integrations.md)** — INDEL moves from the integrations table to
  a migration. The Casper integration is unaffected.
- **Non-functional requirements** — uptime, backup and recovery become real requirements rather
  than good practice, because Control will depend on this daily.

## 7. Decisions still needed

Most of the earlier list falls away with the scope. What remains:

1. **C21 — who owns the compliance expiry dates**, SIA licence, right to work and visa. The portal
   needs them because the chasing is HR work; INDEL alerts on them today. Running both invites
   drift.
2. **C17 — what INDEL offers for handover**: API, export, or neither. Still needed, but only for
   the onboarding handover rather than a migration.
3. **D5 — the portal owner**, so decisions during the build have one route.

Availability requirements drop back to normal: with rostering staying in INDEL, an hour of portal
downtime delays HR work rather than stopping the operation.
