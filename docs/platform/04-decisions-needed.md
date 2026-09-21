# 04 — Decisions needed

The HR decisions are logged in [`docs/proposal/07`](../proposal/07-open-questions.md) as A–D, and
still stand. The wider scope creates these. They are numbered **E** so the two lists never collide.

The ones that block a release are marked. The rest can be answered as the build reaches them.

## Blocking R2 and R3

### E1 — Does the platform become the operational system of record? **Blocks R2**
Scheduling, book-ons and check calls in scope means INDEL is superseded, not integrated with — which
reverses the earlier decision to keep the operational side there
([`docs/platform/01` §4](01-scope-and-domains.md#4-the-consequence-for-indel)).

*Recommendation:* yes, but staged and parallel-run, retiring INDEL only at R6. This needs an explicit
yes because it commits the company to depending on this system every day.

### E2 — What availability does the operation need? **Blocks R2**
Once Control works the rota here, an outage is an operational incident. Needed: an uptime target, a
backup and recovery position, and what Control does during an outage. A printable rota and a phone
number is a legitimate answer — but it has to be the agreed one.

### E3 — How do officers interact with the system? **Blocks R3**
Book-on and check-in have to work for the officers you actually employ, on the phones they actually
carry, at the sites' actual signal strength.

| Option | Evidence quality | Needs |
|--------|------------------|-------|
| Web app on their own phone | Good; timestamped, can carry location | Smartphone, data, goodwill |
| Call a number (IVR) | Good; caller ID proves the handset, landline proves the site | Telephony cost per call |
| SMS | Weak; easy to send from anywhere | Cheapest |
| QR or NFC at the post | Strongest; proves they were physically there | Tags installed at every site |
| Geofence | Strong; passive | Smartphone, location consent, battery |

*Needed from you:* roughly what proportion of officers have a smartphone they would use for work,
and whether sites have a landline at the post.

### E4 — Check calls: who calls whom, and what happens when one is missed? **Blocks R3**
Currently hourly. The ladder needs agreeing: how long after a missed call before it escalates, to
whom, and at what point it becomes a welfare emergency rather than an admin failure. This is a duty
of care, so it needs to be a written rule the system enforces.

## Needed soon

### E5 — Telephony and messaging
SMS and voice cost per message, and which provider. It sets the reminder design: a chaser ladder is
free by email and not by SMS.

### E6 — Data protection
The scope now covers screening data, health-adjacent welfare records and possibly location. A DPIA is
very likely required, the lawful basis for location needs stating, and retention needs extending
across the new domains. Worth a data-protection review before R3, not after.

### E7 — Do clients get access?
A client portal — seeing their own site's inspections, reports and officer compliance — is a strong
commercial feature and a large amount of care about permissions. In or out?

### E8 — Where do hours go?
Which payroll and accounts systems consume the approved hours, and in what format. It shapes the
export, not the platform.

### E9 — What exists to migrate? **Blocks R6**
A field-level inventory of INDEL, Casper and the spreadsheets. Written from a description, this list
is certainly incomplete — the people who use INDEL daily will know what is in it that nobody
documented.

### E10 — Devices and connectivity
What Control uses, what supervisors carry, and whether site posts have usable signal. It decides how
much has to work offline.

### E11 — Who owns the platform?
One named person who makes the calls during the build. This supersedes D5, which asked the same
question about the smaller portal. Without it, every decision here waits for a meeting.

### E12 — What is it called?
"HR Portal" no longer describes it. Worth naming before people start referring to it by module.

## Still open from the HR scope

Carried over unchanged from [`docs/proposal/07`](../proposal/07-open-questions.md), because they
block R1:

- **C13** — training evidence for whoever administers the controllers' own screening files (clause 6.2)
- **C14** — current retention practice, and how disposal is recorded (clause 11)
- **C16** — which clients or posts involve contact with children or vulnerable adults, and what level
  of disclosure is obtained (clause 7.7j, Note 6)
- **C17** — whether INDEL exposes an API or an export. Now an E9 question too
- **C18** — whether the contract wording making confirmation conditional on screening is signed off
- **C21** — now answered by the register in [document 02](02-shared-engines.md#3-the-single-source-of-truth-register):
  **the platform owns the compliance expiry dates.** Needs confirming, because it means INDEL's
  alerting is switched off rather than run alongside
