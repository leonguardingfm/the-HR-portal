-- CreateEnum
CREATE TYPE "ChaseUpOutcome" AS ENUM ('confirmed', 'no_answer', 'cannot_attend');

-- CreateTable
CREATE TABLE "ChaseUp" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "channel" "AskChannel",
    "outcome" "ChaseUpOutcome" NOT NULL,
    "note" TEXT,

    CONSTRAINT "ChaseUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChaseUp_assignmentId_at_idx" ON "ChaseUp"("assignmentId", "at");

-- AddForeignKey
ALTER TABLE "ChaseUp" ADD CONSTRAINT "ChaseUp_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 20. Chase-ups  [Control, 24 September 2026]
-- ---------------------------------------------------------------------------
-- A chase-up is about a shift somebody is on, and says what happened.

-- 20a. "No answer" and "cannot attend" say how they were tried; a
-- confirmation may come in on the officer's own channel.
ALTER TABLE "ChaseUp"
  ADD CONSTRAINT chase_up_how_tried
  CHECK (outcome = 'confirmed' OR channel IS NOT NULL);

-- 20b. Cannot attend says why — it takes the officer off the shift.
ALTER TABLE "ChaseUp"
  ADD CONSTRAINT chase_up_cannot_attend_says_why
  CHECK (outcome <> 'cannot_attend' OR length(btrim(coalesce(note, ''))) > 0);
