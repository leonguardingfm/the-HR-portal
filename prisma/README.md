# The R1 schema

`schema.prisma` is the database for release R1. It is ordered the way
[`docs/platform/02`](../docs/platform/02-shared-engines.md) is: the shared
engines first, then the domains that sit on them.

## Three things worth knowing before reading it

**1. There is no `deployable` column.** Whether a person may go on a post is
derived at publication time from their screening file and their expiry dates
(`lib/core/deployability.ts`). A stored flag would be correct on the day it was
written and wrong the morning a licence expired.

**2. There is no KPI table, and no counters.** Every figure management sees is a
query over `Event`. That is why the Insight domain owns no facts of its own, and
why two screens cannot disagree about the same number.

**3. `ContactAttempt` is a mechanism, not a log.** The check-call escalation
advances when an attempt fails, so recording the attempt is what moves the
ladder from "try the officer" to "someone drives to site". It is also the record
that shows the duty of care was discharged.

**4. Every instant is `timestamptz`.** A guarding operation runs through the
night and through both clock changes. A night shift on the last Sunday of
October is either 12 or 13 hours long depending on the year, and `timestamp
without time zone` gets that wrong silently — which would show up first as an
hour of pay. Only the things that genuinely are dates (a licence expiry, a
contract start) are `date`.

## Apply it

```bash
npm run db:migrate     # prisma migrate deploy
npm run db:test        # proves the constraints actually reject the bad case
```

The migration in `migrations/20260921120000_init/` is the generated schema with
`constraints.sql` appended, which is how it must always be applied. If you
regenerate it:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script \
  > /tmp/schema.sql
cat /tmp/schema.sql prisma/constraints.sql > prisma/migrations/<id>/migration.sql
```

`constraints.sql` is **not optional**. It holds nine groups of rules the Prisma
schema cannot express, and each one is a rule the platform claims to enforce:
separation of duties on a screening file, no double-booked officer, an
append-only event log (including against `TRUNCATE`, which slips past a
row-level trigger), no retained copy where the document type forbids one,
exactly one subject per polymorphic row, the standard's four-week extension
limit, no hours exported before approval, and an append-only, always-attributable
disposal log.

A rule enforced only in application code survives until the first bug, the first
background job written in a hurry, or the first manual fix applied at 2am.

## The constraints are tested

`constraints.test.sql` makes 30 assertions against a real PostgreSQL 16: it
tries to break each rule and expects to be stopped. The cases that are supposed
to *succeed* are in there too, because a constraint that rejects everything is
not a constraint, it is an outage — a back-to-back shift with no overlap has to
be allowed, and so does a properly separated screening file.

```
PASS  self-administers own screening file (6.1)   <- An individual may not administer their own …
PASS  same officer, overlapping shift             <- conflicting key value violates exclusion …
PASS  same officer, back-to-back shift            <- allowed, as it should be
PASS  edit an event                               <- The event log is append-only …
PASS  keep a copy of a criminality certificate    <- Document type crc does not permit a copy …
...
30 assertions passed.
```

## What is deliberately not in here yet

| Not yet | Why |
|---------|-----|
| Availability, absence, repeating shift patterns | R2, and the shape depends on the Control discovery session ([`docs/platform/05`](../docs/platform/05-control-discovery.md)). Guessing it now would mean migrating away from the guess |
| Inspection programme scheduling | R4. The inspection form itself needs no new tables — it is a `FormDefinition` |
| Client portal access | Decision E7. It is a permissions design, not a table |
| Row-level security policies | Deliberate. Permissions are enforced in the application layer for R1 and revisited when the access rules have settled; adding RLS to rules that are still moving produces two places to get them wrong |

## Seed data

Three tables are configuration rather than records, and are seeded rather than
entered: `DocumentType` (from `lib/core/documents.ts`), `FormDefinition` and
`FormField` (from `lib/core/forms.ts`), and `Setting` (from `lib/sla.ts` and
`lib/core/ops.ts`). They are in code today so the prototype runs; the seed
script is what moves them into the database without retyping them.
