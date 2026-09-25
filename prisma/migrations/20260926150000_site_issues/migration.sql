-- CreateEnum
CREATE TYPE "SiteIssueKind" AS ENUM ('door_or_lock', 'leak_or_flood', 'fence_or_gate', 'lighting', 'fire_safety', 'cctv_or_alarm', 'damage', 'hazard', 'other');

-- CreateEnum
CREATE TYPE "SiteIssueUrgency" AS ENUM ('urgent', 'soon', 'routine');

-- CreateEnum
CREATE TYPE "SiteIssueStatus" AS ENUM ('reported', 'kept_internal', 'open', 'client_fixed', 'resolved');

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "siteIssueId" TEXT;

-- CreateTable
CREATE TABLE "SiteIssue" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "siteId" TEXT NOT NULL,
    "postId" TEXT,
    "assignmentId" TEXT,
    "reportedByPersonId" TEXT NOT NULL,
    "reportedByUserId" TEXT,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "SiteIssueKind" NOT NULL,
    "urgency" "SiteIssueUrgency" NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "status" "SiteIssueStatus" NOT NULL DEFAULT 'reported',
    "clientText" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "internalReason" TEXT,
    "clientFixedAt" TIMESTAMPTZ(3),
    "clientFixedById" TEXT,
    "clientFixedNote" TEXT,
    "checkedAt" TIMESTAMPTZ(3),
    "checkedByPersonId" TEXT,
    "checkedByUserId" TEXT,
    "checkNote" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "reopenCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SiteIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteIssuePhoto" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteIssuePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteIssue_number_key" ON "SiteIssue"("number");

-- CreateIndex
CREATE INDEX "SiteIssue_siteId_status_idx" ON "SiteIssue"("siteId", "status");

-- CreateIndex
CREATE INDEX "SiteIssue_status_reportedAt_idx" ON "SiteIssue"("status", "reportedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteIssuePhoto_storageKey_key" ON "SiteIssuePhoto"("storageKey");

-- CreateIndex
CREATE INDEX "SiteIssuePhoto_issueId_idx" ON "SiteIssuePhoto"("issueId");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_siteIssueId_fkey" FOREIGN KEY ("siteIssueId") REFERENCES "SiteIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssue" ADD CONSTRAINT "SiteIssue_reportedByPersonId_fkey" FOREIGN KEY ("reportedByPersonId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteIssuePhoto" ADD CONSTRAINT "SiteIssuePhoto_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "SiteIssue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- §28. Site issues (26 September 2026): found by an officer, approved by
-- Control before a client sees them, confirmed fixed by an officer on site.
-- ---------------------------------------------------------------------------

-- 28a. Kept from the client only with a reason; shown to the client only in words Control approved.
ALTER TABLE "SiteIssue"
  ADD CONSTRAINT site_issue_kept_internal_has_reason
  CHECK (status::text <> 'kept_internal' OR ("internalReason" IS NOT NULL AND "reviewedAt" IS NOT NULL));
ALTER TABLE "SiteIssue"
  ADD CONSTRAINT site_issue_shared_was_approved
  CHECK (status::text NOT IN ('open', 'client_fixed', 'resolved') OR ("clientText" IS NOT NULL AND length(btrim("clientText")) > 0 AND "reviewedAt" IS NOT NULL AND "reviewedById" IS NOT NULL));

-- 28b. "Fixed" says when the client said so; resolved means an officer checked it.
ALTER TABLE "SiteIssue"
  ADD CONSTRAINT site_issue_client_fixed_dated
  CHECK (status::text <> 'client_fixed' OR "clientFixedAt" IS NOT NULL);
ALTER TABLE "SiteIssue"
  ADD CONSTRAINT site_issue_resolved_checked
  CHECK (status::text <> 'resolved' OR ("resolvedAt" IS NOT NULL AND "checkedAt" IS NOT NULL));
ALTER TABLE "SiteIssue"
  ADD CONSTRAINT site_issue_described
  CHECK (length(btrim("description")) >= 3);

-- 28c. A photo is kept as taken: only whether the client sees it may change, and it is never deleted.
CREATE OR REPLACE FUNCTION site_issue_photo_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'site_issue_photo_immutable: a site issue photo is never deleted';
  END IF;
  IF NEW."issueId" IS DISTINCT FROM OLD."issueId" OR NEW."storageKey" IS DISTINCT FROM OLD."storageKey" OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW."mimeType" IS DISTINCT FROM OLD."mimeType" OR NEW."sizeBytes" IS DISTINCT FROM OLD."sizeBytes" THEN
    RAISE EXCEPTION 'site_issue_photo_immutable: a site issue photo is kept as taken';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER site_issue_photo_immutable
  BEFORE UPDATE OR DELETE ON "SiteIssuePhoto"
  FOR EACH ROW EXECUTE FUNCTION site_issue_photo_immutable();

-- 28d. A work item still has exactly one subject — now including a site issue.
ALTER TABLE "WorkItem" DROP CONSTRAINT work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId",
    "coverNeedId", "openShiftId", "incidentId", "hubTaskId", "siteIssueId"
  ) = 1);
