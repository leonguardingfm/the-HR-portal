-- The links in application and reference emails, sealed with the server's secret so a reminder can carry them again.
-- AlterTable
ALTER TABLE "CandidateInvite" ADD COLUMN     "tokenSealed" TEXT;

-- AlterTable
ALTER TABLE "ReferenceRequest" ADD COLUMN     "tokenSealed" TEXT;

