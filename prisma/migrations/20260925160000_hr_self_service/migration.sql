-- HR self-service (25 September 2026): candidates fill in their application and
-- upload their own documents through an emailed link; referees answer online;
-- interviews are booked ahead; every email is kept; the employee record gains
-- its contract and training; leavers are recorded with their last day.

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('full_time', 'part_time', 'zero_hours', 'casual', 'fixed_term');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('sent', 'failed', 'not_configured');

-- CreateEnum
CREATE TYPE "InvitePurpose" AS ENUM ('application', 'welcome_pack');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('booked', 'held', 'cancelled', 'no_show');

-- AlterTable
ALTER TABLE "Candidacy" ADD COLUMN     "applicationSubmittedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "contractSignedAt" DATE,
ADD COLUMN     "contractType" "ContractType",
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastWorkingDay" DATE,
ADD COLUMN     "leaverNote" TEXT,
ADD COLUMN     "leaverRecordedById" TEXT,
ADD COLUMN     "noticeWeeks" INTEGER,
ADD COLUMN     "payRatePence" INTEGER;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "address" TEXT,
ADD COLUMN     "nextOfKinRelation" TEXT,
ADD COLUMN     "postcode" TEXT;

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "provider" TEXT,
    "completedOn" DATE NOT NULL,
    "expiresOn" DATE,
    "documentId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "personId" TEXT,
    "candidacyId" TEXT,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateInvite" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "purpose" "InvitePurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "openedAt" TIMESTAMPTZ(3),
    "submittedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "reminders" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMPTZ(3),
    "draft" JSONB,
    "submission" JSONB,
    "signedName" TEXT,
    "signedAt" TIMESTAMPTZ(3),
    "signedIp" TEXT,

    CONSTRAINT "CandidateInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewBooking" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "stage" "InterviewStage" NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 30,
    "place" TEXT NOT NULL,
    "interviewerUserId" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'booked',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "reminderSentAt" TIMESTAMPTZ(3),
    "cancelledReason" TEXT,

    CONSTRAINT "InterviewBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceRequest" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "refereeName" TEXT NOT NULL,
    "sentAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT NOT NULL,
    "chases" INTEGER NOT NULL DEFAULT 0,
    "lastChasedAt" TIMESTAMPTZ(3),
    "respondedAt" TIMESTAMPTZ(3),
    "response" JSONB,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ReferenceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingRecord_documentId_key" ON "TrainingRecord"("documentId");

-- CreateIndex
CREATE INDEX "TrainingRecord_personId_idx" ON "TrainingRecord"("personId");

-- CreateIndex
CREATE INDEX "TrainingRecord_expiresOn_idx" ON "TrainingRecord"("expiresOn");

-- CreateIndex
CREATE INDEX "EmailMessage_personId_createdAt_idx" ON "EmailMessage"("personId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_candidacyId_createdAt_idx" ON "EmailMessage"("candidacyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateInvite_tokenHash_key" ON "CandidateInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "CandidateInvite_candidacyId_idx" ON "CandidateInvite"("candidacyId");

-- CreateIndex
CREATE INDEX "InterviewBooking_startsAt_idx" ON "InterviewBooking"("startsAt");

-- CreateIndex
CREATE INDEX "InterviewBooking_candidacyId_idx" ON "InterviewBooking"("candidacyId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceRequest_tokenHash_key" ON "ReferenceRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "ReferenceRequest_periodId_idx" ON "ReferenceRequest"("periodId");

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateInvite" ADD CONSTRAINT "CandidateInvite_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewBooking" ADD CONSTRAINT "InterviewBooking_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceRequest" ADD CONSTRAINT "ReferenceRequest_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "HistoryPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;


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

-- Document types the self-service needs: the CV the candidate sends, and the
-- signed contract on the employee record.
INSERT INTO "DocumentType" (id, label, department, "expires", "copyRetained", clause)
VALUES ('cv', 'CV', 'recruitment', false, true, NULL),
       ('employment_contract', 'Signed employment contract', 'recruitment', false, true, NULL)
ON CONFLICT (id) DO NOTHING;
