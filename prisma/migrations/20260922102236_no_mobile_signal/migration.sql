-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "mobileSignal" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "NoSignalHandover" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMPTZ(3),
    "notifiedByUserId" TEXT,
    "notifiedContact" TEXT,
    "lossReportedAt" TIMESTAMPTZ(3),
    "lossReportedBy" TEXT,
    "lossDetail" TEXT,

    CONSTRAINT "NoSignalHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoSignalHandover_assignmentId_key" ON "NoSignalHandover"("assignmentId");

-- CreateIndex
CREATE INDEX "NoSignalHandover_lossReportedAt_idx" ON "NoSignalHandover"("lossReportedAt");

-- AddForeignKey
ALTER TABLE "NoSignalHandover" ADD CONSTRAINT "NoSignalHandover_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Constraints from prisma/constraints.sql that Prisma cannot express.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 12. The no-signal handover
-- ---------------------------------------------------------------------------
-- A transfer of responsibility, so it is recorded whole or not at all.

-- 12a. Telling the client is recorded with who was told and when, together.
-- "Notified" with no name is not evidence that anybody was notified.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_notification_whole
  CHECK (num_nonnulls("notifiedAt", "notifiedContact") <> 1);

-- 12b. Same for the client coming back to say they cannot reach the officer.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_loss_report_whole
  CHECK (num_nonnulls("lossReportedAt", "lossReportedBy") <> 1);

-- 12c. The client cannot report losing contact before they were given it.
-- Out of order here means somebody back-filled a record, which is exactly the
-- thing a duty-of-care trail has to be able to rule out.
ALTER TABLE "NoSignalHandover"
  ADD CONSTRAINT no_signal_loss_after_handover
  CHECK (
    "lossReportedAt" IS NULL
    OR ("notifiedAt" IS NOT NULL AND "lossReportedAt" >= "notifiedAt")
  );

-- 12d. A handover only exists for a post with no signal.
--
-- Needs Post via Assignment, so it is a trigger. Without it the record could
-- be created against a post that has a signal, and the board would then stop
-- expecting check calls on a post where the officer can perfectly well make
-- them — which is the failure this whole mechanism exists to avoid, inverted.
CREATE OR REPLACE FUNCTION enforce_no_signal_post()
RETURNS TRIGGER AS $$
DECLARE
  has_signal BOOLEAN;
BEGIN
  SELECT p."mobileSignal" INTO has_signal
    FROM "Assignment" a
    JOIN "Post" p ON p.id = a."postId"
    WHERE a.id = NEW."assignmentId";

  IF has_signal IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION
      'A no-signal handover only applies to a post recorded as having no mobile signal';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_signal_handover_post
  BEFORE INSERT ON "NoSignalHandover"
  FOR EACH ROW EXECUTE FUNCTION enforce_no_signal_post();
