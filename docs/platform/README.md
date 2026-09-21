# The platform — planning documents

The brief changed on 21 September 2026. What was a **recruitment and vetting portal** becomes an
**all-in-one workforce and operations platform** for Leon Guarding & FM Limited, covering officer
profiles, recruitment, BS 7858 vetting, scheduling, live operations, compliance, quality, clients,
equipment, departmental tasks and KPIs.

This folder holds the platform-level plan. It does **not** repeat the HR detail — that is already
worked out in [`docs/proposal`](../proposal/README.md) and is cross-referenced rather than restated.

| Document | What it settles | Read it when |
|----------|-----------------|--------------|
| [01 — Scope and domains](01-scope-and-domains.md) | The twelve domains, what each one owns, and the boundary of each | You want to know where a feature belongs |
| [02 — Shared engines](02-shared-engines.md) | The nine engines every domain reuses, and the single-source-of-truth register | You are about to build anything |
| [03 — Release plan](03-release-plan.md) | What gets built in which order, what each release unlocks, and what we are deliberately *not* building | You want to know when something lands |
| [04 — Decisions needed](04-decisions-needed.md) | The new questions this scope creates (E-series), separate from the HR ones (A–D in proposal/07) | You are the one who has to decide |
| [05 — Control discovery](05-control-discovery.md) | The question list for the session with Control, before any rostering estimate | You are about to sit down with Control |

## The one rule that keeps this from becoming a mess

> **Every fact has exactly one owner — in the software and in these documents.**

A second place to record an officer's SIA expiry is a second place for it to be wrong. The
single-source-of-truth register in [document 02](02-shared-engines.md#the-single-source-of-truth-register)
names the owner of each fact. Nothing gets built that writes a fact it does not own; it reads it.

The same rule governs the writing. If something is explained in `docs/proposal`, the platform docs
link to it. If it is explained here, the HR docs will be updated to link back rather than repeat it.

## How the existing work carries over

Nothing built so far is wasted. The HR portal becomes **two of the twelve domains** (Recruitment and
Vetting) plus part of a third (Compliance), sitting on engines that the rest of the platform shares.

| Already built | Becomes |
|---------------|---------|
| `lib/bs7858.ts`, `lib/policy.ts` | The Vetting domain's rule layer. Unchanged — still the only place the standard is encoded |
| `lib/roles.ts`, `lib/sla.ts` | Grow into the platform-wide Access and Scheduler engines |
| `lib/types.ts` | Splits: the shared spine moves to `lib/core`, the HR-specific types stay |
| The candidate / screening file / task model | The first users of the Identity, Documents and Work engines |
| The sign-in with an active role | Unchanged, and now more valuable: it spans every department, not just HR |

## Status

Planning and the engine foundation. See [document 03](03-release-plan.md) for what is built, what
is next, and what is a placeholder. The portal is honest about this on screen: a module that is not
built yet says so rather than showing an empty page.

**All data in the running application is demonstration data** invented to make the screens
reviewable. No integration is connected. This stays true until the first release with a database
behind it.
