# HR — Process Review and Design Proposal

> **Scope note, 21 September 2026.** The brief has widened from an HR portal to an all-in-one
> workforce and operations platform. **These documents are unchanged and still authoritative for
> Recruitment and Vetting** — they are the detail behind two of the platform's fifteen domains. The
> platform-level plan is in [`docs/platform`](../platform/README.md), which cross-references this
> folder rather than repeating it. The one exception is document 08, which is about INDEL — a
> question now **parked**; see [Platform 01 §4](../platform/01-scope-and-domains.md#4-a-note-on-indel).

These documents write down how Recruitment and Vetting actually work today, map that against
BS 7858:2019, and agree a target workflow. They were written before any code, and the compliance
rules in them are now implemented as real logic.

Read in this order:

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Process and compliance review](01-process-and-compliance-review.md) | What we do today, what BS 7858 requires, and where the two don't line up |
| 02 | [Portal structure](02-portal-structure.md) | Modules, navigation, and the single-record data model |
| 03 | [Stages, owners, checklists and deadlines](03-workflow-stages-owners-slas.md) | How a requirement travels from Control to a deployable officer |
| 04 | [Management dashboard and KPIs](04-management-dashboard-kpis.md) | What management sees on one screen |
| 05 | [Automation and integrations](05-automation-and-integrations.md) | What the portal can do alone vs. what needs Casper / Indeed / email |
| 06 | [Access and permissions](06-access-permissions.md) | Who can see and do what, and the separation-of-duty rules |
| 07 | [Open questions](07-open-questions.md) | Decision log, and what is still open |
| 08 | [Scope of the officer record](08-officer-system-of-record.md) | Where the line sits between the portal and INDEL |

## The two things to read first

**Document 01 §3.1** raised a possible sequencing problem — officers appearing to be hired and made
live before screening. That came back clean: the order is compliant in practice and, on the
criminality element, stricter than the standard's minimum. The written process was misleading about
its own order rather than wrong.

**Document 08** was about the boundary with INDEL. That question is now **parked** at the client's
direction: we are building the platform's own capability, and nothing in the plan depends on what
happens to INDEL. The document is kept for its analysis, not as a live decision.

## A note on the standard itself

BS 7858:2019 is a licensed BSI publication and may not be redistributed. These documents
therefore **paraphrase** its requirements and cite clause numbers so anyone with a licensed
copy can check the source. The PDF itself has deliberately **not** been committed to this
repository, and should not be.

Requirement references in these documents use the form `[7.4c]`, meaning BS 7858:2019
clause 7.4, item c. Document-evidence rules taken from the screening provider's acceptable
documents guide are marked `[SV]`, because they are that provider's house rules rather than
provisions of the standard.
