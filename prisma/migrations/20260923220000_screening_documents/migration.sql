-- Uploaded documents on screening files: the file described, the date on it,
-- who inspected the original, and what it is evidence for.

-- AlterTable
ALTER TABLE "DocumentRecord" ADD COLUMN     "checkId" TEXT,
ADD COLUMN     "documentDate" DATE,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "historyPeriodId" TEXT,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "originalSeenAt" TIMESTAMPTZ(3),
ADD COLUMN     "originalSeenById" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "sizeBytes" INTEGER,
ADD COLUMN     "uploadedById" TEXT;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "ScreeningCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_historyPeriodId_fkey" FOREIGN KEY ("historyPeriodId") REFERENCES "HistoryPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Constraints from prisma/constraints.sql that Prisma cannot express.

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
