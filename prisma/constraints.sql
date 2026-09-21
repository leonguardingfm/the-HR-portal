-- Constraints the Prisma schema cannot express.
--
-- These are not belt-and-braces. Each one encodes a rule that the platform
-- claims to enforce, and a rule enforced only in application code is a rule
-- that survives until the first bug, the first background job written in a
-- hurry, or the first manual fix applied at 2am.
--
-- Apply after `prisma migrate dev` by including this file in the migration:
--   npx prisma migrate dev --create-only
--   cat prisma/constraints.sql >> prisma/migrations/<id>/migration.sql
--   npx prisma migrate dev

-- ---------------------------------------------------------------------------
-- 1. Separation of duties on a screening file  [BS 7858:2019, 6.1, 7.5.2b]
-- ---------------------------------------------------------------------------
-- Nobody screens themselves, in either seat, and the controller who reviews a
-- file is not the administrator who built it. A subquery is needed to resolve
-- a user back to a person, so this is a trigger rather than a CHECK.

CREATE OR REPLACE FUNCTION enforce_screening_separation()
RETURNS TRIGGER AS $$
DECLARE
  admin_person TEXT;
  controller_person TEXT;
BEGIN
  IF NEW."administratorUserId" IS NOT NULL
     AND NEW."administratorUserId" = NEW."controllerUserId" THEN
    RAISE EXCEPTION
      'The controller reviewing a screening file may not be the administrator who built it (7.5.2b)';
  END IF;

  SELECT "personId" INTO admin_person
    FROM "User" WHERE id = NEW."administratorUserId";
  SELECT "personId" INTO controller_person
    FROM "User" WHERE id = NEW."controllerUserId";

  IF admin_person IS NOT NULL AND admin_person = NEW."personId" THEN
    RAISE EXCEPTION 'An individual may not administer their own screening file (6.1)';
  END IF;

  IF controller_person IS NOT NULL AND controller_person = NEW."personId" THEN
    RAISE EXCEPTION 'An individual may not review their own screening file (6.1)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER screening_separation
  BEFORE INSERT OR UPDATE ON "ScreeningFile"
  FOR EACH ROW EXECUTE FUNCTION enforce_screening_separation();

-- ---------------------------------------------------------------------------
-- 2. One person cannot hold two overlapping assignments
-- ---------------------------------------------------------------------------
-- The double-booking that gets noticed at 19:05 when two sites are both short.
-- An exclusion constraint makes it impossible rather than unlikely. Cancelled
-- assignments are excluded, because a cancelled shift is not cover.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Assignment"
  ADD CONSTRAINT assignment_no_overlap
  EXCLUDE USING gist (
    "personId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE (state <> 'cancelled');

ALTER TABLE "Assignment"
  ADD CONSTRAINT assignment_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- ---------------------------------------------------------------------------
-- 3. The event log is append-only
-- ---------------------------------------------------------------------------
-- Every KPI and the whole audit trail are queries over this table. If a row can
-- be edited, the audit trail is a claim rather than a record.

CREATE OR REPLACE FUNCTION reject_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'The event log is append-only: events cannot be % once written', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_append_only
  BEFORE UPDATE OR DELETE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();

-- TRUNCATE is not DELETE and slips past a row-level trigger, so it needs its
-- own. Without this, the whole audit trail is one statement away from gone.
CREATE TRIGGER event_no_truncate
  BEFORE TRUNCATE ON "Event"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation();

-- ---------------------------------------------------------------------------
-- 4. Data minimisation: no copy where the type forbids one
-- ---------------------------------------------------------------------------
-- A criminal record certificate's outcome and date are retained; the
-- certificate is not. This is the constraint that makes that true rather than
-- intended, and it is the one most likely to be broken by a well-meaning
-- upload feature.

CREATE OR REPLACE FUNCTION enforce_copy_retention()
RETURNS TRIGGER AS $$
DECLARE
  copy_allowed BOOLEAN;
BEGIN
  SELECT "copyRetained" INTO copy_allowed
    FROM "DocumentType" WHERE id = NEW."typeId";

  IF copy_allowed IS FALSE AND NEW."storageKey" IS NOT NULL THEN
    RAISE EXCEPTION
      'Document type % does not permit a copy to be retained — record the outcome and date only',
      NEW."typeId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_copy_retention
  BEFORE INSERT OR UPDATE ON "DocumentRecord"
  FOR EACH ROW EXECUTE FUNCTION enforce_copy_retention();

-- ---------------------------------------------------------------------------
-- 5. Polymorphic subjects: exactly one owner
-- ---------------------------------------------------------------------------
-- Several tables carry one nullable foreign key per possible subject, so the
-- keys are real. What the schema cannot say is that exactly one is set — and a
-- row with two subjects, or none, is a row that appears in the wrong queue.

ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_one_owner
  CHECK (num_nonnulls("personId", "siteId", "screeningFileId") = 1);

ALTER TABLE "FormResponse"
  ADD CONSTRAINT form_response_one_subject
  CHECK (num_nonnulls("personId", "assignmentId", "siteId", "clientId") = 1);

ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId"
  ) = 1);

-- An event always has an actor: a user, or the scheduler. Never neither.
ALTER TABLE "Event"
  ADD CONSTRAINT event_has_actor
  CHECK (num_nonnulls("actorUserId", "actorSystem") >= 1);

-- ---------------------------------------------------------------------------
-- 6. The standard's own limits
-- ---------------------------------------------------------------------------
-- A single extension of up to four weeks [7.6]. Five weeks is not a typo to be
-- corrected later; it is a file that is out of time and reporting that it is not.

ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_extension_limit
  CHECK ("extensionWeeks" IN (0, 4));

ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_period_valid
  CHECK ("screeningPeriodYears" IN (5, 10));

-- An extension has to have been approved by someone, and at a recorded time.
ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_extension_approved
  CHECK (
    "extensionWeeks" = 0
    OR ("extensionApprovedById" IS NOT NULL AND "extensionApprovedAt" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 7. Hours cannot be exported before they are approved
-- ---------------------------------------------------------------------------
ALTER TABLE "BookOff"
  ADD CONSTRAINT book_off_approval_complete
  CHECK (num_nonnulls("approvedById", "approvedAt") <> 1);

-- ---------------------------------------------------------------------------
-- 8. The disposal log is append-only, and always attributable
-- ---------------------------------------------------------------------------
-- Clause 11 and confirmed policy C14: every deletion is recorded. A disposal
-- log that can be edited afterwards proves nothing, and an entry with no
-- performer proves nothing either.

CREATE OR REPLACE FUNCTION reject_disposal_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'The disposal log is append-only: entries cannot be % once written', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER disposal_append_only
  BEFORE UPDATE OR DELETE ON "DisposalRecord"
  FOR EACH ROW EXECUTE FUNCTION reject_disposal_mutation();

CREATE TRIGGER disposal_no_truncate
  BEFORE TRUNCATE ON "DisposalRecord"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_disposal_mutation();

ALTER TABLE "DisposalRecord"
  ADD CONSTRAINT disposal_has_performer
  CHECK (num_nonnulls("performedByUserId", "performedBySystem") = 1);

-- Something must actually have been destroyed.
ALTER TABLE "DisposalRecord"
  ADD CONSTRAINT disposal_items_positive
  CHECK ("itemsDestroyed" > 0);
