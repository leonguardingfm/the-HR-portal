# 04 — Management Dashboard and KPIs

## 1. Principle

A dashboard earns its place by answering a small number of questions without anyone having to ask.
For this business those questions are:

1. What cover have we been asked for that we have not yet delivered?
2. Is anything about to breach BS 7858?
3. Where is work stuck, and with whom?
4. Is the team keeping up?

Everything below serves one of those four. Anything that does not serve one of them belongs in
Reports, not on the dashboard.

## 2. Layout

### Row 1 — six tiles, each clicking through to a filtered list

| Tile | Shows | Amber / Red |
|------|-------|-------------|
| Open requirements | Count, and total officers still needed | Any open > 14 days / > 30 days |
| Unfilled beyond target | Requirements past their client start date | ≥1 / ≥3 |
| Candidates in pipeline | Active candidates by stage | — |
| In conditional employment | Officers deployed with screening incomplete | — |
| **At risk of breach** | Files past 75% of their 12-week clock | ≥1 amber, ≥1 past 90% red |
| Overdue tasks | Across all owners | > 10 / > 25 |

The "At risk of breach" tile is the one that should be impossible to ignore. It is the only number
on the page with a regulatory consequence attached.

### Row 2 — the two boards

**Requirement board.** Grouped by client, split by Control Alpha (3) and Bravo (2). Each card:
site, post, officers required vs allocated, days open, current stage, owner. Colour by ageing. This
is Control's and management's shared view of the order book.

**Vetting clock board.** Every conditionally employed officer, **sorted by days remaining**, most
urgent first. Each row: officer, conditional start date, deadline, days left, what is actually
outstanding (e.g. "2 employment references, 1 gap over 31 days"), owner, and whether an extension
has been approved. This is the single most valuable screen in the portal for management, because it
converts an invisible obligation into a queue.

### Row 3 — flow and bottlenecks

**Funnel.** Requirements released → candidates shortlisted → applications invited → applications
complete → interviewed → conditional offers → deployable → confirmed. Showing drop-off between
each pair immediately answers "where do we lose people?" — typically at application completion,
which is exactly what the document-validation automation is designed to fix.

**Average days per stage, against SLA.** A horizontal bar per stage with the SLA marked as a line.
This is the delay diagnosis screen: it shows whether the constraint is Control's pool check, HR's
sourcing, candidate responsiveness, or reference turnaround.

### Row 4 — people

**Workload by owner.** Open files, open tasks, overdue tasks, and oldest item, per person. Used for
balancing work, not for surveillance — which is a distinction worth making explicitly when the
portal is introduced, because it affects whether people trust it.

**Team performance.** Per person and per team: files progressed, average time in their stages
against SLA, chasers sent, first-time-right rate on document reviews.

### Row 5 — exceptions queue

Small, and usually empty, which is the point. Risk acceptances awaiting top management, statutory
declarations awaiting approval, extension requests, adverse findings pending representation,
expiring SIA licences and right-to-work follow-ups, and records due for secure disposal.

### Role-aware variants

Same page, different emphasis:

- **Control** — requirement board and officer availability; candidate detail hidden.
- **Recruitment** — My Tasks, funnel, chaser queue; vetting shown only as a status colour.
- **Vetting** — clock board, checks outstanding, controller review queue.
- **Management** — everything, plus KPIs and trends.

## 3. KPIs

### Compliance — report monthly, the headline set

| KPI | Definition | Target |
|-----|------------|--------|
| **Screening completed within the period allowed** | Files completing five-year history verification within 12 weeks ÷ files due | 100% — anything less is a compliance failure, not a performance dip |
| Files in conditional employment | Live count and as % of officers | Tracked; a persistently high number means screening is the constraint on growth |
| Extensions used | Count, and % of files [7.6] | Low; the standard notes extensions are not meant to cover a shortage of screening staff |
| Statutory declarations used | Count, and % of files [7.7i] | Low; each needs top management approval |
| Risk acceptances | Count by type (CCJ / bankruptcy / directorship) | Tracked, not targeted |
| Unverified-period exposure | Files with an open gap over 31 days | Driven to zero before each deadline |
| Files with complete controller sign-off | Both reviews present where required | 100% |
| Records disposed on schedule | Disposals done ÷ due (12-month and 7-year) | 100% |

### Speed

| KPI | Definition |
|-----|------------|
| Time to fill | Requirement released to sourcing → officer allocated |
| Time to deployable | Application invited → onboarding complete |
| Time to confirmed | Conditional employment start → full screening complete |
| Stage cycle times | Median days in each stage, vs SLA |
| Control reaction time | Requirement received → pool check complete |
| HR reaction time | Released to sourcing → first HR action |
| Reference turnaround | 1st request sent → confirmation received, **by employer** — this identifies the employers who never reply, so we can go straight to the documentary route next time |

### Quality and effort

| KPI | Definition | Why it matters |
|-----|------------|----------------|
| Application completion rate | Complete applications ÷ links sent | The clearest measure of whether the form and instructions work |
| Chasers per candidate | Average emails sent to get a complete file | Direct measure of the manual effort we are trying to remove; should fall as validation improves |
| Document rejection rate | Documents rejected at review ÷ uploaded | Falling rate means upload-time validation is working |
| First-time-right reviews | Files passing controller review without rework | Measures administrator quality and training effectiveness |
| Duplicates prevented | Merge or "existing record" outcomes from the duplicate check | Quantifies a benefit that is otherwise invisible |
| Source effectiveness | Time and cost per hire from previous enquirers vs existing Indeed applications vs new Indeed ads | Tells us whether posting new ads is worth it, or whether the existing pool is under-used |
| Internal cover rate | Requirements covered from the existing pool ÷ all requirements | Every point here is a recruitment cycle avoided |

### Capacity

| KPI | Definition |
|-----|------------|
| Open files per administrator | Current load against a target caseload |
| Overdue tasks by owner | With ageing buckets |
| Forecast screening demand | Requirements in the pipeline × expected conversion, against current vetting capacity |
| SIA licence expiry pipeline | Officers with licences expiring in 30 / 60 / 90 days |

## 4. Reporting rhythm

- **Daily** — an automatic morning digest to HR: my overdue tasks, files entering amber or red on
  the clock, and unresponsive candidates.
- **Weekly** — to management: requirements outstanding, breach risk, workload balance, and the
  week's stage cycle times.
- **Monthly** — the compliance set above, as a fixed pack. This is also the pack to hand an auditor
  or insurer, which is a good reason to keep its shape stable rather than redesigning it each time.
