# HR Portal — Process Review and Design Proposal

This folder is the **proposal stage** deliverable. Nothing has been built yet. The purpose of
these documents is to write down how Recruitment and Vetting actually work today, map that
against BS 7858:2019, and agree a target workflow *before* any code is written.

Read in this order:

| # | Document | What it answers |
|---|----------|-----------------|
| 01 | [Process and compliance review](01-process-and-compliance-review.md) | What we do today, what BS 7858 requires, and where the two don't line up |
| 02 | [Portal structure](02-portal-structure.md) | Modules, navigation, and the single-record data model |
| 03 | [Stages, owners, checklists and deadlines](03-workflow-stages-owners-slas.md) | How a requirement travels from Control to a deployable officer |
| 04 | [Management dashboard and KPIs](04-management-dashboard-kpis.md) | What management sees on one screen |
| 05 | [Automation and integrations](05-automation-and-integrations.md) | What the portal can do alone vs. what needs Casper / Indeed / email |
| 06 | [Access and permissions](06-access-permissions.md) | Who can see and do what, and the separation-of-duty rules |
| 07 | [Open questions](07-open-questions.md) | Things we must confirm before building |

## The one thing to read first

Document 01 contains a **sequencing problem** in the current process: officers appear to be
hired in Casper and added to the live systems *before* any screening has been done. BS 7858
requires a defined minimum set of checks to be complete **before** an offer of employment is
made. This is the single most important item to agree, because it changes the order of the
workflow the portal will enforce. Everything else in this proposal is comparatively
straightforward.

## A note on the standard itself

BS 7858:2019 is a licensed BSI publication and may not be redistributed. These documents
therefore **paraphrase** its requirements and cite clause numbers so anyone with a licensed
copy can check the source. The PDF itself has deliberately **not** been committed to this
repository, and should not be.

Requirement references in these documents use the form `[7.4c]`, meaning BS 7858:2019
clause 7.4, item c. Document-evidence rules taken from the screening provider's acceptable
documents guide are marked `[SV]`, because they are that provider's house rules rather than
provisions of the standard.
