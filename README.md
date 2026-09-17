# The HR Portal

A portal to monitor, manage and track the HR department of a security company, covering its two
sections — **Recruitment** and **Vetting** — with BS 7858:2019 screening built into the workflow
rather than bolted on afterwards.

## Status: proposal stage

No application code has been written yet. The current deliverable is a written proposal covering
the process review, the target workflow, the portal structure, the management dashboard, the
automation opportunities and the access model, to be agreed before development starts.

**Start here: [`docs/proposal/README.md`](docs/proposal/README.md)**

| Document | Covers |
|----------|--------|
| [01 Process and compliance review](docs/proposal/01-process-and-compliance-review.md) | Current process mapped against BS 7858:2019, and the gaps found |
| [02 Portal structure](docs/proposal/02-portal-structure.md) | Modules, navigation, data model, recommended stack |
| [03 Stages, owners and deadlines](docs/proposal/03-workflow-stages-owners-slas.md) | Requirement → sourcing → onboarding → vetting, with SLAs |
| [04 Dashboard and KPIs](docs/proposal/04-management-dashboard-kpis.md) | What management sees, and what we measure |
| [05 Automation and integrations](docs/proposal/05-automation-and-integrations.md) | In-portal automation vs. Casper / Indeed / email integrations |
| [06 Access and permissions](docs/proposal/06-access-permissions.md) | Role matrix and separation-of-duty rules |
| [07 Open questions](docs/proposal/07-open-questions.md) | What needs confirming before we build |

## Note on the standard

BS 7858:2019 is a licensed BSI publication and is not redistributable. The proposal documents
paraphrase its requirements and cite clause numbers rather than quoting it, and the standard itself
is deliberately not committed to this repository.
