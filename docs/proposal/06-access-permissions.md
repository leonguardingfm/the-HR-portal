# 06 — Access and Permissions

## 1. Why this needs care

A vetting file contains criminal record information, financial history, addresses, and dates of
birth. BS 7858 requires screening data to be held confidentially and stored securely to prevent
unauthorised access and alteration [7.2], and the standard's own example declaration notes that
criminal record information is treated sensitively and **restricted to those who need to see it to
make a recruitment decision**.

The standard also asks for something stronger than confidentiality — **separation of duties**.
Where interviewing, screening, and the decision to employ sit in different departments, those
departments must be co-ordinated with particular attention to the division of functions and
authority **for internal control purposes** [6.1]. And no individual may screen themselves [6.1].

The practical consequence, which is worth stating plainly because it will surprise people:
**recruiters should not be able to read the contents of a screening file.** They need to know
whether it is clear, blocked, or overdue, and what category of thing is outstanding. They do not
need to see the convictions or the CCJs.

## 2. Roles

Named assignments confirmed September 2026.

| Role | Who | Purpose |
|------|-----|---------|
| **Control** | Control Alpha (3), Control Bravo (2) | Raise requirements, check the officer pool, allocate officers, roster |
| **Recruitment** | **Ahmed**, **Usman** | Source, shortlist, invite, chase, interview, issue packs, onboard |
| **Recruitment Manager** | Not yet assigned | All of Recruitment plus workload, reassignment, escalations |
| **Vetting Administrator** | **Anas** or **Talha**, per file [3.10] | Carry out checks, request and record evidence, maintain the file |
| **Vetting Controller** | **Talha** or **Anas** — whichever is not the administrator on that file [3.11] | Review and sign off files; responsible for the process being carried out correctly |
| **Top Management** | **Farhan** [3.15] | Accept risk, approve extensions and statutory declarations, oversight |
| **Auditor** | Internal audit, external certification body, insurer | Read-only across everything, including the audit log |

### 2.1 The alternating vetting pair

Anas and Talha both hold both vetting roles, assigned **per file**: whoever administers a file, the
other reviews it. The portal enforces the pairing, so the same person can never be administrator
and controller on one file [3.10, 3.11, 7.5.2b]. Both therefore need to be trained and recorded as
competent in both roles [6.2].

Recruitment and vetting sitting with different people (Ahmed and Usman versus Anas and Talha) is
exactly the separation of functions clause 6.1 asks for — nobody interviews a candidate and then
signs off their own screening file.

**One gap remains.** Anas and Talha must each be screened themselves, and neither may screen
themselves [6.1]. For Anas's own file, Talha can administer — but the controller then has to be
someone who is neither the subject nor the administrator, which rules out both of them. That needs
Farhan (trained to 6.2 and screened himself) or an accredited provider for those two files. See
C11 in [document 07](07-open-questions.md).
| **Candidate** | Applicant, self-service | Their own record only: complete the form, upload documents, see what is outstanding |
| **System Administrator** | IT | Users, roles, templates, SLA configuration — **not** candidate or screening data |

## 3. Permission matrix

`F` full · `E` edit · `V` view · `S` status only (colour and category, no detail) · `O` own records only · `—` no access

| Area | Control | Recruitment | Rec. Mgr | Vetting Admin | Vetting Controller | Top Mgmt | Auditor | Candidate | Sys Admin |
|------|---------|-------------|----------|---------------|--------------------|----------|---------|-----------|-----------|
| Requirements | **F** | V | V | — | — | V | V | — | — |
| Officer pool and availability | **F** | E | E | V | V | V | V | — | — |
| Officer deployability status | V | V | V | E | **E** | V | V | — | — |
| Candidate record (identity, contact) | — | **E** | **E** | V | V | V | V | **O** | — |
| Recruitment pipeline and stages | S | **E** | **E** | V | V | V | V | O | — |
| Interview records | — | **E** | **E** | V | V | V | V | — | — |
| Communication history | — | **E** | **E** | E | V | V | V | O | — |
| **Screening file — contents and evidence** | **—** | **S** | **S** | **E** | **F** | V | V | **O** (own uploads) | **—** |
| **Criminal record outcomes** | **—** | **—** | **S** | **V** | **V** | V | V | — | **—** |
| **Financial / public record findings** | **—** | **—** | **S** | **V** | **V** | V | V | — | **—** |
| Gate 1 / Gate 2 status | V | S | S | V | **E** | V | V | — | — |
| Controller sign-off | — | — | — | — | **E** | V | V | — | — |
| Risk acceptance (Form 5) | — | — | — | Raise | Raise | **Approve** | V | — | — |
| Statutory declaration approval | — | — | — | Raise | Raise | **Approve** | V | — | — |
| Deadline extension approval | — | — | — | Raise | Raise | **Approve** | V | — | — |
| Onboarding checklist | V | **E** | **E** | V | V | V | V | — | — |
| Dashboard and KPIs | Own view | Own view | **F** | Own view | Own view | **F** | V | — | — |
| Team performance and workload | — | — | **F** | — | V | **F** | V | — | — |
| Retention and disposal | — | — | — | Raise | **Approve** | V | V | — | — |
| Audit log | — | — | V (own team) | — | V | V | **F** | — | V |
| Users, roles, templates, SLAs | — | — | V | — | V | V | V | — | **F** |
| Vetting team competence register | — | — | — | O | **E** | V | V | — | — |

## 4. Rules the system enforces, not just documents

These are the ones worth writing as constraints in the database rather than as policy in a manual:

1. **No self-screening.** A user can never be the administrator, controller, or approver on a file
   attached to their own `Person` record [6.1]. Hard block, no override.
2. **Four eyes on sign-off.** The controller who reviews a file cannot be the administrator who
   built it [3.10, 3.11, 7.5.2b]. Hard block.
3. **Separation of decision from screening.** The person who conducts the interview and the person
   who signs off the screening file should be different people wherever headcount allows [6.1]. Warn
   and log if not, rather than block — because in a small team it may sometimes be unavoidable, and
   an audited exception is more honest than a workaround.
4. **Risk acceptance is top management only.** CCJs over £10,000, bankruptcy, and directorships
   cannot be cleared by a controller or administrator [7.4f, Form 5]. Hard block.
5. **Representation before decision.** A file cannot move to an adverse outcome on a public-record
   finding until the candidate has been recorded as invited to make representation [7.4f].
6. **Extensions are top management only**, require the evidence of written requests to be attached,
   and cap at four weeks [7.6]. The portal should not offer a second extension.
7. **Recruiters see status, not substance.** Enforced in the API layer, so it holds regardless of
   what the UI does.
8. **Every read of a screening file is logged** — who, when, which file, from where.
9. **Screening staff must be screened themselves.** A user cannot be granted the Vetting
   Administrator or Vetting Controller role until their own BS 7858 file is complete, their NDA is
   recorded, and their training is in date [6.1, 6.2]. Warn on grant, block on annual review lapse.
10. **Candidates see only their own record**, and only their own uploads — never a reference given
    about them, never a check result.

## 5. Things to confirm

- **Who is the screening controller on Anas's and Talha's own files?** See §2.1 above and C11 in
  document 07. This blocks granting either of them their role in the portal, because the system
  checks their own screening status before it will.
- **Who screens Farhan**, if he takes the controller role on those two files?
- **Do Control staff need any candidate visibility at all** beyond "an officer is allocated and is
  deployable"? The matrix above assumes not, which is the safer default, but Control may have a
  practical need we should hear before locking it down.
- **Insurer and certification body access.** If an insurer or an NSI/SIA assessor needs to inspect
  files, the read-only Auditor role with full audit logging is the right mechanism — better than
  emailing extracts around.
