-- CreateEnum
CREATE TYPE "OffReason" AS ENUM ('sick', 'withdrew', 'no_show', 'other');

-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "weeklyHours" INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE "ShiftAsk" ADD COLUMN     "coverNeedId" TEXT;

-- CreateTable
CREATE TABLE "CoverNeed" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" "OffReason" NOT NULL,
    "note" TEXT,
    "fromAssignmentId" TEXT NOT NULL,
    "raisedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raisedById" TEXT NOT NULL,
    "coverAssignmentId" TEXT,
    "coveredAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closedReason" TEXT,
    "closedById" TEXT,

    CONSTRAINT "CoverNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoverNeed_fromAssignmentId_key" ON "CoverNeed"("fromAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverNeed_coverAssignmentId_key" ON "CoverNeed"("coverAssignmentId");

-- CreateIndex
CREATE INDEX "CoverNeed_startsAt_idx" ON "CoverNeed"("startsAt");

-- AddForeignKey
ALTER TABLE "ShiftAsk" ADD CONSTRAINT "ShiftAsk_coverNeedId_fkey" FOREIGN KEY ("coverNeedId") REFERENCES "CoverNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverNeed" ADD CONSTRAINT "CoverNeed_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverNeed" ADD CONSTRAINT "CoverNeed_fromAssignmentId_fkey" FOREIGN KEY ("fromAssignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverNeed" ADD CONSTRAINT "CoverNeed_coverAssignmentId_fkey" FOREIGN KEY ("coverAssignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


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
