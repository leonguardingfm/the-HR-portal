-- Screening exceptions: risk and adverse findings, extensions and statutory
-- declarations, from raised to decided. Rules: lib/core/screening-exceptions.ts.

-- CreateEnum
CREATE TYPE "DecisionOutcome" AS ENUM ('accepted', 'declined', 'approved', 'refused');

-- CreateEnum
CREATE TYPE "ExceptionKind" AS ENUM ('risk_finding', 'adverse_finding', 'extension', 'statutory_declaration');

-- CreateEnum
CREATE TYPE "ExceptionState" AS ENUM ('awaiting_representation', 'awaiting_decision', 'decided');

-- AlterEnum
ALTER TYPE "VettingStatus" ADD VALUE 'unsuccessful';

-- AlterTable
ALTER TABLE "ScreeningDecision" ADD COLUMN     "outcome" "DecisionOutcome";

-- CreateTable
CREATE TABLE "ScreeningException" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "ExceptionKind" NOT NULL,
    "state" "ExceptionState" NOT NULL,
    "trigger" TEXT,
    "detail" TEXT NOT NULL,
    "amountGbp" DECIMAL(12,2),
    "checkId" TEXT,
    "weeks" INTEGER,
    "periodFrom" DATE,
    "periodTo" DATE,
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "representationInvitedAt" TIMESTAMPTZ(3),
    "representation" TEXT,
    "representationRecordedAt" TIMESTAMPTZ(3),
    "representationRecordedById" TEXT,
    "decisionId" TEXT,

    CONSTRAINT "ScreeningException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScreeningException_decisionId_key" ON "ScreeningException"("decisionId");

-- CreateIndex
CREATE INDEX "ScreeningException_fileId_state_idx" ON "ScreeningException"("fileId", "state");

-- CreateIndex
CREATE INDEX "ScreeningException_state_kind_idx" ON "ScreeningException"("state", "kind");

-- AddForeignKey
ALTER TABLE "ScreeningException" ADD CONSTRAINT "ScreeningException_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ScreeningFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningException" ADD CONSTRAINT "ScreeningException_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ScreeningDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Decisions written before outcomes existed were all risk acceptances that
-- accepted the risk: the kind was only ever recorded when it was accepted.
UPDATE "ScreeningDecision" SET outcome = 'accepted' WHERE kind = 'risk_acceptance' AND outcome IS NULL;

-- Constraints from prisma/constraints.sql that Prisma cannot express.

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
