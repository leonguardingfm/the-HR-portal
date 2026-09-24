-- CreateTable
CREATE TABLE "OpenShift" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "assignmentId" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledReason" TEXT,

    CONSTRAINT "OpenShift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenShift_assignmentId_key" ON "OpenShift"("assignmentId");

-- CreateIndex
CREATE INDEX "OpenShift_postId_startsAt_idx" ON "OpenShift"("postId", "startsAt");

-- CreateIndex
CREATE INDEX "OpenShift_startsAt_idx" ON "OpenShift"("startsAt");

-- AddForeignKey
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenShift" ADD CONSTRAINT "OpenShift_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


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
