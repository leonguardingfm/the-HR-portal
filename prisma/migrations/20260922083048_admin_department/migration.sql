-- CreateEnum
CREATE TYPE "AdminTrack" AS ENUM ('task', 'request');

-- CreateEnum
CREATE TYPE "AdminCategory" AS ENUM ('payments', 'premises', 'people_admin', 'decisions', 'uniform', 'accreditations');

-- CreateEnum
CREATE TYPE "AdminPriority" AS ENUM ('P1', 'P2', 'P3', 'P4');

-- CreateEnum
CREATE TYPE "AdminItemState" AS ENUM ('raised', 'assigned', 'in_progress', 'reviewed', 'approved', 'rejected', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AdminRequestKind" AS ENUM ('payment', 'purchase', 'voucher', 'penalty', 'suspension', 'holiday', 'authority_response', 'write_off');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('weekly', 'monthly', 'quarterly', 'annually');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('in_service', 'needs_attention', 'out_of_service', 'disposed');

-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('service', 'repair', 'inspection', 'replacement');

-- CreateEnum
CREATE TYPE "HolidayDecision" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "AuthorityBody" AS ENUM ('dwp', 'hmrc', 'home_office', 'tribunal', 'local_authority', 'sia', 'other');

-- CreateEnum
CREATE TYPE "AuthorityMatterState" AS ENUM ('open', 'awaiting_response', 'responded', 'closed');

-- CreateEnum
CREATE TYPE "PenaltyKind" AS ENUM ('fine', 'penalty', 'deduction', 'recharge');

-- CreateEnum
CREATE TYPE "PenaltyState" AS ENUM ('raised', 'approved', 'rejected', 'recovered', 'written_off');

-- CreateEnum
CREATE TYPE "VoucherState" AS ENUM ('issued', 'redeemed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('received', 'issued', 'returned', 'written_off', 'adjustment');

-- CreateEnum
CREATE TYPE "AccreditationState" AS ENUM ('held', 'applying', 'suspended', 'lapsed');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('derived_screening', 'derived_quality', 'derived_training', 'document', 'manual');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'admin_officer';
ALTER TYPE "Role" ADD VALUE 'admin_manager';
ALTER TYPE "Role" ADD VALUE 'finance_officer';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "adminItemId" TEXT;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "adminItemId" TEXT;

-- CreateTable
CREATE TABLE "AdminItem" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "track" "AdminTrack" NOT NULL,
    "category" "AdminCategory" NOT NULL,
    "kind" "AdminRequestKind",
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "priority" "AdminPriority" NOT NULL DEFAULT 'P3',
    "state" "AdminItemState" NOT NULL DEFAULT 'raised',
    "amountPence" INTEGER,
    "aboutPersonId" TEXT,
    "supplierId" TEXT,
    "recurringPaymentId" TEXT,
    "assetId" TEXT,
    "holidayRequestId" TEXT,
    "penaltyId" TEXT,
    "voucherId" TEXT,
    "accreditationId" TEXT,
    "authorityMatterId" TEXT,
    "stockItemId" TEXT,
    "requestedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "assignedToRole" "Role",
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "reviewedAt" TIMESTAMPTZ(3),
    "decidedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "escalatedStage" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdminItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminApproval" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "requiredRoles" "Role"[],
    "reason" TEXT NOT NULL,
    "decision" TEXT,
    "decidedByUserId" TEXT,
    "decidedByRole" "Role",
    "decidedAt" TIMESTAMPTZ(3),
    "grounds" TEXT,
    "amountApprovedPence" INTEGER,

    CONSTRAINT "AdminApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "accountRef" TEXT,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierContract" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "startsOn" TIMESTAMPTZ(3) NOT NULL,
    "endsOn" TIMESTAMPTZ(3),
    "noticePeriodDays" INTEGER NOT NULL DEFAULT 30,
    "agreedAmountPence" INTEGER,
    "notes" TEXT,

    CONSTRAINT "SupplierContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPayment" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "agreedAmountPence" INTEGER NOT NULL,
    "frequency" "PaymentFrequency" NOT NULL,
    "dayOfMonth" INTEGER,
    "firstDueOn" TIMESTAMPTZ(3) NOT NULL,
    "endsOn" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstance" (
    "id" TEXT NOT NULL,
    "recurringPaymentId" TEXT NOT NULL,
    "dueOn" TIMESTAMPTZ(3) NOT NULL,
    "amountDuePence" INTEGER NOT NULL,
    "paidOn" TIMESTAMPTZ(3),
    "amountPaidPence" INTEGER,
    "reference" TEXT,
    "varianceApprovedByUserId" TEXT,
    "varianceApprovedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchasedOn" TIMESTAMPTZ(3),
    "purchaseCostPence" INTEGER,
    "warrantyEndsOn" TIMESTAMPTZ(3),
    "serviceIntervalMonths" INTEGER,
    "lastServicedOn" TIMESTAMPTZ(3),
    "nextServiceOn" TIMESTAMPTZ(3),
    "condition" "AssetCondition" NOT NULL DEFAULT 'in_service',

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceJob" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedByUserId" TEXT,
    "description" TEXT NOT NULL,
    "supplierId" TEXT,
    "costPence" INTEGER,
    "completedAt" TIMESTAMPTZ(3),
    "outcome" TEXT,

    CONSTRAINT "MaintenanceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayEntitlement" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "leaveYearStart" TIMESTAMPTZ(3) NOT NULL,
    "leaveYearEnd" TIMESTAMPTZ(3) NOT NULL,
    "entitlementHours" INTEGER NOT NULL,
    "carriedOverHours" INTEGER NOT NULL DEFAULT 0,
    "basis" TEXT,

    CONSTRAINT "HolidayEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HolidayRequest" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "entitlementId" TEXT,
    "startsOn" TIMESTAMPTZ(3) NOT NULL,
    "endsOn" TIMESTAMPTZ(3) NOT NULL,
    "hoursRequested" INTEGER NOT NULL,
    "decision" "HolidayDecision" NOT NULL DEFAULT 'pending',
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "decidedByUserId" TEXT,
    "note" TEXT,
    "shiftsAffected" INTEGER,

    CONSTRAINT "HolidayRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorityMatter" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "body" "AuthorityBody" NOT NULL,
    "matterType" TEXT NOT NULL,
    "personId" TEXT,
    "receivedOn" TIMESTAMPTZ(3) NOT NULL,
    "dueOn" TIMESTAMPTZ(3),
    "state" "AuthorityMatterState" NOT NULL DEFAULT 'open',
    "summary" TEXT NOT NULL,
    "respondedOn" TIMESTAMPTZ(3),
    "closedOn" TIMESTAMPTZ(3),

    CONSTRAINT "AuthorityMatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suspension" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "startsOn" TIMESTAMPTZ(3) NOT NULL,
    "endsOn" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "decidedByUserId" TEXT,
    "liftedOn" TIMESTAMPTZ(3),

    CONSTRAINT "Suspension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Penalty" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "PenaltyKind" NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "grounds" TEXT NOT NULL,
    "state" "PenaltyState" NOT NULL DEFAULT 'raised',
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveredOn" TIMESTAMPTZ(3),
    "writtenOffOn" TIMESTAMPTZ(3),
    "writtenOffReason" TEXT,

    CONSTRAINT "Penalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "personId" TEXT,
    "valuePence" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "issuedOn" TIMESTAMPTZ(3) NOT NULL,
    "expiresOn" TIMESTAMPTZ(3) NOT NULL,
    "state" "VoucherState" NOT NULL DEFAULT 'issued',
    "redeemedOn" TIMESTAMPTZ(3),

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "equipmentItemId" TEXT NOT NULL,
    "size" TEXT,
    "reorderLevel" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "note" TEXT,
    "equipmentIssueId" TEXT,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accreditation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "certificateNumber" TEXT,
    "firstAwardedOn" TIMESTAMPTZ(3),
    "expiresOn" TIMESTAMPTZ(3) NOT NULL,
    "nextAuditOn" TIMESTAMPTZ(3),
    "state" "AccreditationState" NOT NULL DEFAULT 'held',
    "ownerRole" "Role",

    CONSTRAINT "Accreditation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditationRequirement" (
    "id" TEXT NOT NULL,
    "accreditationId" TEXT NOT NULL,
    "clause" TEXT,
    "label" TEXT NOT NULL,
    "source" "EvidenceSource" NOT NULL,
    "derivedFrom" TEXT,
    "documentId" TEXT,
    "satisfiedAt" TIMESTAMPTZ(3),
    "satisfiedByUserId" TEXT,
    "note" TEXT,

    CONSTRAINT "AccreditationRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccreditationSubmission" (
    "id" TEXT NOT NULL,
    "accreditationId" TEXT NOT NULL,
    "submittedOn" TIMESTAMPTZ(3) NOT NULL,
    "submittedByUserId" TEXT,
    "outcome" TEXT,
    "newExpiresOn" TIMESTAMPTZ(3),

    CONSTRAINT "AccreditationSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminItem_reference_key" ON "AdminItem"("reference");

-- CreateIndex
CREATE INDEX "AdminItem_state_dueAt_idx" ON "AdminItem"("state", "dueAt");

-- CreateIndex
CREATE INDEX "AdminItem_category_state_idx" ON "AdminItem"("category", "state");

-- CreateIndex
CREATE INDEX "AdminItem_assignedToUserId_state_dueAt_idx" ON "AdminItem"("assignedToUserId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "AdminItem_requestedByUserId_idx" ON "AdminItem"("requestedByUserId");

-- CreateIndex
CREATE INDEX "AdminApproval_decision_decidedAt_idx" ON "AdminApproval"("decision", "decidedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminApproval_itemId_step_key" ON "AdminApproval"("itemId", "step");

-- CreateIndex
CREATE UNIQUE INDEX "AdminApproval_itemId_decidedByUserId_key" ON "AdminApproval"("itemId", "decidedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE INDEX "SupplierContract_endsOn_idx" ON "SupplierContract"("endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierContract_supplierId_reference_key" ON "SupplierContract"("supplierId", "reference");

-- CreateIndex
CREATE INDEX "RecurringPayment_active_firstDueOn_idx" ON "RecurringPayment"("active", "firstDueOn");

-- CreateIndex
CREATE INDEX "PaymentInstance_dueOn_paidOn_idx" ON "PaymentInstance"("dueOn", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstance_recurringPaymentId_dueOn_key" ON "PaymentInstance"("recurringPaymentId", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tag_key" ON "Asset"("tag");

-- CreateIndex
CREATE INDEX "Asset_nextServiceOn_idx" ON "Asset"("nextServiceOn");

-- CreateIndex
CREATE INDEX "Asset_condition_idx" ON "Asset"("condition");

-- CreateIndex
CREATE INDEX "MaintenanceJob_assetId_reportedAt_idx" ON "MaintenanceJob"("assetId", "reportedAt");

-- CreateIndex
CREATE INDEX "MaintenanceJob_completedAt_idx" ON "MaintenanceJob"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HolidayEntitlement_personId_leaveYearStart_key" ON "HolidayEntitlement"("personId", "leaveYearStart");

-- CreateIndex
CREATE INDEX "HolidayRequest_personId_startsOn_idx" ON "HolidayRequest"("personId", "startsOn");

-- CreateIndex
CREATE INDEX "HolidayRequest_decision_raisedAt_idx" ON "HolidayRequest"("decision", "raisedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthorityMatter_reference_key" ON "AuthorityMatter"("reference");

-- CreateIndex
CREATE INDEX "AuthorityMatter_state_dueOn_idx" ON "AuthorityMatter"("state", "dueOn");

-- CreateIndex
CREATE INDEX "AuthorityMatter_personId_idx" ON "AuthorityMatter"("personId");

-- CreateIndex
CREATE INDEX "Suspension_personId_startsOn_idx" ON "Suspension"("personId", "startsOn");

-- CreateIndex
CREATE INDEX "Suspension_endsOn_idx" ON "Suspension"("endsOn");

-- CreateIndex
CREATE UNIQUE INDEX "Penalty_reference_key" ON "Penalty"("reference");

-- CreateIndex
CREATE INDEX "Penalty_state_raisedAt_idx" ON "Penalty"("state", "raisedAt");

-- CreateIndex
CREATE INDEX "Penalty_personId_idx" ON "Penalty"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_reference_key" ON "Voucher"("reference");

-- CreateIndex
CREATE INDEX "Voucher_state_expiresOn_idx" ON "Voucher"("state", "expiresOn");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_equipmentItemId_size_key" ON "StockItem"("equipmentItemId", "size");

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_at_idx" ON "StockMovement"("stockItemId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Accreditation_name_key" ON "Accreditation"("name");

-- CreateIndex
CREATE INDEX "Accreditation_state_expiresOn_idx" ON "Accreditation"("state", "expiresOn");

-- CreateIndex
CREATE INDEX "AccreditationRequirement_accreditationId_satisfiedAt_idx" ON "AccreditationRequirement"("accreditationId", "satisfiedAt");

-- CreateIndex
CREATE INDEX "AccreditationSubmission_accreditationId_submittedOn_idx" ON "AccreditationSubmission"("accreditationId", "submittedOn");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_adminItemId_fkey" FOREIGN KEY ("adminItemId") REFERENCES "AdminItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_adminItemId_fkey" FOREIGN KEY ("adminItemId") REFERENCES "AdminItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "RecurringPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_holidayRequestId_fkey" FOREIGN KEY ("holidayRequestId") REFERENCES "HolidayRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES "Penalty"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "Accreditation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_authorityMatterId_fkey" FOREIGN KEY ("authorityMatterId") REFERENCES "AuthorityMatter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminItem" ADD CONSTRAINT "AdminItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminApproval" ADD CONSTRAINT "AdminApproval_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "AdminItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierContract" ADD CONSTRAINT "SupplierContract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstance" ADD CONSTRAINT "PaymentInstance_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES "RecurringPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceJob" ADD CONSTRAINT "MaintenanceJob_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayEntitlement" ADD CONSTRAINT "HolidayEntitlement_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRequest" ADD CONSTRAINT "HolidayRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayRequest" ADD CONSTRAINT "HolidayRequest_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "HolidayEntitlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorityMatter" ADD CONSTRAINT "AuthorityMatter_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suspension" ADD CONSTRAINT "Suspension_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Penalty" ADD CONSTRAINT "Penalty_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES "EquipmentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditationRequirement" ADD CONSTRAINT "AccreditationRequirement_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "Accreditation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccreditationSubmission" ADD CONSTRAINT "AccreditationSubmission_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES "Accreditation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Constraints from prisma/constraints.sql that Prisma cannot express.
-- ===========================================================================

-- The WorkItem subject check gains the Admin item: an Admin task belongs in
-- the one queue, and the old check would have rejected it for having no
-- subject at all.
ALTER TABLE "WorkItem" DROP CONSTRAINT IF EXISTS work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId"
  ) = 1);

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
