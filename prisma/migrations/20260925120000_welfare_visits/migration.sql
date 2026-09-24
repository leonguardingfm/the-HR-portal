-- Step 3 of the escalation ladder (Control, 25 September 2026): a supervisor
-- or the Operations Manager goes to site; if they are not marked arrived within
-- two minutes of the time given, Control and the Operations Manager are alarmed;
-- what they found is recorded, with the police when an incident needs them.

-- CreateEnum
CREATE TYPE "WelfareAttendee" AS ENUM ('supervisor', 'operations_manager');

-- CreateEnum
CREATE TYPE "WelfareOutcome" AS ENUM ('safe_and_well', 'unwell_ambulance', 'post_abandoned', 'not_found_police', 'stood_down');

-- CreateTable
CREATE TABLE "WelfareVisit" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedById" TEXT NOT NULL,
    "attendeeKind" "WelfareAttendee" NOT NULL,
    "attendeeName" TEXT NOT NULL,
    "attendeePhone" TEXT,
    "attendeeUserId" TEXT,
    "expectedBy" TIMESTAMPTZ(3) NOT NULL,
    "arrivedAt" TIMESTAMPTZ(3),
    "arrivedRecordedById" TEXT,
    "outcome" "WelfareOutcome",
    "outcomeNote" TEXT,
    "policeCalled" BOOLEAN NOT NULL DEFAULT false,
    "policeReference" TEXT,
    "clientToldAt" TIMESTAMPTZ(3),
    "clientContact" TEXT,
    "closedAt" TIMESTAMPTZ(3),
    "closedById" TEXT,
    "incidentId" TEXT,

    CONSTRAINT "WelfareVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WelfareVisit_incidentId_key" ON "WelfareVisit"("incidentId");

-- CreateIndex
CREATE INDEX "WelfareVisit_assignmentId_idx" ON "WelfareVisit"("assignmentId");

-- CreateIndex
CREATE INDEX "WelfareVisit_closedAt_idx" ON "WelfareVisit"("closedAt");

-- AddForeignKey
ALTER TABLE "WelfareVisit" ADD CONSTRAINT "WelfareVisit_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WelfareVisit" ADD CONSTRAINT "WelfareVisit_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 22. The welfare visit — step 3 of the escalation ladder  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------
-- A supervisor or the Operations Manager goes to site; what they found is
-- recorded, and that record is the end of the duty of care on a missed call.

-- 22a. One visit under way per shift at a time.
CREATE UNIQUE INDEX welfare_visit_one_open
  ON "WelfareVisit" ("assignmentId") WHERE "closedAt" IS NULL;

-- 22b. Somebody named is sent, and is expected after they were sent.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_names_who
  CHECK (length(btrim("attendeeName")) > 0);
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_expected_after_sent
  CHECK ("expectedBy" > "dispatchedAt");
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_arrives_after_sent
  CHECK ("arrivedAt" IS NULL OR "arrivedAt" >= "dispatchedAt");

-- 22c. Closed exactly when there is an outcome, and the outcome says what was found.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_closed_with_outcome
  CHECK (("closedAt" IS NULL) = ("outcome" IS NULL));
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_outcome_says_what
  CHECK ("outcome" IS NULL OR length(btrim(coalesce("outcomeNote", ''))) > 0);

-- 22d. What was found needs somebody there to find it — unless the officer
-- got in touch first and the visit was stood down.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_found_on_arrival
  CHECK ("outcome" IS NULL OR "outcome" = 'stood_down' OR "arrivedAt" IS NOT NULL);

-- 22e. Not found means the police were told.
ALTER TABLE "WelfareVisit"
  ADD CONSTRAINT welfare_visit_not_found_police
  CHECK ("outcome" IS DISTINCT FROM 'not_found_police' OR "policeCalled");
