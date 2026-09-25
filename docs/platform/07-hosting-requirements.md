# Hosting requirements — Leon Guarding portal

*For the hosting provider or IT partner who will run the live portal. Written 25 September 2026.*

The portal holds personal and screening data about staff and applicants (passports, right-to-work
evidence, BS 7858 screening files), live operational data for the Control Room, and the contents of
the company's shared mailboxes. It must be hosted in the UK, encrypted everywhere, backed up daily,
and restored in a test at least once a month.

## 1. What runs

| Part | What it is | Notes |
|---|---|---|
| Web application | Next.js 16 on **Node.js 22 LTS**, one long-running server process | **Not serverless.** The process also runs the background checks (duty checks every 30 s, the Performance hub's SLA clocks every 10 s, email sync). It must stay running 24/7, restart automatically if it stops, and run as **one instance** (two instances would run the checks twice). |
| Database | **PostgreSQL 16** | All records, the append-only audit log, the SLA history. |
| File storage | Uploaded documents, selfies, evidence | Today written to a folder (`DOCUMENT_STORAGE_DIR`). Either a **persistent, encrypted, backed-up volume**, or S3/Azure Blob object storage — we will switch the storage adapter to object storage before go-live if the host prefers it. |

**Minimum size to start:** 2 vCPU, 4 GB RAM for the application; database 2 vCPU, 4 GB RAM, 32 GB
storage; file storage 50 GB growing about 10 GB a year. Expect about 60 staff users and up to about
400 officer phones connecting through the day.

## 2. Where

- **UK data residency** (for example Azure *UK South* or AWS *London*). Nothing stored outside the UK
  without a documented UK GDPR transfer basis.
- A **data processing agreement** with the host.
- We suggest **Microsoft Azure UK South**: the company already uses Microsoft 365, the Outlook
  integration uses Microsoft Graph, and staff sign-in can later move to Microsoft accounts. For
  example: Azure App Service (Linux, always on) or a small VM, Azure Database for PostgreSQL Flexible
  Server, and Azure Blob Storage. Any equivalent UK host that meets this list is fine.

## 3. Security

- **Encryption in transit:** HTTPS only, TLS 1.2 or later, HSTS, a certificate that renews itself.
  The database accepts TLS connections only.
- **Encryption at rest:** database, backups and file storage all encrypted (AES-256 or equivalent,
  platform-managed keys as a minimum).
- **Secrets** (below) kept in the host's secret store or protected environment settings — never in
  the code repository, never in logs.
- **Admin access** to servers and the database by named people only, with multi-factor
  authentication, and a log of who accessed what.
- **Patching:** the operating system and Node.js kept patched (monthly, and within 7 days for
  critical fixes).
- The database is not reachable from the internet except through the application, or from a
  restricted admin network.

## 4. Backups and recovery

| | Requirement |
|---|---|
| Database | Automated **daily** backups kept **35 days**, plus **point-in-time recovery** for at least the last 7 days. Backups encrypted and stored separately from the live database, in the UK. |
| Files | Daily backup (or versioning with soft delete) kept 35 days. |
| Recovery test | **Monthly**: restore the latest backup to a separate test database and file store, check the portal starts against it and a sample of records and documents open, then delete the copy. Record the date, who did it and the result. We will provide a checklist. |
| Targets | Lose no more than **15 minutes** of data (recovery point); be running again within **4 hours** (recovery time). |

The audit log is append-only by design: nothing in normal operation deletes it. Backups must not be
"cleaned" by deleting old audit rows.

## 5. Network

**Inbound:** HTTPS (443) to the portal from anywhere — officers use it on their phones. Microsoft
Graph must be able to reach one public HTTPS address on the portal to deliver new-email
notifications.

**Outbound** the server must be able to reach:

| Destination | Why |
|---|---|
| `graph.microsoft.com`, `login.microsoftonline.com` | Reading the shared mailboxes and sending approved replies (Microsoft Graph) |
| `api.anthropic.com` | The AI that reads and sorts incoming emails |
| Push services: `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com` | Alerts to phones and desks |
| The company's SMTP server (only if used instead of Graph) | Emails to candidates and referees |

## 6. Settings the host must provide (as secrets)

| Name | What |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (TLS required) |
| `AUTH_SECRET` | Long random value that signs sign-ins and seals emailed links |
| `APP_URL` | The portal's public address, e.g. `https://portal.leonguarding.co.uk` |
| `DOCUMENT_STORAGE_DIR` | The persistent encrypted volume for files (or the object-storage settings, if used) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Phone and desk alerts |
| `ANTHROPIC_API_KEY` (and optionally `HUB_AI_MODEL`) | The AI for the Performance hub |
| Microsoft tenant ID, app (client) ID and certificate | The Outlook connection — set up with the company's Microsoft 365 administrator |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Only if email is not sent through Microsoft Graph |

## 7. Monitoring

- An uptime check on the portal every minute, alerting the named contacts if it is down for 3 minutes.
- An alert if the background checks stop (the portal will provide a health address that says when
  they last ran).
- Database CPU, storage and connection alerts; file storage capacity alerts.
- Application logs kept 90 days. Logs must not contain passwords, tokens or document contents.

## 8. Environments and releases

- **Two environments:** *staging* (for testing each release with test data and the test inbox) and
  *production*. Staging never holds real personal data.
- Releases are deployed from the `main` branch after sign-off; database changes are applied with
  `npx prisma migrate deploy` as part of the release. A short maintenance window (under 10 minutes)
  out of hours is acceptable.

## 9. What we need back from the host

1. The chosen platform and region, and the data processing agreement.
2. Confirmation of encryption at rest and in transit for the database, backups and files.
3. The backup schedule and retention, and who carries out the monthly recovery test.
4. The contact and escalation route for outages, and the support hours.
5. Named people with admin access, and how access is granted and removed.
6. A monthly cost for the starting size in section 1.
