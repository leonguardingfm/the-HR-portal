-- Client requirements, Track A: the pool check, release to sourcing, and
-- headcount counted from allocations. Rules: lib/core/requirements.ts.

-- CreateEnum
CREATE TYPE "AllocationSource" AS ENUM ('pool', 'recruited');

-- AlterTable
ALTER TABLE "Requirement" ADD COLUMN     "cancelledReason" TEXT,
ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "poolCheckNote" TEXT,
ADD COLUMN     "poolCheckedAt" TIMESTAMPTZ(3),
ADD COLUMN     "releaseNote" TEXT;

-- CreateTable
CREATE TABLE "RequirementAllocation" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "source" "AllocationSource" NOT NULL,
    "candidacyId" TEXT,
    "allocatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "allocatedById" TEXT NOT NULL,
    "releasedAt" TIMESTAMPTZ(3),
    "releasedReason" TEXT,

    CONSTRAINT "RequirementAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RequirementAllocation_requirementId_idx" ON "RequirementAllocation"("requirementId");

-- CreateIndex
CREATE INDEX "RequirementAllocation_personId_idx" ON "RequirementAllocation"("personId");

-- AddForeignKey
ALTER TABLE "RequirementAllocation" ADD CONSTRAINT "RequirementAllocation_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequirementAllocation" ADD CONSTRAINT "RequirementAllocation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Constraints from prisma/constraints.sql that Prisma cannot express.

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
