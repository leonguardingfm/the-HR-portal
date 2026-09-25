-- CreateEnum
CREATE TYPE "HubSource" AS ENUM ('outlook', 'manual', 'phone', 'whatsapp', 'other');

-- CreateEnum
CREATE TYPE "HubCategory" AS ENUM ('compliance', 'complaint', 'lateness', 'job_renewal', 'cover_request', 'shift_cancellation', 'incident', 'client_request', 'officer_query', 'hr_matter', 'rtw_sia_expiry', 'invoice_accounts', 'other');

-- CreateEnum
CREATE TYPE "HubPriority" AS ENUM ('critical', 'very_high', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "HubStatus" AS ENUM ('unassigned', 'accepted', 'in_progress', 'awaiting_information', 'awaiting_client', 'awaiting_officer', 'escalated', 'completed', 'unsuccessful', 'cancelled');

-- CreateEnum
CREATE TYPE "HubOutcome" AS ENUM ('successful', 'unsuccessful', 'cancelled_by_client', 'cancelled_by_leon', 'dropped_by_leon', 'dropped_by_client', 'no_action_required', 'duplicate_or_mistake');

-- CreateEnum
CREATE TYPE "MailboxMode" AS ENUM ('test', 'shadow', 'live');

-- CreateEnum
CREATE TYPE "HubOwnershipKind" AS ENUM ('accept', 'reassign', 'handover');

-- CreateEnum
CREATE TYPE "HubNoteKind" AS ENUM ('note', 'action', 'response', 'follow_up');

-- CreateEnum
CREATE TYPE "HubSlaClock" AS ENUM ('accept', 'action', 'update');

-- CreateEnum
CREATE TYPE "HubSlaKind" AS ENUM ('warning', 'breach', 'escalation');

-- CreateEnum
CREATE TYPE "HubNoticeLevel" AS ENUM ('info', 'warning', 'critical');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'shift_supervisor';

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hubTaskId" TEXT;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "hubTaskId" TEXT;

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "mode" "MailboxMode" NOT NULL DEFAULT 'test',
    "officeHoursOnly" BOOLEAN NOT NULL DEFAULT false,
    "readAttachments" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastSyncError" TEXT,
    "lastErrorAt" TIMESTAMPTZ(3),
    "syncState" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "graphMessageId" TEXT,
    "internetMessageId" TEXT,
    "conversationId" TEXT,
    "webLink" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "fromName" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "ccAddresses" TEXT[],
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAttachment" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT,
    "sha256" TEXT,

    CONSTRAINT "EmailAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubTask" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "source" "HubSource" NOT NULL,
    "mailboxId" TEXT,
    "conversationId" TEXT,
    "department" "Department" NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "requiredAction" TEXT,
    "senderName" TEXT,
    "senderAddress" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "category" "HubCategory" NOT NULL,
    "categoryNote" TEXT,
    "priority" "HubPriority" NOT NULL,
    "aiCategory" "HubCategory",
    "aiPriority" "HubPriority",
    "aiConfidence" DOUBLE PRECISION,
    "aiReasons" TEXT,
    "aiModel" TEXT,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" TEXT,
    "clientId" TEXT,
    "siteId" TEXT,
    "personId" TEXT,
    "suggestedOwnerId" TEXT,
    "status" "HubStatus" NOT NULL DEFAULT 'unassigned',
    "ownerUserId" TEXT,
    "acceptedAt" TIMESTAMPTZ(3),
    "firstActionAt" TIMESTAMPTZ(3),
    "firstResponseAt" TIMESTAMPTZ(3),
    "lastUpdateAt" TIMESTAMPTZ(3),
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMPTZ(3),
    "ackDueAt" TIMESTAMPTZ(3) NOT NULL,
    "actionDueAt" TIMESTAMPTZ(3) NOT NULL,
    "updateDueAt" TIMESTAMPTZ(3),
    "waitingReason" TEXT,
    "waitingFor" TEXT,
    "followUpAt" TIMESTAMPTZ(3),
    "followUpEvidence" TEXT,
    "escalatedAt" TIMESTAMPTZ(3),
    "escalationNote" TEXT,
    "handoverNeededAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "completedById" TEXT,
    "outcome" "HubOutcome",
    "outcomeReason" TEXT,
    "correctiveAction" TEXT,
    "withinSla" BOOLEAN,
    "breaches" INTEGER NOT NULL DEFAULT 0,
    "managementAlertedAt" TIMESTAMPTZ(3),
    "relatedTaskId" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HubTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubOwnership" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "HubOwnershipKind" NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubChange" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "reason" TEXT,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNote" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "HubNoteKind" NOT NULL,
    "text" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacesId" TEXT,

    CONSTRAINT "HubNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubFile" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "noteId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "removedById" TEXT,
    "removedReason" TEXT,

    CONSTRAINT "HubFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubSlaEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "clock" "HubSlaClock" NOT NULL,
    "kind" "HubSlaKind" NOT NULL,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ownerUserId" TEXT,

    CONSTRAINT "HubSlaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubNotice" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "taskId" TEXT,
    "level" "HubNoticeLevel" NOT NULL,
    "text" TEXT NOT NULL,
    "toUserId" TEXT,
    "toRole" "Role",
    "department" "Department",
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubNotice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_address_key" ON "Mailbox"("address");

-- CreateIndex
CREATE INDEX "InboundEmail_internetMessageId_idx" ON "InboundEmail"("internetMessageId");

-- CreateIndex
CREATE INDEX "InboundEmail_conversationId_idx" ON "InboundEmail"("conversationId");

-- CreateIndex
CREATE INDEX "InboundEmail_taskId_receivedAt_idx" ON "InboundEmail"("taskId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_mailboxId_graphMessageId_key" ON "InboundEmail"("mailboxId", "graphMessageId");

-- CreateIndex
CREATE INDEX "EmailAttachment_emailId_idx" ON "EmailAttachment"("emailId");

-- CreateIndex
CREATE UNIQUE INDEX "HubTask_number_key" ON "HubTask"("number");

-- CreateIndex
CREATE INDEX "HubTask_status_department_idx" ON "HubTask"("status", "department");

-- CreateIndex
CREATE INDEX "HubTask_ownerUserId_status_idx" ON "HubTask"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "HubTask_conversationId_idx" ON "HubTask"("conversationId");

-- CreateIndex
CREATE INDEX "HubTask_receivedAt_idx" ON "HubTask"("receivedAt");

-- CreateIndex
CREATE INDEX "HubOwnership_taskId_at_idx" ON "HubOwnership"("taskId", "at");

-- CreateIndex
CREATE INDEX "HubOwnership_toUserId_at_idx" ON "HubOwnership"("toUserId", "at");

-- CreateIndex
CREATE INDEX "HubChange_taskId_at_idx" ON "HubChange"("taskId", "at");

-- CreateIndex
CREATE INDEX "HubChange_field_at_idx" ON "HubChange"("field", "at");

-- CreateIndex
CREATE UNIQUE INDEX "HubNote_replacesId_key" ON "HubNote"("replacesId");

-- CreateIndex
CREATE INDEX "HubNote_taskId_at_idx" ON "HubNote"("taskId", "at");

-- CreateIndex
CREATE INDEX "HubFile_taskId_idx" ON "HubFile"("taskId");

-- CreateIndex
CREATE INDEX "HubSlaEvent_at_idx" ON "HubSlaEvent"("at");

-- CreateIndex
CREATE INDEX "HubSlaEvent_ownerUserId_at_idx" ON "HubSlaEvent"("ownerUserId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "HubSlaEvent_taskId_clock_kind_dueAt_key" ON "HubSlaEvent"("taskId", "clock", "kind", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubNotice_seq_key" ON "HubNotice"("seq");

-- CreateIndex
CREATE INDEX "HubNotice_at_idx" ON "HubNotice"("at");

-- CreateIndex
CREATE INDEX "Event_hubTaskId_at_idx" ON "Event"("hubTaskId", "at");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_hubTaskId_fkey" FOREIGN KEY ("hubTaskId") REFERENCES "HubTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAttachment" ADD CONSTRAINT "EmailAttachment_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "InboundEmail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubTask" ADD CONSTRAINT "HubTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubOwnership" ADD CONSTRAINT "HubOwnership_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubChange" ADD CONSTRAINT "HubChange_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNote" ADD CONSTRAINT "HubNote_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNote" ADD CONSTRAINT "HubNote_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "HubNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubFile" ADD CONSTRAINT "HubFile_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubFile" ADD CONSTRAINT "HubFile_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "HubNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubSlaEvent" ADD CONSTRAINT "HubSlaEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubNotice" ADD CONSTRAINT "HubNotice_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "HubTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 24. The Performance hub  [Control, 25 September 2026]
-- ---------------------------------------------------------------------------

-- 24a. A work item still has exactly one subject — now including a hub task.
ALTER TABLE "WorkItem" DROP CONSTRAINT work_item_one_subject;
ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId", "adminItemId",
    "coverNeedId", "openShiftId", "incidentId", "hubTaskId"
  ) = 1);

-- 24b. One owner, clearly: unassigned has none, work in hand has one, and an
-- owner was accepted at a known time.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_unassigned_has_no_owner
  CHECK ("status" <> 'unassigned' OR "ownerUserId" IS NULL);
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_in_hand_has_owner
  CHECK ("status" NOT IN ('accepted', 'in_progress', 'awaiting_information', 'awaiting_client', 'awaiting_officer', 'escalated') OR "ownerUserId" IS NOT NULL);
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_owner_accepted_when
  CHECK ("ownerUserId" IS NULL OR "acceptedAt" IS NOT NULL);

-- 24c. Waiting says why, on whom, when it is followed up, and what was done last.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_waiting_whole
  CHECK ("status" NOT IN ('awaiting_information', 'awaiting_client', 'awaiting_officer') OR (
    length(btrim(coalesce("waitingReason", ''))) > 0
    AND length(btrim(coalesce("waitingFor", ''))) > 0
    AND "followUpAt" IS NOT NULL
    AND length(btrim(coalesce("followUpEvidence", ''))) > 0));

-- 24d. Escalated says why.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_escalated_says_why
  CHECK ("status" <> 'escalated' OR length(btrim(coalesce("escalationNote", ''))) > 0);

-- 24e. Closed exactly when there is an outcome and a time.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_closed_whole
  CHECK (("status" IN ('completed', 'unsuccessful', 'cancelled')) = ("outcome" IS NOT NULL AND "completedAt" IS NOT NULL));

-- 24f. An unsuccessful, cancelled or dropped outcome — or one that went over
-- its time — says why and what is being done about it.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_bad_outcome_explained
  CHECK (
    "outcome" IS NULL
    OR ("outcome" NOT IN ('unsuccessful', 'cancelled_by_client', 'cancelled_by_leon', 'dropped_by_leon', 'dropped_by_client') AND "breaches" = 0)
    OR (length(btrim(coalesce("outcomeReason", ''))) > 0 AND length(btrim(coalesce("correctiveAction", ''))) > 0));

-- 24g. "Other" says what it is.
ALTER TABLE "HubTask"
  ADD CONSTRAINT hub_task_other_says_what
  CHECK ("category" <> 'other' OR length(btrim(coalesce("categoryNote", ''))) > 0);

-- 24h. A priority change says why; a reassignment or handover says why.
ALTER TABLE "HubChange"
  ADD CONSTRAINT hub_change_priority_says_why
  CHECK ("field" <> 'priority' OR length(btrim(coalesce("reason", ''))) > 0);
ALTER TABLE "HubOwnership"
  ADD CONSTRAINT hub_ownership_move_says_why
  CHECK ("kind" = 'accept' OR length(btrim(coalesce("reason", ''))) > 0);
ALTER TABLE "HubNote"
  ADD CONSTRAINT hub_note_says_something
  CHECK (length(btrim("text")) > 0);

-- 24i. The original email, the ownership history, the corrections and the SLA
-- record are written once and never changed.
CREATE OR REPLACE FUNCTION reject_hub_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'The % record is kept as written: it cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inbound_email_immutable BEFORE UPDATE OR DELETE ON "InboundEmail"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_ownership_immutable BEFORE UPDATE OR DELETE ON "HubOwnership"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_change_immutable BEFORE UPDATE OR DELETE ON "HubChange"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_sla_event_immutable BEFORE UPDATE OR DELETE ON "HubSlaEvent"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();
CREATE TRIGGER hub_note_immutable BEFORE UPDATE OR DELETE ON "HubNote"
  FOR EACH ROW EXECUTE FUNCTION reject_hub_record_mutation();

-- 24j. A removed file says who removed it and why.
ALTER TABLE "HubFile"
  ADD CONSTRAINT hub_file_removal_whole
  CHECK ("removedAt" IS NULL OR ("removedById" IS NOT NULL AND length(btrim(coalesce("removedReason", ''))) > 0));

-- 24k. A notice goes to somebody.
ALTER TABLE "HubNotice"
  ADD CONSTRAINT hub_notice_has_audience
  CHECK (num_nonnulls("toUserId", "toRole", "department") >= 1);
