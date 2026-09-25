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

-- ---------------------------------------------------------------------------
-- 10. Delegated roles
-- ---------------------------------------------------------------------------
-- A delegation covers an absence. Every rule here exists to stop one quietly
-- becoming an appointment.

-- 10a. It ends. The column is already NOT NULL; this is the ordering.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_ends_after_it_starts
  CHECK ("endsAt" > "startsAt");

-- 10b. Ninety days at most. Anything longer is an appointment, and should be
-- a role grant that somebody decided to make, with its own record.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_longer_than_90_days
  CHECK ("endsAt" <= "startsAt" + INTERVAL '90 days');

-- 10c. Nobody lends a role to themselves, and nobody arranges their own cover.
-- Both are the loophole that would make the rest of this pointless.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_to_self
  CHECK ("toUserId" <> "fromUserId");

ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_not_granted_to_self
  CHECK ("toUserId" <> "grantedByUserId");

-- 10d. A revocation is recorded whole: when, by whom, and why.
ALTER TABLE "RoleDelegation"
  ADD CONSTRAINT delegation_revocation_whole
  CHECK (num_nonnulls("revokedAt", "revokedByUserId", "revokedReason") IN (0, 3));

-- 10e. One live delegation of a role to a person at a time.
--
-- A partial unique index rather than a constraint, because it only applies
-- while the delegation is unrevoked. Two overlapping delegations of the same
-- role to the same person are not twice the cover; they are two expiry dates
-- and an argument about which one counts.
CREATE UNIQUE INDEX delegation_one_live_per_role_per_person
  ON "RoleDelegation" ("role", "toUserId")
  WHERE "revokedAt" IS NULL;

-- 10f. The lender actually holds the role.
--
-- Needs UserRole, so it is a trigger. Without it, a role nobody holds can be
-- lent — which reads as authority and is not.
CREATE OR REPLACE FUNCTION enforce_delegation_source()
RETURNS TRIGGER AS $$
DECLARE
  holds INT;
BEGIN
  SELECT count(*) INTO holds
    FROM "UserRole"
    WHERE "userId" = NEW."fromUserId"
      AND "role" = NEW."role"
      AND "revokedAt" IS NULL;

  IF holds = 0 THEN
    RAISE EXCEPTION
      'A role cannot be delegated by somebody who does not hold it (%)', NEW."role";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER delegation_source
  BEFORE INSERT ON "RoleDelegation"
  FOR EACH ROW EXECUTE FUNCTION enforce_delegation_source();

-- ---------------------------------------------------------------------------
-- 12. The no-signal handover
-- ---------------------------------------------------------------------------
-- A transfer of responsibility, so it is recorded whole or not at all.

-- 12a. Telling the client is recorded with who was told and when, together.
-- "Notified" with no name is not evidence that anybody was notified.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_notification_whole
  CHECK (num_nonnulls("notifiedAt", "notifiedContact") <> 1);

-- 12b. Same for the client coming back to say they cannot reach the officer.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_loss_report_whole
  CHECK (num_nonnulls("lossReportedAt", "lossReportedBy") <> 1);

-- 12c. The client cannot report losing contact before they were given it.
-- Out of order here means somebody back-filled a record, which is exactly the
-- thing a duty-of-care trail has to be able to rule out.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_loss_after_handover
  CHECK (
    "lossReportedAt" IS NULL
    OR ("notifiedAt" IS NOT NULL AND "lossReportedAt" >= "notifiedAt")
  );

-- 12d. A handover only exists for a post with no signal.
--
-- Needs Post via Assignment, so it is a trigger. Without it the record could
-- be created against a post that has a signal, and the board would then stop
-- expecting check calls on a post where the officer can perfectly well make
-- them — which is the failure this whole mechanism exists to avoid, inverted.
CREATE OR REPLACE FUNCTION enforce_no_signal_post()
RETURNS TRIGGER AS $$
DECLARE
  has_signal BOOLEAN;
BEGIN
  SELECT p."mobileSignal" INTO has_signal
    FROM "Assignment" a
    JOIN "Post" p ON p.id = a."postId"
    WHERE a.id = NEW."assignmentId";

  IF has_signal IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION
      'A no-signal handover only applies to a post recorded as having no mobile signal';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_signal_handover_post
  BEFORE INSERT ON "NoSignalHandover"
  FOR EACH ROW EXECUTE FUNCTION enforce_no_signal_post();

-- ---------------------------------------------------------------------------
-- 13. Screening exceptions  [7.4f, 7.6, 7.7i, Form 5]
-- ---------------------------------------------------------------------------
-- The cases a senior person has to decide. The portal never auto-approves an
-- extension or auto-clears a finding (docs/proposal/03 §7); these are the
-- shapes a case may take, whatever the code that writes it.

-- 13a. An extension is the single four-week extension, and only an extension
-- carries weeks [7.6].
ALTER TABLE "ScreeningException"
  ADD CONSTRAINT exception_extension_weeks
  CHECK (("kind" = 'extension') = ("weeks" IS NOT NULL) AND ("weeks" IS NULL OR "weeks" = 4));

-- 13b. A statutory declaration covers one period of no more than six months
-- [7.7i], and only a declaration carries a period.
ALTER TABLE "ScreeningException"
  ADD CONSTRAINT exception_declaration_period
  CHECK (
    ("kind" = 'statutory_declaration') = ("periodFrom" IS NOT NULL AND "periodTo" IS NOT NULL)
    AND ("periodFrom" IS NULL OR ("periodFrom" <= "periodTo" AND "periodTo" - "periodFrom" <= 183))
  );

-- 13c. A CCJ finding records the amount, and only needs deciding above £10,000
-- [7.4f, Form 5]. Below that it is a note on the check, not a case.
ALTER TABLE "ScreeningException"
  ADD CONSTRAINT exception_ccj_threshold
  CHECK ("trigger" IS DISTINCT FROM 'ccj' OR "amountGbp" > 10000);

-- 13d. Decided means a signed decision exists, and nothing else does.
ALTER TABLE "ScreeningException"
  ADD CONSTRAINT exception_decided_has_decision
  CHECK (("state" = 'decided') = ("decisionId" IS NOT NULL));

-- 13e. A representation is recorded whole: when, and by whom.
ALTER TABLE "ScreeningException"
  ADD CONSTRAINT exception_representation_whole
  CHECK (num_nonnulls("representationRecordedAt", "representationRecordedById") <> 1);

-- 13f. One open request of each of these kinds per file at a time. Two
-- extension requests in flight is two chances to approve one extension twice.
CREATE UNIQUE INDEX exception_one_open_request
  ON "ScreeningException" ("fileId", "kind")
  WHERE "state" <> 'decided' AND "kind" IN ('extension', 'statutory_declaration');

-- 13g. A decision's outcome matches what was being decided: a risk is accepted
-- or declined, a request approved or refused.
ALTER TABLE "ScreeningDecision"
  ADD CONSTRAINT decision_outcome_fits_kind
  CHECK (
    "outcome" IS NULL
    OR ("kind" IN ('risk_acceptance', 'adverse_finding') AND "outcome" IN ('accepted', 'declined'))
    OR ("kind" IN ('extension', 'statutory_declaration') AND "outcome" IN ('approved', 'refused'))
  );

-- 13h. The grounds for a decision are written down [7.4f].
ALTER TABLE "ScreeningDecision"
  ADD CONSTRAINT decision_has_grounds
  CHECK (length(btrim("rationale")) >= 10);

-- ---------------------------------------------------------------------------
-- 14. Career and history periods  [7.5.2a, 7.7]
-- ---------------------------------------------------------------------------
-- One row per period of the timeline. The file's unverified days are
-- calculated from these, so a row that lies about itself would make the
-- calculation lie too.

-- 14a. Dates run forwards, as stated and as confirmed.
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_dates_in_order
  CHECK (
    ("statedTo" IS NULL OR "statedFrom" <= "statedTo")
    AND ("confirmedFrom" IS NULL OR "confirmedTo" IS NULL OR "confirmedFrom" <= "confirmedTo")
  );

-- 14b. A current period is still going.
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_current_is_open
  CHECK (NOT "isCurrent" OR "statedTo" IS NULL);

-- 14c. A current employer is not approached without the individual's prior
-- written permission [7.7b].
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_current_employer_permission
  CHECK (NOT "isCurrent" OR "firstRequestAt" IS NULL OR "permissionToContact" IS TRUE);

-- 14d. No reference request without a record of how the verifier's contact
-- detail was established independently [7.5.2a].
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_request_contact_established
  CHECK ("firstRequestAt" IS NULL OR length(btrim(coalesce("contactVerifiedHow", ''))) > 0);

-- 14e. A second request follows a first.
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_second_after_first
  CHECK ("secondRequestAt" IS NULL OR ("firstRequestAt" IS NOT NULL AND "secondRequestAt" >= "firstRequestAt"));

-- 14f. Verified is recorded whole: how, when and by whom.
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_verified_whole
  CHECK (num_nonnulls("method", "verifiedAt", "verifiedById") IN (0, 3));

-- 14g. A reference is only verified once the contact has been established,
-- and documents are two of different types, one at each end [SV].
ALTER TABLE "HistoryPeriod"
  ADD CONSTRAINT history_method_evidence
  CHECK (
    ("method" IS DISTINCT FROM 'reference' OR length(btrim(coalesce("contactVerifiedHow", ''))) > 0)
    AND (
      "method" IS DISTINCT FROM 'documentary'
      OR ("documentStart" IS NOT NULL AND "documentEnd" IS NOT NULL
          AND lower(btrim("documentStart")) <> lower(btrim("documentEnd")))
    )
  );

-- ---------------------------------------------------------------------------
-- 15. Uploaded documents  [7.4c, 7.7j]
-- ---------------------------------------------------------------------------
-- A stored copy of an identity document is the most sensitive thing the
-- platform holds. What is kept is described whole, is of a type the platform
-- can show safely, and says who looked at the original.

-- 15a. The copy is described whole: name, type, size and checksum together.
ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_file_whole
  CHECK (num_nonnulls("fileName", "mimeType", "sizeBytes", "sha256") IN (0, 4));

-- 15b. A described copy has somewhere it is stored.
ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_file_stored
  CHECK ("sha256" IS NULL OR "storageKey" IS NOT NULL);

-- 15c. PDF, JPEG or PNG, and no larger than 10 MB. Anything else is either not
-- a scan of a document or not something a browser should be handed back.
ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_file_kind
  CHECK (
    ("mimeType" IS NULL OR "mimeType" IN ('application/pdf', 'image/jpeg', 'image/png'))
    AND ("sizeBytes" IS NULL OR "sizeBytes" BETWEEN 1 AND 10485760)
  );

-- 15d. Who examined the original, and when, together [7.4c].
ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_original_seen_whole
  CHECK (num_nonnulls("originalSeenById", "originalSeenAt") <> 1);

-- ---------------------------------------------------------------------------
-- 16. Client requirements  [Track A, docs/proposal/03 §3]
-- ---------------------------------------------------------------------------
-- Headcount is counted from allocations, so an allocation that is not what it
-- says would make "two of three filled" a lie.

-- 16a. A requirement asks for at least one officer.
ALTER TABLE "Requirement"
  ADD CONSTRAINT requirement_headcount_positive
  CHECK ("headcountRequired" >= 1);

-- 16b. Cancelled says why.
ALTER TABLE "Requirement"
  ADD CONSTRAINT requirement_cancelled_has_reason
  CHECK ("status" <> 'cancelled' OR length(btrim(coalesce("cancelledReason", ''))) > 0);

-- 16c. One live allocation per person per requirement. Allocating the same
-- officer twice is one officer counted as two.
CREATE UNIQUE INDEX requirement_allocation_once
  ON "RequirementAllocation" ("requirementId", "personId")
  WHERE "releasedAt" IS NULL;

-- 16d. Taken off with the reason, together.
ALTER TABLE "RequirementAllocation"
  ADD CONSTRAINT allocation_release_whole
  CHECK (num_nonnulls("releasedAt", "releasedReason") <> 1);

-- 16e. A recruited allocation names the candidacy that brought them; one from
-- the pool does not.
ALTER TABLE "RequirementAllocation"
  ADD CONSTRAINT allocation_source_candidacy
  CHECK (("source" = 'recruited') = ("candidacyId" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 17. Building the rota  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- Availability is known by asking, so the ask is the record of it. A yes is
-- what put the shift on the rota; anything else did not.

-- 17a. An asked-about shift ends after it starts, like the shift itself.
ALTER TABLE "ShiftAsk"
  ADD CONSTRAINT shift_ask_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- 17b. A yes names the draft it made, and only a yes does.
ALTER TABLE "ShiftAsk"
  ADD CONSTRAINT shift_ask_yes_has_shift
  CHECK (("answer" = 'yes') = ("assignmentId" IS NOT NULL));

-- 17c. The shift a yes names is the one that was asked about: the same
-- officer, the same post, the same hours.
CREATE OR REPLACE FUNCTION enforce_shift_ask_matches() RETURNS trigger AS $$
BEGIN
  IF NEW."assignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a
    WHERE a.id = NEW."assignmentId"
      AND a."personId" = NEW."personId"
      AND a."postId" = NEW."postId"
      AND a."startsAt" = NEW."startsAt"
      AND a."endsAt" = NEW."endsAt"
  ) THEN
    RAISE EXCEPTION 'A yes names the shift that was asked about: same officer, post and hours'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shift_ask_matches
  BEFORE INSERT OR UPDATE ON "ShiftAsk"
  FOR EACH ROW EXECUTE FUNCTION enforce_shift_ask_matches();

-- ---------------------------------------------------------------------------
-- 18. Changing the rota on the night  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- An officer comes off, and the cover need is what is left. It is either
-- covered, by a shift that really is that cover, or closed with a reason —
-- never quietly both, never quietly neither once it is settled.

-- 18a. An officer's weekly hours are a working week, not a typo.
ALTER TABLE "Employment"
  ADD CONSTRAINT employment_weekly_hours_sane
  CHECK ("weeklyHours" BETWEEN 1 AND 96);

-- 18b. The window still to cover ends after it starts.
ALTER TABLE "CoverNeed"
  ADD CONSTRAINT cover_need_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- 18c. Covered is recorded whole: which shift, and when.
ALTER TABLE "CoverNeed"
  ADD CONSTRAINT cover_need_covered_whole
  CHECK (num_nonnulls("coverAssignmentId", "coveredAt") <> 1);

-- 18d. Left uncovered says when, why and by whom.
ALTER TABLE "CoverNeed"
  ADD CONSTRAINT cover_need_closed_whole
  CHECK (
    num_nonnulls("closedAt", "closedReason", "closedById") IN (0, 3)
    AND ("closedReason" IS NULL OR length(btrim("closedReason")) > 0)
  );

-- 18e. Not both covered and left uncovered.
ALTER TABLE "CoverNeed"
  ADD CONSTRAINT cover_need_covered_or_closed
  CHECK ("coverAssignmentId" IS NULL OR "closedAt" IS NULL);

-- 18f. The cover is that cover: the same post, to the same end, and somebody
-- other than the officer who came off. It may start later than the need —
-- cover found at 23:30 for an officer sent home at 23:00 starts at 23:30, and
-- the half hour nobody was there stays visible rather than papered over.
CREATE OR REPLACE FUNCTION enforce_cover_matches() RETURNS trigger AS $$
BEGIN
  IF NEW."coverAssignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "Assignment" c, "Assignment" f
    WHERE c.id = NEW."coverAssignmentId"
      AND f.id = NEW."fromAssignmentId"
      AND c."postId" = NEW."postId"
      AND c."startsAt" >= NEW."startsAt"
      AND c."endsAt" = NEW."endsAt"
      AND c."personId" <> f."personId"
      AND c.state <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'Cover is the same post, to the same end, worked by someone other than the officer who came off'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cover_matches
  BEFORE INSERT OR UPDATE ON "CoverNeed"
  FOR EACH ROW EXECUTE FUNCTION enforce_cover_matches();

-- ---------------------------------------------------------------------------
-- 19. Open shifts  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- The rota is made first, in bulk, and filled second. A post cannot be given
-- the same hours twice, and a filled shift is filled by that shift.

-- 19a. An open shift ends after it starts.
ALTER TABLE "OpenShift"
  ADD CONSTRAINT open_shift_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- 19b. One post, one shift at a time: creating the same week twice, or two
-- overlapping shifts on one post, is refused rather than doubled.
ALTER TABLE "OpenShift"
  ADD CONSTRAINT open_shift_no_overlap
  EXCLUDE USING gist (
    "postId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("cancelledAt" IS NULL);

-- 19c. Cancelled says why, and a cancelled shift is not filled.
ALTER TABLE "OpenShift"
  ADD CONSTRAINT open_shift_cancelled_whole
  CHECK (
    num_nonnulls("cancelledAt", "cancelledReason") <> 1
    AND ("cancelledReason" IS NULL OR length(btrim("cancelledReason")) > 0)
    AND ("cancelledAt" IS NULL OR "assignmentId" IS NULL)
  );

-- 19d. Filled by an assignment on the same post, to the same end. It may
-- start later: a shift already under way is filled from when it was filled.
CREATE OR REPLACE FUNCTION enforce_open_shift_fill() RETURNS trigger AS $$
BEGIN
  IF NEW."assignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Assignment" a
    WHERE a.id = NEW."assignmentId"
      AND a."postId" = NEW."postId"
      AND a."startsAt" >= NEW."startsAt"
      AND a."endsAt" = NEW."endsAt"
  ) THEN
    RAISE EXCEPTION 'An open shift is filled by an assignment on the same post, to the same end'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER open_shift_fill
  BEFORE INSERT OR UPDATE ON "OpenShift"
  FOR EACH ROW EXECUTE FUNCTION enforce_open_shift_fill();

-- ---------------------------------------------------------------------------
-- 20. Chase-ups  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- A chase-up is about a shift somebody is on, and says what happened.

-- 20a. "No answer" says how they were tried. A confirmation, or a "cannot
-- attend", may come from the officer themselves in their portal, with no
-- channel of Control's.
ALTER TABLE "ChaseUp"
  ADD CONSTRAINT chase_up_how_tried
  CHECK (outcome <> 'no_answer' OR channel IS NOT NULL);

-- 20b. Cannot attend says why — it takes the officer off the shift.
ALTER TABLE "ChaseUp"
  ADD CONSTRAINT chase_up_cannot_attend_says_why
  CHECK (outcome <> 'cannot_attend' OR length(btrim(coalesce(note, ''))) > 0);

-- ---------------------------------------------------------------------------
-- 21. The Control Room, live  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------
-- Clients, sites and posts entered in the portal; selfie proof on book-ons
-- and check calls; officers offering for shifts and saying when they are free;
-- sites an officer is kept off; and the work queue gaining the rota's own
-- subjects.

-- 21a. A work item still has exactly one subject — now including the shift
-- that needs cover, the open shift nobody is on, and an incident.
ALTER TABLE "WorkItem" DROP CONSTRAINT work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId",
    "coverNeedId", "openShiftId", "incidentId"
  ) = 1);

-- 21b. Taken means somebody took it.
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_taken_by_someone
  CHECK ("takenAt" IS NULL OR "ownerUserId" IS NOT NULL);

-- 21c. A site's location is a pair, on the planet, with a sensible radius.
ALTER TABLE "Site"
  ADD CONSTRAINT site_location_pair
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "Site"
  ADD CONSTRAINT site_location_range
  CHECK ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "Site"
  ADD CONSTRAINT site_radius_sensible
  CHECK ("radiusMetres" BETWEEN 25 AND 5000);

-- 21d. One standing exclusion per officer per site; lifting says why.
CREATE UNIQUE INDEX site_exclusion_one_standing
  ON "SiteExclusion" ("siteId", "personId") WHERE "liftedAt" IS NULL;
ALTER TABLE "SiteExclusion"
  ADD CONSTRAINT site_exclusion_says_why
  CHECK (length(btrim("reason")) > 0);
ALTER TABLE "SiteExclusion"
  ADD CONSTRAINT site_exclusion_lift_says_why
  CHECK ("liftedAt" IS NULL OR ("liftedById" IS NOT NULL AND length(btrim(coalesce("liftedReason", ''))) > 0));

-- 21e. A volunteer is waiting until somebody decides — or they withdraw.
ALTER TABLE "ShiftVolunteer"
  ADD CONSTRAINT shift_volunteer_decided
  CHECK (("state" = 'waiting') = ("decidedAt" IS NULL));

-- 21f. A selfie proves one thing: a book-on or one check call, of its kind.
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_one_subject
  CHECK (num_nonnulls("bookOnId", "checkCallId") = 1);
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_kind_matches
  CHECK (("kind" = 'book_on') = ("bookOnId" IS NOT NULL));
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_location_pair
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- 21g. Evidence is not edited. A proof is written once; nothing updates it.
CREATE OR REPLACE FUNCTION refuse_duty_proof_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A duty proof is evidence and is never changed once written'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER duty_proof_immutable
  BEFORE UPDATE ON "DutyProof"
  FOR EACH ROW EXECUTE FUNCTION refuse_duty_proof_update();

-- 21h. Running late is by minutes, and not by a day.
ALTER TABLE "RunningLate"
  ADD CONSTRAINT running_late_sensible
  CHECK ("minutes" BETWEEN 1 AND 240);

-- ---------------------------------------------------------------------------
-- 22. The welfare visit — step 3 of the escalation ladder  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------
-- A supervisor or the Operations Manager goes to site; what they found is
-- recorded, and that record is the end of the duty of care on a missed call.

-- 22a. One visit under way per shift at a time.
CREATE UNIQUE INDEX welfare_visit_one_open
  ON "WelfareVisit" ("assignmentId") WHERE "closedAt" IS NULL;

-- 22b. Somebody named is sent, and is expected after they were sent.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_names_who
  CHECK (length(btrim("attendeeName")) > 0);
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_expected_after_sent
  CHECK ("expectedBy" > "dispatchedAt");
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_arrives_after_sent
  CHECK ("arrivedAt" IS NULL OR "arrivedAt" >= "dispatchedAt");

-- 22c. Closed exactly when there is an outcome, and the outcome says what was found.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_closed_with_outcome
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_outcome_says_what
  CHECK ("outcome" IS NULL OR length(btrim(coalesce("outcomeNote", ''))) > 0);

-- 22d. What was found needs somebody there to find it — unless the officer
-- got in touch first and the visit was stood down.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_found_on_arrival
  CHECK ("outcome" IS NULL OR "outcome" = 'stood_down' OR "arrivedAt" IS NOT NULL);

-- 22e. Not found means the police were told.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_not_found_police
  CHECK ("outcome" IS DISTINCT FROM 'not_found_police' OR "policeCalled");

-- ---------------------------------------------------------------------------
-- 23. HR self-service, the employee record and leavers  [HR, 25 September 2026]
-- ---------------------------------------------------------------------------

-- 23a. One live link per candidate per purpose: a new one withdraws the old.
CREATE UNIQUE INDEX candidate_invite_one_live
  ON "CandidateInvite" ("candidacyId", "purpose") WHERE "revokedAt" IS NULL AND "submittedAt" IS NULL;

-- 23b. An e-signature is a name and a time together; a submitted application is signed.
ALTER TABLE "CandidateInvite"
  ADD CONSTRAINT candidate_invite_signature_whole
  CHECK (("signedAt" IS NULL) = ("signedName" IS NULL));
ALTER TABLE "CandidateInvite"
  ADD CONSTRAINT candidate_invite_submitted_signed
  CHECK ("submittedAt" IS NULL OR "signedAt" IS NOT NULL);

-- 23c. An interview lasts a sensible time; a cancellation says why; one booked per stage.
ALTER TABLE "InterviewBooking"
  ADD CONSTRAINT interview_booking_length
  CHECK ("minutes" BETWEEN 5 AND 480);
ALTER TABLE "InterviewBooking"
  ADD CONSTRAINT interview_booking_cancel_says_why
  CHECK ("status" <> 'cancelled' OR length(btrim(coalesce("cancelledReason", ''))) > 0);
CREATE UNIQUE INDEX interview_booking_one_per_stage
  ON "InterviewBooking" ("candidacyId", "stage") WHERE "status" = 'booked';

-- 23d. One reference request out per history period at a time.
CREATE UNIQUE INDEX reference_request_one_open
  ON "ReferenceRequest" ("periodId") WHERE "respondedAt" IS NULL AND "revokedAt" IS NULL;

-- 23e. A training record names the course and runs out after it was done.
ALTER TABLE "TrainingRecord"
  ADD CONSTRAINT training_names_course
  CHECK (length(btrim("course")) > 0);
ALTER TABLE "TrainingRecord"
  ADD CONSTRAINT training_expires_after_done
  CHECK ("expiresOn" IS NULL OR "expiresOn" > "completedOn");

-- 23f. The contract's numbers are real ones.
ALTER TABLE "Employment"
  ADD CONSTRAINT employment_pay_positive
  CHECK ("payRatePence" IS NULL OR "payRatePence" > 0);
ALTER TABLE "Employment"
  ADD CONSTRAINT employment_notice_sensible
  CHECK ("noticeWeeks" IS NULL OR "noticeWeeks" BETWEEN 0 AND 26);

-- 23g. A leaver has a last day and a reason, and ended employment has a leaving date.
ALTER TABLE "Employment"
  ADD CONSTRAINT employment_leaver_has_reason
  CHECK ("lastWorkingDay" IS NULL OR length(btrim(coalesce("leaverReason", ''))) > 0);
ALTER TABLE "Employment"
  ADD CONSTRAINT employment_ended_when
  CHECK ("state" <> 'ended' OR "endedAt" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 24. The Performance hub  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------

-- 24a. A work item still has exactly one subject — now including a hub task.
ALTER TABLE "WorkItem" DROP CONSTRAINT work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId",
    "coverNeedId", "openShiftId", "incidentId", "hubTaskId"
  ) = 1);

-- 24b. One owner, clearly: unassigned has none, work in hand has one, and an
-- owner was accepted at a known time.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_unassigned_has_no_owner
  CHECK ("status" <> 'unassigned' OR "ownerUserId" IS NULL);
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_in_hand_has_owner
  CHECK ("status" NOT IN ('accepted', 'in_progress', 'awaiting_information', 'awaiting_client', 'awaiting_officer', 'escalated') OR "ownerUserId" IS NOT NULL);
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_owner_accepted_when
  CHECK ("ownerUserId" IS NULL OR "acceptedAt" IS NOT NULL);

-- 24c. Waiting says why, on whom, when it is followed up, and what was done last.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_waiting_whole
  CHECK ("status" NOT IN ('awaiting_information', 'awaiting_client', 'awaiting_officer') OR (
    length(btrim(coalesce("waitingReason", ''))) > 0
    AND length(btrim(coalesce("waitingFor", ''))) > 0
    AND "followUpAt" IS NOT NULL
    AND length(btrim(coalesce("followUpEvidence", ''))) > 0));

-- 24d. Escalated says why.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_escalated_says_why
  CHECK ("status" <> 'escalated' OR length(btrim(coalesce("escalationNote", ''))) > 0);

-- 24e. Closed exactly when there is an outcome and a time.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_closed_whole
  CHECK (("status" IN ('completed', 'unsuccessful', 'cancelled')) = ("outcome" IS NOT NULL AND "completedAt" IS NOT NULL));

-- 24f. An unsuccessful, cancelled or dropped outcome — or one that went over
-- its time — says why and what is being done about it.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_bad_outcome_explained
  CHECK (
    "outcome" IS NULL
    OR ("outcome" NOT IN ('unsuccessful', 'cancelled_by_client', 'cancelled_by_leon', 'dropped_by_leon', 'dropped_by_client') AND "breaches" = 0)
    OR (length(btrim(coalesce("outcomeReason", ''))) > 0 AND length(btrim(coalesce("correctiveAction", ''))) > 0));

-- 24g. "Other" says what it is.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_other_says_what
  CHECK ("category" <> 'other' OR length(btrim(coalesce("categoryNote", ''))) > 0);

-- 24h. A priority change says why; a reassignment or handover says why.
ALTER TABLE "HubChange"
  ADD CONSTRAINT hub_change_priority_says_why
  CHECK ("field" <> 'priority' OR length(btrim(coalesce("reason", ''))) > 0);
ALTER TABLE "HubOwnership"
  ADD CONSTRAINT hub_ownership_move_says_why
  CHECK ("kind" = 'accept' OR length(btrim(coalesce("reason", ''))) > 0);
ALTER TABLE "HubNote"
  ADD CONSTRAINT hub_note_says_something
  CHECK (length(btrim("text")) > 0);

-- 24i. The original email, the ownership history, the corrections and the SLA
-- record are written once and never changed.
CREATE OR REPLACE FUNCTION reject_hub_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The % record is kept as written: it cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inbound_email_immutable BEFORE UPDATE OR DELETE ON "InboundEmail"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_ownership_immutable BEFORE UPDATE OR DELETE ON "HubOwnership"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_change_immutable BEFORE UPDATE OR DELETE ON "HubChange"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_sla_event_immutable BEFORE UPDATE OR DELETE ON "HubSlaEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_note_immutable BEFORE UPDATE OR DELETE ON "HubNote"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();

-- 24j. A removed file says who removed it and why.
ALTER TABLE "HubFile"
  ADD CONSTRAINT hub_file_removal_whole
  CHECK ("removedAt" IS NULL OR ("removedById" IS NOT NULL AND length(btrim(coalesce("removedReason", ''))) > 0));

-- 24k. A notice goes to somebody.
ALTER TABLE "HubNotice"
  ADD CONSTRAINT hub_notice_has_audience
  CHECK (num_nonnulls("toUserId", "toRole", "department") >= 1);

-- ---------------------------------------------------------------------------
-- 25. Personal settings  [25 September 2026]
-- ---------------------------------------------------------------------------

-- 25a. A theme is one of the offered ones: white, dark, following the device,
-- or one of four colours tinted (light) or shaded (dark). Lilac replaced navy
-- on 25 September 2026.
ALTER TABLE "User"
  ADD CONSTRAINT user_theme_known
  CHECK ("theme" IN ('white', 'dark', 'system',
    'lilac-tinted', 'lilac-shaded', 'royal-tinted', 'royal-shaded',
    'gold-tinted', 'gold-shaded', 'teal-tinted', 'teal-shaded'));

-- ---------------------------------------------------------------------------
-- 26. Sign-in security, offline duty records, reply templates  [26 September 2026]
-- ---------------------------------------------------------------------------

-- 26a. Two-factor is on only with a secret to check codes against.
ALTER TABLE "User"
  ADD CONSTRAINT user_totp_has_secret
  CHECK ("totpEnabledAt" IS NULL OR "totpSecret" IS NOT NULL);
ALTER TABLE "User"
  ADD CONSTRAINT user_failed_sign_ins_sensible
  CHECK ("failedSignIns" BETWEEN 0 AND 1000);

-- 26b. A reset link is good for at most a day, and used at most once (usedAt).
ALTER TABLE "PasswordReset"
  ADD CONSTRAINT password_reset_short_lived
  CHECK ("expiresAt" > "createdAt" AND "expiresAt" <= "createdAt" + interval '1 day');

-- 26c. Sent late means it reached us after it was made — never before.
ALTER TABLE "CheckCall"
  ADD CONSTRAINT check_call_sent_after_made
  CHECK ("sentLateAt" IS NULL OR "sentLateAt" >= "at");
ALTER TABLE "BookOn"
  ADD CONSTRAINT book_on_sent_after_made
  CHECK ("sentLateAt" IS NULL OR "sentLateAt" >= "at");

-- 26d. A reply template has a title and words.
ALTER TABLE "ReplyTemplate"
  ADD CONSTRAINT reply_template_whole
  CHECK (length(btrim("title")) > 0 AND length(btrim("body")) > 0);
