-- The Control Room, live (Control, 25 September 2026): clients, sites and posts
-- entered in the portal; alerts pushed to phones and desks; selfie proof on
-- book-ons and check calls; officers offering for open shifts and saying when
-- they are free; sites an officer is kept off; and tasks that can be taken.

-- CreateEnum
CREATE TYPE "VolunteerState" AS ENUM ('waiting', 'accepted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "AvailabilityKind" AS ENUM ('available', 'unavailable');

-- CreateEnum
CREATE TYPE "ProofKind" AS ENUM ('book_on', 'check_call');

-- AlterEnum
ALTER TYPE "AskChannel" ADD VALUE 'portal';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "latitude" DECIMAL(9,6),
ADD COLUMN     "longitude" DECIMAL(9,6),
ADD COLUMN     "radiusMetres" INTEGER NOT NULL DEFAULT 200;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "coverNeedId" TEXT,
ADD COLUMN     "incidentId" TEXT,
ADD COLUMN     "openShiftId" TEXT,
ADD COLUMN     "takenAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "SiteExclusion" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedById" TEXT NOT NULL,
    "liftedAt" TIMESTAMPTZ(3),
    "liftedById" TEXT,
    "liftedReason" TEXT,

    CONSTRAINT "SiteExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOkAt" TIMESTAMPTZ(3),
    "failures" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "workItemId" TEXT,
    "userId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "delivered" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftVolunteer" (
    "id" TEXT NOT NULL,
    "openShiftId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "state" "VolunteerState" NOT NULL DEFAULT 'waiting',
    "decidedAt" TIMESTAMPTZ(3),
    "decidedById" TEXT,
    "decisionNote" TEXT,

    CONSTRAINT "ShiftVolunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "kind" "AvailabilityKind" NOT NULL,
    "note" TEXT,
    "setAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutyProof" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "kind" "ProofKind" NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceAt" TIMESTAMPTZ(3),
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "accuracyMetres" INTEGER,
    "distanceMetres" INTEGER,
    "atSite" BOOLEAN,
    "liveCamera" BOOLEAN NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "bookOnId" TEXT,
    "checkCallId" TEXT,

    CONSTRAINT "DutyProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunningLate" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "RunningLate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteExclusion_personId_idx" ON "SiteExclusion"("personId");

-- CreateIndex
CREATE INDEX "SiteExclusion_siteId_idx" ON "SiteExclusion"("siteId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "AlertDelivery_workItemId_userId_at_idx" ON "AlertDelivery"("workItemId", "userId", "at");

-- CreateIndex
CREATE INDEX "AlertDelivery_userId_at_idx" ON "AlertDelivery"("userId", "at");

-- CreateIndex
CREATE INDEX "ShiftVolunteer_state_at_idx" ON "ShiftVolunteer"("state", "at");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftVolunteer_openShiftId_personId_key" ON "ShiftVolunteer"("openShiftId", "personId");

-- CreateIndex
CREATE INDEX "Availability_date_idx" ON "Availability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_personId_date_key" ON "Availability"("personId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProof_code_key" ON "DutyProof"("code");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProof_bookOnId_key" ON "DutyProof"("bookOnId");

-- CreateIndex
CREATE UNIQUE INDEX "DutyProof_checkCallId_key" ON "DutyProof"("checkCallId");

-- CreateIndex
CREATE INDEX "DutyProof_assignmentId_receivedAt_idx" ON "DutyProof"("assignmentId", "receivedAt");

-- CreateIndex
CREATE INDEX "RunningLate_assignmentId_at_idx" ON "RunningLate"("assignmentId", "at");

-- CreateIndex
CREATE INDEX "Event_assignmentId_at_idx" ON "Event"("assignmentId", "at");

-- CreateIndex
CREATE INDEX "WorkItem_ownerRole_state_idx" ON "WorkItem"("ownerRole", "state");

-- AddForeignKey
ALTER TABLE "SiteExclusion" ADD CONSTRAINT "SiteExclusion_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteExclusion" ADD CONSTRAINT "SiteExclusion_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_coverNeedId_fkey" FOREIGN KEY ("coverNeedId") REFERENCES "CoverNeed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_openShiftId_fkey" FOREIGN KEY ("openShiftId") REFERENCES "OpenShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_workItemId_fkey" FOREIGN KEY ("workItemId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftVolunteer" ADD CONSTRAINT "ShiftVolunteer_openShiftId_fkey" FOREIGN KEY ("openShiftId") REFERENCES "OpenShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftVolunteer" ADD CONSTRAINT "ShiftVolunteer_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProof" ADD CONSTRAINT "DutyProof_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProof" ADD CONSTRAINT "DutyProof_bookOnId_fkey" FOREIGN KEY ("bookOnId") REFERENCES "BookOn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutyProof" ADD CONSTRAINT "DutyProof_checkCallId_fkey" FOREIGN KEY ("checkCallId") REFERENCES "CheckCall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningLate" ADD CONSTRAINT "RunningLate_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 21. The Control Room, live  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------
-- Clients, sites and posts entered in the portal; selfie proof on book-ons
-- and check calls; officers offering for shifts and saying when they are free;
-- sites an officer is kept off; and the work queue gaining the rota's own
-- subjects.

-- 21a. A work item still has exactly one subject — now including the shift
-- that needs cover, the open shift nobody is on, and an incident.
ALTER TABLE "WorkItem" DROP CONSTRAINT work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId",
    "coverNeedId", "openShiftId", "incidentId"
  ) = 1);

-- 21b. Taken means somebody took it.
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_taken_by_someone
  CHECK ("takenAt" IS NULL OR "ownerUserId" IS NOT NULL);

-- 21c. A site's location is a pair, on the planet, with a sensible radius.
ALTER TABLE "Site"
  ADD CONSTRAINT site_location_pair
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));
ALTER TABLE "Site"
  ADD CONSTRAINT site_location_range
  CHECK ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180));
ALTER TABLE "Site"
  ADD CONSTRAINT site_radius_sensible
  CHECK ("radiusMetres" BETWEEN 25 AND 5000);

-- 21d. One standing exclusion per officer per site; lifting says why.
CREATE UNIQUE INDEX site_exclusion_one_standing
  ON "SiteExclusion" ("siteId", "personId") WHERE "liftedAt" IS NULL;
ALTER TABLE "SiteExclusion"
  ADD CONSTRAINT site_exclusion_says_why
  CHECK (length(btrim("reason")) > 0);
ALTER TABLE "SiteExclusion"
  ADD CONSTRAINT site_exclusion_lift_says_why
  CHECK ("liftedAt" IS NULL OR ("liftedById" IS NOT NULL AND length(btrim(coalesce("liftedReason", ''))) > 0));

-- 21e. A volunteer is waiting until somebody decides — or they withdraw.
ALTER TABLE "ShiftVolunteer"
  ADD CONSTRAINT shift_volunteer_decided
  CHECK (("state" = 'waiting') = ("decidedAt" IS NULL));

-- 21f. A selfie proves one thing: a book-on or one check call, of its kind.
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_one_subject
  CHECK (num_nonnulls("bookOnId", "checkCallId") = 1);
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_kind_matches
  CHECK (("kind" = 'book_on') = ("bookOnId" IS NOT NULL));
ALTER TABLE "DutyProof"
  ADD CONSTRAINT duty_proof_location_pair
  CHECK (("latitude" IS NULL) = ("longitude" IS NULL));

-- 21g. Evidence is not edited. A proof is written once; nothing updates it.
CREATE OR REPLACE FUNCTION refuse_duty_proof_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'A duty proof is evidence and is never changed once written'
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER duty_proof_immutable
  BEFORE UPDATE ON "DutyProof"
  FOR EACH ROW EXECUTE FUNCTION refuse_duty_proof_update();

-- 21h. Running late is by minutes, and not by a day.
ALTER TABLE "RunningLate"
  ADD CONSTRAINT running_late_sensible
  CHECK ("minutes" BETWEEN 1 AND 240);

-- Control's number, which officers ring from their portal. A drama-reserved
-- number until the real one is set.
INSERT INTO "Setting" ("key", "value", "valueType", "label", "usedBy", "updatedAt")
VALUES ('control.phone', '01632 960000', 'text', 'Control Room phone number, shown to officers', 'officer portal', now())
ON CONFLICT ("key") DO NOTHING;
