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
  CHECK (num_nonnulls("personId", "siteId", "clientId", "screeningFileId") = 1);

ALTER TABLE "FormResponse"
  ADD CONSTRAINT form_response_one_subject
  CHECK (num_nonnulls("personId", "assignmentId", "siteId", "clientId") = 1);

ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId"
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

-- ---------------------------------------------------------------------------
-- 9. The Admin department
-- ---------------------------------------------------------------------------
-- Approval is the whole point of the Admin workflow, so the rules that make an
-- approval mean something belong in the database. Every one of these is
-- reachable from application code today; every one of them would survive being
-- forgotten by a background job written in a hurry.

-- 9a. A request asks for something, so it has a kind. A task does not.
ALTER TABLE "AdminItem"
  ADD CONSTRAINT admin_item_kind_matches_track
  CHECK (
    ("track" = 'request' AND "kind" IS NOT NULL)
    OR ("track" = 'task' AND "kind" IS NULL)
  );

-- 9b. At most one subject, and never a negative amount. "At most" rather than
-- "exactly" on purpose: an Admin task can legitimately be about the department
-- itself — count the stock, walk the office — and inventing a subject for it
-- would be worse than having none.
ALTER TABLE "AdminItem"
  ADD CONSTRAINT admin_item_one_subject
  CHECK (num_nonnulls(
    "supplierId", "recurringPaymentId", "assetId", "holidayRequestId",
    "penaltyId", "voucherId", "accreditationId", "authorityMatterId",
    "stockItemId"
  ) <= 1);

ALTER TABLE "AdminItem"
  ADD CONSTRAINT admin_item_amount_not_negative
  CHECK ("amountPence" IS NULL OR "amountPence" >= 0);

-- 9c. A decision is recorded whole: the verdict, who gave it and when, all
-- three or none. Half a decision is the row that makes an audit trail useless.
ALTER TABLE "AdminApproval"
  ADD CONSTRAINT admin_approval_decision_whole
  CHECK (
    num_nonnulls("decision", "decidedByUserId", "decidedAt") IN (0, 3)
  );

ALTER TABLE "AdminApproval"
  ADD CONSTRAINT admin_approval_decision_valid
  CHECK ("decision" IS NULL OR "decision" IN ('approved', 'rejected'));

-- A rejection always says why.
ALTER TABLE "AdminApproval"
  ADD CONSTRAINT admin_approval_rejection_has_grounds
  CHECK ("decision" <> 'rejected' OR "grounds" IS NOT NULL);

ALTER TABLE "AdminApproval"
  ADD CONSTRAINT admin_approval_step_positive
  CHECK ("step" >= 1);

-- 9d. The requester is never the approver, and nobody decides a request about
-- themselves. Both need the item and the user table, so both are a trigger.
--
-- These two are the reason the ladder is a ladder. Without them a Finance
-- Officer who also sits in higher management could satisfy both rungs of a
-- large payment, and the second signature would be the same pen.
CREATE OR REPLACE FUNCTION enforce_approval_separation()
RETURNS TRIGGER AS $$
DECLARE
  requester TEXT;
  subject_person TEXT;
  approver_person TEXT;
BEGIN
  IF NEW."decidedByUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "requestedByUserId", "aboutPersonId"
    INTO requester, subject_person
    FROM "AdminItem" WHERE id = NEW."itemId";

  IF requester = NEW."decidedByUserId" THEN
    RAISE EXCEPTION
      'The person who raised a request may not approve it, whatever role they hold';
  END IF;

  IF subject_person IS NOT NULL THEN
    SELECT "personId" INTO approver_person
      FROM "User" WHERE id = NEW."decidedByUserId";
    IF approver_person = subject_person THEN
      RAISE EXCEPTION 'Nobody may decide a request about themselves';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_approval_separation
  BEFORE INSERT OR UPDATE ON "AdminApproval"
  FOR EACH ROW EXECUTE FUNCTION enforce_approval_separation();

-- 9e. Nothing reaches `approved` with a rung outstanding.
--
-- This is the constraint that makes "nothing auto-approves" true rather than
-- intended. The chase ladder can put a request in front of higher management
-- three times; it cannot move the state.
CREATE OR REPLACE FUNCTION enforce_approval_complete()
RETURNS TRIGGER AS $$
DECLARE
  outstanding INT;
  rejected INT;
BEGIN
  IF NEW."state" <> 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO outstanding
    FROM "AdminApproval"
    WHERE "itemId" = NEW.id AND "decision" IS NULL;

  IF outstanding > 0 THEN
    RAISE EXCEPTION
      'This request still needs % approval(s). Nothing approves itself.', outstanding;
  END IF;

  SELECT count(*) INTO rejected
    FROM "AdminApproval"
    WHERE "itemId" = NEW.id AND "decision" = 'rejected';

  IF rejected > 0 THEN
    RAISE EXCEPTION 'A rejected request cannot be marked approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_approval_complete
  BEFORE UPDATE ON "AdminItem"
  FOR EACH ROW EXECUTE FUNCTION enforce_approval_complete();

-- 9f. Dates that cannot run backwards.
ALTER TABLE "HolidayRequest"
  ADD CONSTRAINT holiday_dates_ordered
  CHECK ("endsOn" >= "startsOn");

ALTER TABLE "HolidayRequest"
  ADD CONSTRAINT holiday_hours_positive
  CHECK ("hoursRequested" > 0);

-- A decision is recorded whole here too.
ALTER TABLE "HolidayRequest"
  ADD CONSTRAINT holiday_decision_whole
  CHECK (
    "decision" = 'pending'
    OR num_nonnulls("decidedAt", "decidedByUserId") = 2
  );

ALTER TABLE "HolidayEntitlement"
  ADD CONSTRAINT entitlement_leave_year_ordered
  CHECK ("leaveYearEnd" > "leaveYearStart");

ALTER TABLE "HolidayEntitlement"
  ADD CONSTRAINT entitlement_hours_not_negative
  CHECK ("entitlementHours" >= 0 AND "carriedOverHours" >= 0);

ALTER TABLE "Suspension"
  ADD CONSTRAINT suspension_dates_ordered
  CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn");

ALTER TABLE "Voucher"
  ADD CONSTRAINT voucher_expiry_after_issue
  CHECK ("expiresOn" > "issuedOn");

ALTER TABLE "Voucher"
  ADD CONSTRAINT voucher_value_positive
  CHECK ("valuePence" > 0);

ALTER TABLE "Voucher"
  ADD CONSTRAINT voucher_redeemed_has_date
  CHECK ("state" <> 'redeemed' OR "redeemedOn" IS NOT NULL);

ALTER TABLE "Penalty"
  ADD CONSTRAINT penalty_amount_positive
  CHECK ("amountPence" > 0);

-- A write-off says why. "Written off" with no reason is the row that turns up
-- in an audit and cannot be explained by anyone still working here.
ALTER TABLE "Penalty"
  ADD CONSTRAINT penalty_write_off_has_reason
  CHECK (
    "state" <> 'written_off'
    OR ("writtenOffOn" IS NOT NULL AND "writtenOffReason" IS NOT NULL)
  );

ALTER TABLE "SupplierContract"
  ADD CONSTRAINT contract_dates_ordered
  CHECK ("endsOn" IS NULL OR "endsOn" > "startsOn");

ALTER TABLE "RecurringPayment"
  ADD CONSTRAINT recurring_payment_amount_positive
  CHECK ("agreedAmountPence" > 0);

-- A monthly or quarterly schedule needs a day of the month; a weekly one must
-- not have one, because it would never be used and would look like it was.
--
-- Written as a CASE rather than the obvious pair of OR'd branches. With a NULL
-- dayOfMonth on a monthly schedule, `"dayOfMonth" BETWEEN 1 AND 28` is NULL,
-- `false OR NULL` is NULL, and a CHECK treats NULL as passing — so the obvious
-- version accepted exactly the row it was written to reject. The test caught
-- it; three-valued logic is why constraints get their own test file.
ALTER TABLE "RecurringPayment"
  ADD CONSTRAINT recurring_payment_day_matches_frequency
  CHECK (
    CASE WHEN "frequency" = 'weekly'
         THEN "dayOfMonth" IS NULL
         ELSE "dayOfMonth" IS NOT NULL AND "dayOfMonth" BETWEEN 1 AND 28
    END
  );

ALTER TABLE "PaymentInstance"
  ADD CONSTRAINT payment_instance_amounts_not_negative
  CHECK (
    "amountDuePence" >= 0
    AND ("amountPaidPence" IS NULL OR "amountPaidPence" >= 0)
  );

-- Paid means a date and an amount, both.
ALTER TABLE "PaymentInstance"
  ADD CONSTRAINT payment_instance_paid_whole
  CHECK (num_nonnulls("paidOn", "amountPaidPence") <> 1);

-- 9g. Stock movements are signed, and the sign has to agree with the kind.
-- Storing a kind and a magnitude separately is how a return ends up reducing
-- stock.
ALTER TABLE "StockMovement"
  ADD CONSTRAINT stock_movement_sign_matches_kind
  CHECK (
    ("kind" IN ('received', 'returned') AND "quantity" > 0)
    OR ("kind" IN ('issued', 'written_off') AND "quantity" < 0)
    OR ("kind" = 'adjustment' AND "quantity" <> 0)
  );

ALTER TABLE "StockItem"
  ADD CONSTRAINT stock_reorder_level_not_negative
  CHECK ("reorderLevel" >= 0);

-- 9h. An accreditation's evidence either points somewhere or says it is manual.
-- A "derived" requirement with nothing naming the query is a promise, not a
-- control.
ALTER TABLE "AccreditationRequirement"
  ADD CONSTRAINT accreditation_evidence_has_source
  CHECK (
    ("source" IN ('derived_screening', 'derived_quality', 'derived_training')
      AND "derivedFrom" IS NOT NULL)
    OR ("source" = 'document' AND "documentId" IS NOT NULL)
    OR ("source" = 'manual')
  );

ALTER TABLE "AccreditationRequirement"
  ADD CONSTRAINT accreditation_satisfied_whole
  CHECK (num_nonnulls("satisfiedAt", "satisfiedByUserId") <> 1);
