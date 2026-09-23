-- Career and history, one row per period. Figures on the file are calculated
-- from these rows: lib/core/history.ts.

-- CreateEnum
CREATE TYPE "HistoryKind" AS ENUM ('employment', 'self_employment', 'education', 'unemployment', 'career_break', 'residence_abroad', 'gap');

-- CreateEnum
CREATE TYPE "HistoryMethod" AS ENUM ('reference', 'documentary', 'government_record');

-- CreateTable
CREATE TABLE "HistoryPeriod" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "HistoryKind" NOT NULL,
    "organisation" TEXT,
    "role" TEXT,
    "statedFrom" DATE NOT NULL,
    "statedTo" DATE,
    "confirmedFrom" DATE,
    "confirmedTo" DATE,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "permissionToContact" BOOLEAN,
    "verifierName" TEXT,
    "verifierContact" TEXT,
    "contactVerifiedHow" TEXT,
    "firstRequestAt" TIMESTAMPTZ(3),
    "secondRequestAt" TIMESTAMPTZ(3),
    "method" "HistoryMethod",
    "documentStart" TEXT,
    "documentEnd" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoryPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoryPeriod_fileId_statedFrom_idx" ON "HistoryPeriod"("fileId", "statedFrom");

-- AddForeignKey
ALTER TABLE "HistoryPeriod" ADD CONSTRAINT "HistoryPeriod_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ScreeningFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Constraints from prisma/constraints.sql that Prisma cannot express.

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
