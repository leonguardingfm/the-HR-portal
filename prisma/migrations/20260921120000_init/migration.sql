-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PersonLifecycle" AS ENUM ('enquiry', 'applicant', 'candidate', 'conditional_officer', 'confirmed_officer', 'leaver', 'rehire_candidate');

-- CreateEnum
CREATE TYPE "IdentityKeyKind" AS ENUM ('name_and_dob', 'national_insurance', 'sia_licence', 'phone', 'email');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('control', 'operations_manager', 'recruitment', 'recruitment_manager', 'vetting_admin', 'vetting_controller', 'top_management', 'auditor');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('control', 'recruitment', 'vetting', 'compliance', 'operations', 'quality', 'account_management', 'administration');

-- CreateEnum
CREATE TYPE "EmploymentState" AS ENUM ('conditional', 'confirmed', 'suspended', 'ended');

-- CreateEnum
CREATE TYPE "LicenceKind" AS ENUM ('sia_door_supervisor', 'sia_security_guarding', 'sia_cctv', 'sia_close_protection', 'other');

-- CreateEnum
CREATE TYPE "DocumentVerification" AS ENUM ('not_supplied', 'supplied', 'rejected', 'verified', 'expired');

-- CreateEnum
CREATE TYPE "FieldKind" AS ENUM ('text', 'number', 'boolean', 'choice', 'score', 'date', 'signature', 'photo', 'document');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('none', 'daily', 'weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "WorkItemState" AS ENUM ('open', 'blocked', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "ReminderState" AS ENUM ('pending', 'sent', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('received', 'pool_check', 'covered_internally', 'released_to_sourcing', 'allocated', 'filled', 'cancelled');

-- CreateEnum
CREATE TYPE "RecruitmentStage" AS ENUM ('sourcing', 'shortlisted', 'invited', 'application_received', 'application_complete', 'first_interview', 'second_interview', 'additional_interview', 'conditional_offer', 'welcome_pack', 'signed_docs_complete', 'onboarding_complete', 'deployed', 'confirmed_employment', 'withdrawn');

-- CreateEnum
CREATE TYPE "CandidateSource" AS ENUM ('previous_enquiry', 'existing_indeed', 'new_indeed_ad', 'referral');

-- CreateEnum
CREATE TYPE "InterviewStage" AS ENUM ('first', 'second', 'additional');

-- CreateEnum
CREATE TYPE "InterviewOutcome" AS ENUM ('progress', 'hold', 'reject');

-- CreateEnum
CREATE TYPE "VettingStatus" AS ENUM ('not_started', 'consent_captured', 'information_complete', 'preliminary_checks_complete', 'limited_screening_complete', 'controller_review_1', 'full_screening_in_progress', 'full_screening_complete', 'controller_review_2', 'risk_acceptance_required', 'statutory_declaration_required', 'adverse_finding', 'time_expired', 'withdrawn', 'complete');

-- CreateEnum
CREATE TYPE "CheckGroup" AS ENUM ('consent', 'preliminary', 'history', 'criminality', 'legal', 'signoff', 'exception');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('not_started', 'requested', 'chased', 'received', 'verified', 'not_applicable', 'failed');

-- CreateEnum
CREATE TYPE "DecisionKind" AS ENUM ('risk_acceptance', 'extension', 'statutory_declaration', 'adverse_finding', 'representation', 'final_signoff');

-- CreateEnum
CREATE TYPE "AssignmentState" AS ENUM ('draft', 'published', 'amended', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('app', 'phone', 'site_phone', 'sms', 'qr', 'supervisor');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('log_only', 'notable', 'serious');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "lifecycle" "PersonLifecycle" NOT NULL DEFAULT 'enquiry',
    "fullName" TEXT NOT NULL,
    "previousName" TEXT,
    "dateOfBirth" DATE NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationalInsurance" TEXT,
    "nextOfKinName" TEXT,
    "nextOfKinPhone" TEXT,
    "payrollRef" TEXT,
    "firstContactAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonIdentityKey" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "IdentityKeyKind" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "PersonIdentityKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "ssoSubject" TEXT,
    "displayName" TEXT NOT NULL,
    "ownScreeningComplete" BOOLEAN NOT NULL DEFAULT false,
    "confidentialityAgreementOnFile" BOOLEAN NOT NULL DEFAULT false,
    "trainingReviewedAt" TIMESTAMPTZ(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,
    "grantBasis" TEXT,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeRole" "Role" NOT NULL,
    "signedInAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedOutAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "screeningPeriodYears" INTEGER NOT NULL DEFAULT 5,
    "requiresAdditionalInterview" BOOLEAN NOT NULL DEFAULT false,
    "regulatedActivity" BOOLEAN NOT NULL DEFAULT false,
    "contractStart" DATE,
    "contractEnd" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "clientRef" TEXT,
    "checkCallInstruction" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" TEXT,
    "requiresSiaLicence" BOOLEAN NOT NULL DEFAULT true,
    "screeningPeriodYears" INTEGER NOT NULL DEFAULT 5,
    "checkCallsRequired" BOOLEAN NOT NULL DEFAULT true,
    "loneWorking" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteReference" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "employmentId" TEXT NOT NULL,
    "prn" TEXT NOT NULL,

    CONSTRAINT "SiteReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "state" "EmploymentState" NOT NULL DEFAULT 'conditional',
    "pin" TEXT NOT NULL,
    "controlTeam" TEXT,
    "startedAt" DATE NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "leaverReason" TEXT,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Licence" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "kind" "LicenceKind" NOT NULL,
    "number" TEXT NOT NULL,
    "nameOnBadge" TEXT NOT NULL,
    "expiresAt" DATE NOT NULL,
    "lastVerifiedAt" TIMESTAMPTZ(3),
    "registerStatus" TEXT,

    CONSTRAINT "Licence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "expires" BOOLEAN NOT NULL DEFAULT false,
    "copyRetained" BOOLEAN NOT NULL DEFAULT true,
    "retentionNote" TEXT,
    "clause" TEXT,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRecord" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "personId" TEXT,
    "siteId" TEXT,
    "screeningFileId" TEXT,
    "verification" "DocumentVerification" NOT NULL DEFAULT 'not_supplied',
    "storageKey" TEXT,
    "rejectionReason" TEXT,
    "suppliedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "expiresAt" DATE,
    "disposedAt" TIMESTAMPTZ(3),

    CONSTRAINT "DocumentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "purpose" TEXT,
    "department" "Department" NOT NULL,
    "filledBy" TEXT NOT NULL,
    "trigger" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FormDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormField" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "FieldKind" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "feedsKpi" TEXT,
    "choices" TEXT[],

    CONSTRAINT "FormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormResponse" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "definitionVersion" INTEGER NOT NULL,
    "personId" TEXT,
    "assignmentId" TEXT,
    "siteId" TEXT,
    "clientId" TEXT,
    "submittedById" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "FormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(12,2),
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMPTZ(3),
    "documentId" TEXT,

    CONSTRAINT "FormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItemDefinition" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'none',
    "slaDays" INTEGER NOT NULL DEFAULT 3,
    "ownerRole" "Role" NOT NULL,
    "escalatesTo" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkItemDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT,
    "title" TEXT NOT NULL,
    "state" "WorkItemState" NOT NULL DEFAULT 'open',
    "personId" TEXT,
    "screeningFileId" TEXT,
    "requirementId" TEXT,
    "assignmentId" TEXT,
    "documentId" TEXT,
    "formResponseId" TEXT,
    "ownerUserId" TEXT,
    "ownerRole" "Role",
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "slaDays" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMPTZ(3),
    "blockedReason" TEXT,
    "escalatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "offsets" INTEGER[],
    "channel" TEXT NOT NULL DEFAULT 'email',
    "escalatesTo" "Role",
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "state" "ReminderState" NOT NULL DEFAULT 'pending',
    "personId" TEXT,
    "documentId" TEXT,
    "workItemId" TEXT,
    "screeningFileId" TEXT,
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelledReason" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorRole" "Role",
    "actorSystem" TEXT,
    "department" "Department" NOT NULL,
    "personId" TEXT,
    "assignmentId" TEXT,
    "screeningFileId" TEXT,
    "requirementId" TEXT,
    "documentId" TEXT,
    "siteId" TEXT,
    "detail" TEXT,
    "payload" JSONB,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "controlTeam" TEXT,
    "post" TEXT NOT NULL,
    "headcountRequired" INTEGER NOT NULL DEFAULT 1,
    "shiftPattern" TEXT,
    "startDate" DATE NOT NULL,
    "status" "RequirementStatus" NOT NULL DEFAULT 'received',
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedToSourcingAt" TIMESTAMPTZ(3),
    "ownerUserId" TEXT,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidacy" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "requirementId" TEXT,
    "stage" "RecruitmentStage" NOT NULL DEFAULT 'sourcing',
    "stageSince" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CandidateSource",
    "ownerUserId" TEXT,
    "withdrawnReason" TEXT,

    CONSTRAINT "Candidacy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "candidacyId" TEXT NOT NULL,
    "stage" "InterviewStage" NOT NULL,
    "interviewerUserId" TEXT,
    "heldAt" TIMESTAMPTZ(3) NOT NULL,
    "outcome" "InterviewOutcome" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningFile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "screeningPeriodYears" INTEGER NOT NULL DEFAULT 5,
    "status" "VettingStatus" NOT NULL DEFAULT 'not_started',
    "conditionalEmploymentStart" DATE,
    "extensionWeeks" INTEGER NOT NULL DEFAULT 0,
    "extensionApprovedById" TEXT,
    "extensionApprovedAt" TIMESTAMPTZ(3),
    "administratorUserId" TEXT,
    "controllerUserId" TEXT,
    "controllerReview1At" TIMESTAMPTZ(3),
    "controllerReview2At" TIMESTAMPTZ(3),
    "unverifiedDays" INTEGER NOT NULL DEFAULT 0,
    "gapsOver31Days" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "retainUntil" DATE,
    "disposedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ScreeningFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningCheck" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "group" "CheckGroup" NOT NULL,
    "label" TEXT NOT NULL,
    "clause" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL DEFAULT 'not_started',
    "ownerUserId" TEXT,
    "requestCode" TEXT,
    "firstRequestSentAt" TIMESTAMPTZ(3),
    "secondRequestSentAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "coversFrom" DATE,
    "coversTo" DATE,
    "notes" TEXT,

    CONSTRAINT "ScreeningCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningDecision" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" "DecisionKind" NOT NULL,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rationale" TEXT NOT NULL,
    "amountGbp" DECIMAL(12,2),

    CONSTRAINT "ScreeningDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "state" "AssignmentState" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMPTZ(3),
    "publishedById" TEXT,
    "publishCheckNote" TEXT,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentAmendment" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "change" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "previousPersonId" TEXT,
    "previousStartsAt" TIMESTAMPTZ(3),
    "previousEndsAt" TIMESTAMPTZ(3),

    CONSTRAINT "AssignmentAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookOn" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "locationVerified" BOOLEAN NOT NULL DEFAULT false,
    "recordedByUserId" TEXT,

    CONSTRAINT "BookOn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookOff" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "BookOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckCall" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "allWell" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "takenByUserId" TEXT,

    CONSTRAINT "CheckCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactAttempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byUserId" TEXT,
    "channel" "ContactChannel" NOT NULL,
    "reached" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "severity" "IncidentSeverity" NOT NULL,
    "summary" TEXT NOT NULL,
    "reportedByUserId" TEXT,
    "reportedByPersonId" TEXT,
    "clientNotified" BOOLEAN NOT NULL DEFAULT false,
    "clientNotifiedAt" TIMESTAMPTZ(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "returnable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentIssue" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "size" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "returnedAt" TIMESTAMPTZ(3),
    "writtenOffAt" TIMESTAMPTZ(3),

    CONSTRAINT "EquipmentIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'number',
    "label" TEXT NOT NULL,
    "usedBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Person_nationalInsurance_key" ON "Person"("nationalInsurance");

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE INDEX "Person_lifecycle_idx" ON "Person"("lifecycle");

-- CreateIndex
CREATE INDEX "PersonIdentityKey_personId_idx" ON "PersonIdentityKey"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonIdentityKey_kind_value_key" ON "PersonIdentityKey"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "User_ssoSubject_key" ON "User"("ssoSubject");

-- CreateIndex
CREATE INDEX "UserRole_role_idx" ON "UserRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_key" ON "UserRole"("userId", "role");

-- CreateIndex
CREATE INDEX "WorkSession_userId_signedInAt_idx" ON "WorkSession"("userId", "signedInAt");

-- CreateIndex
CREATE INDEX "WorkSession_lastSeenAt_idx" ON "WorkSession"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Site_clientId_name_key" ON "Site"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Post_siteId_name_key" ON "Post"("siteId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SiteReference_siteId_employmentId_key" ON "SiteReference"("siteId", "employmentId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteReference_siteId_prn_key" ON "SiteReference"("siteId", "prn");

-- CreateIndex
CREATE UNIQUE INDEX "Employment_personId_key" ON "Employment"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Employment_pin_key" ON "Employment"("pin");

-- CreateIndex
CREATE INDEX "Employment_state_idx" ON "Employment"("state");

-- CreateIndex
CREATE UNIQUE INDEX "Licence_number_key" ON "Licence"("number");

-- CreateIndex
CREATE INDEX "Licence_expiresAt_idx" ON "Licence"("expiresAt");

-- CreateIndex
CREATE INDEX "Licence_personId_idx" ON "Licence"("personId");

-- CreateIndex
CREATE INDEX "DocumentRecord_expiresAt_idx" ON "DocumentRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "DocumentRecord_typeId_verification_idx" ON "DocumentRecord"("typeId", "verification");

-- CreateIndex
CREATE INDEX "DocumentRecord_personId_idx" ON "DocumentRecord"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "FormDefinition_key_version_key" ON "FormDefinition"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FormField_definitionId_key_key" ON "FormField"("definitionId", "key");

-- CreateIndex
CREATE INDEX "FormResponse_definitionId_submittedAt_idx" ON "FormResponse"("definitionId", "submittedAt");

-- CreateIndex
CREATE INDEX "FormResponse_personId_idx" ON "FormResponse"("personId");

-- CreateIndex
CREATE INDEX "FormAnswer_fieldId_valueNumber_idx" ON "FormAnswer"("fieldId", "valueNumber");

-- CreateIndex
CREATE INDEX "FormAnswer_fieldId_valueBool_idx" ON "FormAnswer"("fieldId", "valueBool");

-- CreateIndex
CREATE UNIQUE INDEX "FormAnswer_responseId_fieldId_key" ON "FormAnswer"("responseId", "fieldId");

-- CreateIndex
CREATE INDEX "WorkItem_ownerUserId_state_dueAt_idx" ON "WorkItem"("ownerUserId", "state", "dueAt");

-- CreateIndex
CREATE INDEX "WorkItem_state_dueAt_idx" ON "WorkItem"("state", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_key_key" ON "ReminderRule"("key");

-- CreateIndex
CREATE INDEX "Reminder_state_dueAt_idx" ON "Reminder"("state", "dueAt");

-- CreateIndex
CREATE INDEX "Event_at_idx" ON "Event"("at");

-- CreateIndex
CREATE INDEX "Event_type_at_idx" ON "Event"("type", "at");

-- CreateIndex
CREATE INDEX "Event_department_at_idx" ON "Event"("department", "at");

-- CreateIndex
CREATE INDEX "Event_personId_at_idx" ON "Event"("personId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Requirement_reference_key" ON "Requirement"("reference");

-- CreateIndex
CREATE INDEX "Requirement_status_startDate_idx" ON "Requirement"("status", "startDate");

-- CreateIndex
CREATE INDEX "Candidacy_stage_stageSince_idx" ON "Candidacy"("stage", "stageSince");

-- CreateIndex
CREATE UNIQUE INDEX "Candidacy_personId_requirementId_key" ON "Candidacy"("personId", "requirementId");

-- CreateIndex
CREATE INDEX "Interview_candidacyId_stage_idx" ON "Interview"("candidacyId", "stage");

-- CreateIndex
CREATE INDEX "ScreeningFile_status_idx" ON "ScreeningFile"("status");

-- CreateIndex
CREATE INDEX "ScreeningFile_conditionalEmploymentStart_idx" ON "ScreeningFile"("conditionalEmploymentStart");

-- CreateIndex
CREATE INDEX "ScreeningCheck_fileId_group_idx" ON "ScreeningCheck"("fileId", "group");

-- CreateIndex
CREATE INDEX "ScreeningCheck_status_idx" ON "ScreeningCheck"("status");

-- CreateIndex
CREATE INDEX "ScreeningDecision_fileId_kind_idx" ON "ScreeningDecision"("fileId", "kind");

-- CreateIndex
CREATE INDEX "Assignment_startsAt_endsAt_idx" ON "Assignment"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "Assignment_personId_startsAt_idx" ON "Assignment"("personId", "startsAt");

-- CreateIndex
CREATE INDEX "Assignment_postId_startsAt_idx" ON "Assignment"("postId", "startsAt");

-- CreateIndex
CREATE INDEX "Assignment_state_startsAt_idx" ON "Assignment"("state", "startsAt");

-- CreateIndex
CREATE INDEX "AssignmentAmendment_assignmentId_at_idx" ON "AssignmentAmendment"("assignmentId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "BookOn_assignmentId_key" ON "BookOn"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookOff_assignmentId_key" ON "BookOff"("assignmentId");

-- CreateIndex
CREATE INDEX "CheckCall_assignmentId_at_idx" ON "CheckCall"("assignmentId", "at");

-- CreateIndex
CREATE INDEX "ContactAttempt_assignmentId_at_idx" ON "ContactAttempt"("assignmentId", "at");

-- CreateIndex
CREATE INDEX "Incident_at_idx" ON "Incident"("at");

-- CreateIndex
CREATE INDEX "Incident_severity_clientNotified_idx" ON "Incident"("severity", "clientNotified");

-- CreateIndex
CREATE INDEX "EquipmentIssue_personId_returnedAt_idx" ON "EquipmentIssue"("personId", "returnedAt");

-- AddForeignKey
ALTER TABLE "PersonIdentityKey" ADD CONSTRAINT "PersonIdentityKey_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReference" ADD CONSTRAINT "SiteReference_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReference" ADD CONSTRAINT "SiteReference_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licence" ADD CONSTRAINT "Licence_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRecord" ADD CONSTRAINT "DocumentRecord_screeningFileId_fkey" FOREIGN KEY ("screeningFileId") REFERENCES "ScreeningFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormField" ADD CONSTRAINT "FormField_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "FormDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "FormDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormResponse" ADD CONSTRAINT "FormResponse_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormAnswer" ADD CONSTRAINT "FormAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "FormField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkItemDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_screeningFileId_fkey" FOREIGN KEY ("screeningFileId") REFERENCES "ScreeningFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidacy" ADD CONSTRAINT "Candidacy_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "Requirement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES "Candidacy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningFile" ADD CONSTRAINT "ScreeningFile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningCheck" ADD CONSTRAINT "ScreeningCheck_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ScreeningFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningDecision" ADD CONSTRAINT "ScreeningDecision_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ScreeningFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentAmendment" ADD CONSTRAINT "AssignmentAmendment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookOn" ADD CONSTRAINT "BookOn_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookOff" ADD CONSTRAINT "BookOff_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckCall" ADD CONSTRAINT "CheckCall_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactAttempt" ADD CONSTRAINT "ContactAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "EquipmentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentIssue" ADD CONSTRAINT "EquipmentIssue_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints the Prisma schema cannot express.
--
-- These are not belt-and-braces. Each one encodes a rule that the platform
-- claims to enforce, and a rule enforced only in application code is a rule
-- that survives until the first bug, the first background job written in a
-- hurry, or the first manual fix applied at 2am.
--
-- Apply after `prisma migrate dev` by including this file in the migration:
--   npx prisma migrate dev --create-only
--   cat prisma/constraints.sql >> prisma/migrations/<id>/migration.sql
--   npx prisma migrate dev

-- ---------------------------------------------------------------------------
-- 1. Separation of duties on a screening file  [BS 7858:2019, 6.1, 7.5.2b]
-- ---------------------------------------------------------------------------
-- Nobody screens themselves, in either seat, and the controller who reviews a
-- file is not the administrator who built it. A subquery is needed to resolve
-- a user back to a person, so this is a trigger rather than a CHECK.

CREATE OR REPLACE FUNCTION enforce_screening_separation()
RETURNS TRIGGER AS $$
DECLARE
  admin_person TEXT;
  controller_person TEXT;
BEGIN
  IF NEW."administratorUserId" IS NOT NULL
     AND NEW."administratorUserId" = NEW."controllerUserId" THEN
    RAISE EXCEPTION
      'The controller reviewing a screening file may not be the administrator who built it (7.5.2b)';
  END IF;

  SELECT "personId" INTO admin_person
    FROM "User" WHERE id = NEW."administratorUserId";
  SELECT "personId" INTO controller_person
    FROM "User" WHERE id = NEW."controllerUserId";

  IF admin_person IS NOT NULL AND admin_person = NEW."personId" THEN
    RAISE EXCEPTION 'An individual may not administer their own screening file (6.1)';
  END IF;

  IF controller_person IS NOT NULL AND controller_person = NEW."personId" THEN
    RAISE EXCEPTION 'An individual may not review their own screening file (6.1)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER screening_separation
  BEFORE INSERT OR UPDATE ON "ScreeningFile"
  FOR EACH ROW EXECUTE FUNCTION enforce_screening_separation();

-- ---------------------------------------------------------------------------
-- 2. One person cannot hold two overlapping assignments
-- ---------------------------------------------------------------------------
-- The double-booking that gets noticed at 19:05 when two sites are both short.
-- An exclusion constraint makes it impossible rather than unlikely. Cancelled
-- assignments are excluded, because a cancelled shift is not cover.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Assignment"
  ADD CONSTRAINT assignment_no_overlap
  EXCLUDE USING gist (
    "personId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE (state <> 'cancelled');

ALTER TABLE "Assignment"
  ADD CONSTRAINT assignment_ends_after_start
  CHECK ("endsAt" > "startsAt");

-- ---------------------------------------------------------------------------
-- 3. The event log is append-only
-- ---------------------------------------------------------------------------
-- Every KPI and the whole audit trail are queries over this table. If a row can
-- be edited, the audit trail is a claim rather than a record.

CREATE OR REPLACE FUNCTION reject_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'The event log is append-only: events cannot be % once written', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER event_append_only
  BEFORE UPDATE OR DELETE ON "Event"
  FOR EACH ROW EXECUTE FUNCTION reject_event_mutation();

-- TRUNCATE is not DELETE and slips past a row-level trigger, so it needs its
-- own. Without this, the whole audit trail is one statement away from gone.
CREATE TRIGGER event_no_truncate
  BEFORE TRUNCATE ON "Event"
  FOR EACH STATEMENT EXECUTE FUNCTION reject_event_mutation();

-- ---------------------------------------------------------------------------
-- 4. Data minimisation: no copy where the type forbids one
-- ---------------------------------------------------------------------------
-- A criminal record certificate's outcome and date are retained; the
-- certificate is not. This is the constraint that makes that true rather than
-- intended, and it is the one most likely to be broken by a well-meaning
-- upload feature.

CREATE OR REPLACE FUNCTION enforce_copy_retention()
RETURNS TRIGGER AS $$
DECLARE
  copy_allowed BOOLEAN;
BEGIN
  SELECT "copyRetained" INTO copy_allowed
    FROM "DocumentType" WHERE id = NEW."typeId";

  IF copy_allowed IS FALSE AND NEW."storageKey" IS NOT NULL THEN
    RAISE EXCEPTION
      'Document type % does not permit a copy to be retained — record the outcome and date only',
      NEW."typeId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_copy_retention
  BEFORE INSERT OR UPDATE ON "DocumentRecord"
  FOR EACH ROW EXECUTE FUNCTION enforce_copy_retention();

-- ---------------------------------------------------------------------------
-- 5. Polymorphic subjects: exactly one owner
-- ---------------------------------------------------------------------------
-- Several tables carry one nullable foreign key per possible subject, so the
-- keys are real. What the schema cannot say is that exactly one is set — and a
-- row with two subjects, or none, is a row that appears in the wrong queue.

ALTER TABLE "DocumentRecord"
  ADD CONSTRAINT document_one_owner
  CHECK (num_nonnulls("personId", "siteId", "screeningFileId") = 1);

ALTER TABLE "FormResponse"
  ADD CONSTRAINT form_response_one_subject
  CHECK (num_nonnulls("personId", "assignmentId", "siteId", "clientId") = 1);

ALTER TABLE "WorkItem"
  ADD CONSTRAINT work_item_one_subject
  CHECK (num_nonnulls(
    "personId", "screeningFileId", "requirementId",
    "assignmentId", "documentId", "formResponseId"
  ) = 1);

-- An event always has an actor: a user, or the scheduler. Never neither.
ALTER TABLE "Event"
  ADD CONSTRAINT event_has_actor
  CHECK (num_nonnulls("actorUserId", "actorSystem") >= 1);

-- ---------------------------------------------------------------------------
-- 6. The standard's own limits
-- ---------------------------------------------------------------------------
-- A single extension of up to four weeks [7.6]. Five weeks is not a typo to be
-- corrected later; it is a file that is out of time and reporting that it is not.

ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_extension_limit
  CHECK ("extensionWeeks" IN (0, 4));

ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_period_valid
  CHECK ("screeningPeriodYears" IN (5, 10));

-- An extension has to have been approved by someone, and at a recorded time.
ALTER TABLE "ScreeningFile"
  ADD CONSTRAINT screening_extension_approved
  CHECK (
    "extensionWeeks" = 0
    OR ("extensionApprovedById" IS NOT NULL AND "extensionApprovedAt" IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 7. Hours cannot be exported before they are approved
-- ---------------------------------------------------------------------------
ALTER TABLE "BookOff"
  ADD CONSTRAINT book_off_approval_complete
  CHECK (num_nonnulls("approvedById", "approvedAt") <> 1);
