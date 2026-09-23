--
-- Leon Guarding & FM — Workforce & Operations portal
-- Complete database: schema, rules and demonstration data.
--
-- Taken 2026-09-23 from the branch claude/vibrant-einstein-r1vzl8, commit 5a1d055.
-- PostgreSQL 16.
--
-- ---------------------------------------------------------------------------
-- HOW TO RESTORE IT
-- ---------------------------------------------------------------------------
--
--   createdb leon
--   psql -d leon -f leon-portal-database.sql
--
-- On Windows, if createdb is not recognised:
--   & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres leon
--   & "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -d leon -f leon-portal-database.sql
--
-- Then point the application at it in .env and start it:
--   DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/leon"
--   npm run dev
--
-- Restore into an EMPTY database. It creates its own tables and will collide
-- with anything already there.
--
-- ---------------------------------------------------------------------------
-- WHAT IS IN IT
-- ---------------------------------------------------------------------------
--
--   61 tables, 10 triggers, 46 check constraints, and the data for all of it.
--
-- The rules travel with the data, which is the point of taking a dump rather
-- than copying rows. Restoring this gives you a database that still refuses:
--   * a requester approving their own request
--   * one person signing two rungs of the same approval chain
--   * a request marked approved while a rung is outstanding
--   * an officer double-booked on two shifts at once
--   * an edit or delete on the event log, or on the disposal log
--   * a retained copy of a criminality certificate
--   * a no-signal handover on a post that has a mobile signal
--
-- ---------------------------------------------------------------------------
-- ONE THING TO KNOW BEFORE YOU USE IT
-- ---------------------------------------------------------------------------
--
-- The demonstration dates were computed as offsets from 2026-09-23, so this file
-- is a photograph: the live board shows the shifts that were running that day.
-- Restore it in a fortnight and the board will look a fortnight stale.
--
-- For a working copy, `npm run db:migrate && npm run db:seed` rebuilds the same
-- database with today's dates instead, and is the better way to move it about.
-- Use this file when you want to hand somebody the exact state, or to inspect
-- the schema without installing anything.
--
-- The people and sites in here are invented. No real person appears.
--

--
-- PostgreSQL database dump
--

\restrict xaYb9XgQr7w6LnRxB6uhXPfGFMr0grBYPgcy2dvT09K9BwZUWQrpy8r4CNMWwSw

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: AccreditationState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccreditationState" AS ENUM (
    'held',
    'applying',
    'suspended',
    'lapsed'
);


--
-- Name: AdminCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminCategory" AS ENUM (
    'payments',
    'premises',
    'people_admin',
    'decisions',
    'uniform',
    'accreditations'
);


--
-- Name: AdminItemState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminItemState" AS ENUM (
    'raised',
    'assigned',
    'in_progress',
    'reviewed',
    'approved',
    'rejected',
    'completed',
    'cancelled'
);


--
-- Name: AdminPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminPriority" AS ENUM (
    'P1',
    'P2',
    'P3',
    'P4'
);


--
-- Name: AdminRequestKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminRequestKind" AS ENUM (
    'payment',
    'purchase',
    'voucher',
    'penalty',
    'suspension',
    'holiday',
    'authority_response',
    'write_off'
);


--
-- Name: AdminTrack; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdminTrack" AS ENUM (
    'task',
    'request'
);


--
-- Name: AssetCondition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetCondition" AS ENUM (
    'in_service',
    'needs_attention',
    'out_of_service',
    'disposed'
);


--
-- Name: AssignmentState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssignmentState" AS ENUM (
    'draft',
    'published',
    'amended',
    'cancelled',
    'completed'
);


--
-- Name: AuthorityBody; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuthorityBody" AS ENUM (
    'dwp',
    'hmrc',
    'home_office',
    'tribunal',
    'local_authority',
    'sia',
    'other'
);


--
-- Name: AuthorityMatterState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AuthorityMatterState" AS ENUM (
    'open',
    'awaiting_response',
    'responded',
    'closed'
);


--
-- Name: CandidateSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CandidateSource" AS ENUM (
    'previous_enquiry',
    'existing_indeed',
    'new_indeed_ad',
    'referral'
);


--
-- Name: CheckGroup; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CheckGroup" AS ENUM (
    'consent',
    'preliminary',
    'history',
    'criminality',
    'legal',
    'signoff',
    'exception'
);


--
-- Name: CheckStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CheckStatus" AS ENUM (
    'not_started',
    'requested',
    'chased',
    'received',
    'verified',
    'not_applicable',
    'failed'
);


--
-- Name: ContactChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContactChannel" AS ENUM (
    'app',
    'phone',
    'site_phone',
    'sms',
    'qr',
    'supervisor'
);


--
-- Name: DecisionKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DecisionKind" AS ENUM (
    'risk_acceptance',
    'extension',
    'statutory_declaration',
    'adverse_finding',
    'representation',
    'final_signoff'
);


--
-- Name: Department; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Department" AS ENUM (
    'control',
    'recruitment',
    'vetting',
    'compliance',
    'operations',
    'quality',
    'account_management',
    'administration'
);


--
-- Name: DisposalRule; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DisposalRule" AS ENUM (
    'unsuccessful_applicant_12_months',
    'after_cessation_7_years',
    'document_type_rule',
    'subject_request'
);


--
-- Name: DocumentVerification; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentVerification" AS ENUM (
    'not_supplied',
    'supplied',
    'rejected',
    'verified',
    'expired'
);


--
-- Name: EmploymentState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmploymentState" AS ENUM (
    'conditional',
    'confirmed',
    'suspended',
    'ended'
);


--
-- Name: EvidenceSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EvidenceSource" AS ENUM (
    'derived_screening',
    'derived_quality',
    'derived_training',
    'document',
    'manual'
);


--
-- Name: FieldKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FieldKind" AS ENUM (
    'text',
    'number',
    'boolean',
    'choice',
    'score',
    'date',
    'signature',
    'photo',
    'document'
);


--
-- Name: HolidayDecision; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HolidayDecision" AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
);


--
-- Name: IdentityKeyKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IdentityKeyKind" AS ENUM (
    'name_and_dob',
    'national_insurance',
    'sia_licence',
    'phone',
    'email'
);


--
-- Name: IncidentSeverity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."IncidentSeverity" AS ENUM (
    'log_only',
    'notable',
    'serious'
);


--
-- Name: InterviewOutcome; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InterviewOutcome" AS ENUM (
    'progress',
    'hold',
    'reject'
);


--
-- Name: InterviewStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InterviewStage" AS ENUM (
    'first',
    'second',
    'additional'
);


--
-- Name: LicenceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LicenceKind" AS ENUM (
    'sia_door_supervisor',
    'sia_security_guarding',
    'sia_cctv',
    'sia_close_protection',
    'other'
);


--
-- Name: MaintenanceKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MaintenanceKind" AS ENUM (
    'service',
    'repair',
    'inspection',
    'replacement'
);


--
-- Name: PaymentFrequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PaymentFrequency" AS ENUM (
    'weekly',
    'monthly',
    'quarterly',
    'annually'
);


--
-- Name: PenaltyKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PenaltyKind" AS ENUM (
    'fine',
    'penalty',
    'deduction',
    'recharge'
);


--
-- Name: PenaltyState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PenaltyState" AS ENUM (
    'raised',
    'approved',
    'rejected',
    'recovered',
    'written_off'
);


--
-- Name: PersonLifecycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PersonLifecycle" AS ENUM (
    'enquiry',
    'applicant',
    'candidate',
    'conditional_officer',
    'confirmed_officer',
    'leaver',
    'rehire_candidate'
);


--
-- Name: RecruitmentStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RecruitmentStage" AS ENUM (
    'sourcing',
    'shortlisted',
    'invited',
    'application_received',
    'application_complete',
    'first_interview',
    'second_interview',
    'additional_interview',
    'conditional_offer',
    'welcome_pack',
    'signed_docs_complete',
    'onboarding_complete',
    'deployed',
    'confirmed_employment',
    'withdrawn'
);


--
-- Name: Recurrence; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Recurrence" AS ENUM (
    'none',
    'daily',
    'weekly',
    'monthly',
    'quarterly'
);


--
-- Name: ReminderState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReminderState" AS ENUM (
    'pending',
    'sent',
    'cancelled',
    'failed'
);


--
-- Name: RequirementStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RequirementStatus" AS ENUM (
    'received',
    'pool_check',
    'covered_internally',
    'released_to_sourcing',
    'allocated',
    'filled',
    'cancelled'
);


--
-- Name: Role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Role" AS ENUM (
    'control',
    'operations_manager',
    'recruitment',
    'recruitment_manager',
    'vetting_admin',
    'vetting_controller',
    'top_management',
    'auditor',
    'admin_officer',
    'admin_manager',
    'finance_officer'
);


--
-- Name: StockMovementKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StockMovementKind" AS ENUM (
    'received',
    'issued',
    'returned',
    'written_off',
    'adjustment'
);


--
-- Name: VettingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VettingStatus" AS ENUM (
    'not_started',
    'consent_captured',
    'information_complete',
    'preliminary_checks_complete',
    'limited_screening_complete',
    'controller_review_1',
    'full_screening_in_progress',
    'full_screening_complete',
    'controller_review_2',
    'risk_acceptance_required',
    'statutory_declaration_required',
    'adverse_finding',
    'time_expired',
    'withdrawn',
    'complete'
);


--
-- Name: VoucherState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VoucherState" AS ENUM (
    'issued',
    'redeemed',
    'expired',
    'cancelled'
);


--
-- Name: WorkItemState; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkItemState" AS ENUM (
    'open',
    'blocked',
    'done',
    'cancelled'
);


--
-- Name: enforce_approval_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_approval_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  outstanding INT;
  rejected INT;
BEGIN
  IF NEW."state" <> 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO outstanding
    FROM "AdminApproval"
    WHERE "itemId" = NEW.id AND "decision" IS NULL;

  IF outstanding > 0 THEN
    RAISE EXCEPTION
      'This request still needs % approval(s). Nothing approves itself.', outstanding;
  END IF;

  SELECT count(*) INTO rejected
    FROM "AdminApproval"
    WHERE "itemId" = NEW.id AND "decision" = 'rejected';

  IF rejected > 0 THEN
    RAISE EXCEPTION 'A rejected request cannot be marked approved';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_approval_separation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_approval_separation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  requester TEXT;
  subject_person TEXT;
  approver_person TEXT;
BEGIN
  IF NEW."decidedByUserId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "requestedByUserId", "aboutPersonId"
    INTO requester, subject_person
    FROM "AdminItem" WHERE id = NEW."itemId";

  IF requester = NEW."decidedByUserId" THEN
    RAISE EXCEPTION
      'The person who raised a request may not approve it, whatever role they hold';
  END IF;

  IF subject_person IS NOT NULL THEN
    SELECT "personId" INTO approver_person
      FROM "User" WHERE id = NEW."decidedByUserId";
    IF approver_person = subject_person THEN
      RAISE EXCEPTION 'Nobody may decide a request about themselves';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_copy_retention(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_copy_retention() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: enforce_delegation_source(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_delegation_source() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  holds INT;
BEGIN
  SELECT count(*) INTO holds
    FROM "UserRole"
    WHERE "userId" = NEW."fromUserId"
      AND "role" = NEW."role"
      AND "revokedAt" IS NULL;

  IF holds = 0 THEN
    RAISE EXCEPTION
      'A role cannot be delegated by somebody who does not hold it (%)', NEW."role";
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: enforce_no_signal_post(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_no_signal_post() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: enforce_screening_separation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_screening_separation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: reject_disposal_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_disposal_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'The disposal log is append-only: entries cannot be % once written', TG_OP;
END;
$$;


--
-- Name: reject_event_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_event_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  RAISE EXCEPTION 'The event log is append-only: events cannot be % once written', TG_OP;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Accreditation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Accreditation" (
    id text NOT NULL,
    name text NOT NULL,
    body text NOT NULL,
    scope text NOT NULL,
    "certificateNumber" text,
    "firstAwardedOn" timestamp(3) with time zone,
    "expiresOn" timestamp(3) with time zone NOT NULL,
    "nextAuditOn" timestamp(3) with time zone,
    state public."AccreditationState" DEFAULT 'held'::public."AccreditationState" NOT NULL,
    "ownerRole" public."Role"
);


--
-- Name: AccreditationRequirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccreditationRequirement" (
    id text NOT NULL,
    "accreditationId" text NOT NULL,
    clause text,
    label text NOT NULL,
    source public."EvidenceSource" NOT NULL,
    "derivedFrom" text,
    "documentId" text,
    "satisfiedAt" timestamp(3) with time zone,
    "satisfiedByUserId" text,
    note text,
    CONSTRAINT accreditation_evidence_has_source CHECK ((((source = ANY (ARRAY['derived_screening'::public."EvidenceSource", 'derived_quality'::public."EvidenceSource", 'derived_training'::public."EvidenceSource"])) AND ("derivedFrom" IS NOT NULL)) OR ((source = 'document'::public."EvidenceSource") AND ("documentId" IS NOT NULL)) OR (source = 'manual'::public."EvidenceSource"))),
    CONSTRAINT accreditation_satisfied_whole CHECK ((num_nonnulls("satisfiedAt", "satisfiedByUserId") <> 1))
);


--
-- Name: AccreditationSubmission; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AccreditationSubmission" (
    id text NOT NULL,
    "accreditationId" text NOT NULL,
    "submittedOn" timestamp(3) with time zone NOT NULL,
    "submittedByUserId" text,
    outcome text,
    "newExpiresOn" timestamp(3) with time zone
);


--
-- Name: AdminApproval; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminApproval" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    step integer NOT NULL,
    "requiredRoles" public."Role"[],
    reason text NOT NULL,
    decision text,
    "decidedByUserId" text,
    "decidedByRole" public."Role",
    "decidedAt" timestamp(3) with time zone,
    grounds text,
    "amountApprovedPence" integer,
    CONSTRAINT admin_approval_decision_valid CHECK (((decision IS NULL) OR (decision = ANY (ARRAY['approved'::text, 'rejected'::text])))),
    CONSTRAINT admin_approval_decision_whole CHECK ((num_nonnulls(decision, "decidedByUserId", "decidedAt") = ANY (ARRAY[0, 3]))),
    CONSTRAINT admin_approval_rejection_has_grounds CHECK (((decision <> 'rejected'::text) OR (grounds IS NOT NULL))),
    CONSTRAINT admin_approval_step_positive CHECK ((step >= 1))
);


--
-- Name: AdminItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AdminItem" (
    id text NOT NULL,
    reference text NOT NULL,
    track public."AdminTrack" NOT NULL,
    category public."AdminCategory" NOT NULL,
    kind public."AdminRequestKind",
    title text NOT NULL,
    detail text,
    priority public."AdminPriority" DEFAULT 'P3'::public."AdminPriority" NOT NULL,
    state public."AdminItemState" DEFAULT 'raised'::public."AdminItemState" NOT NULL,
    "amountPence" integer,
    "aboutPersonId" text,
    "supplierId" text,
    "recurringPaymentId" text,
    "assetId" text,
    "holidayRequestId" text,
    "penaltyId" text,
    "voucherId" text,
    "accreditationId" text,
    "authorityMatterId" text,
    "stockItemId" text,
    "requestedByUserId" text NOT NULL,
    "assignedToUserId" text,
    "assignedToRole" public."Role",
    "raisedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueAt" timestamp(3) with time zone NOT NULL,
    "startedAt" timestamp(3) with time zone,
    "reviewedAt" timestamp(3) with time zone,
    "decidedAt" timestamp(3) with time zone,
    "completedAt" timestamp(3) with time zone,
    "cancelledAt" timestamp(3) with time zone,
    "escalatedStage" integer DEFAULT 0 NOT NULL,
    CONSTRAINT admin_item_amount_not_negative CHECK ((("amountPence" IS NULL) OR ("amountPence" >= 0))),
    CONSTRAINT admin_item_kind_matches_track CHECK ((((track = 'request'::public."AdminTrack") AND (kind IS NOT NULL)) OR ((track = 'task'::public."AdminTrack") AND (kind IS NULL)))),
    CONSTRAINT admin_item_one_subject CHECK ((num_nonnulls("supplierId", "recurringPaymentId", "assetId", "holidayRequestId", "penaltyId", "voucherId", "accreditationId", "authorityMatterId", "stockItemId") <= 1))
);


--
-- Name: Asset; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Asset" (
    id text NOT NULL,
    tag text NOT NULL,
    label text NOT NULL,
    category text NOT NULL,
    location text NOT NULL,
    "supplierId" text,
    "purchasedOn" timestamp(3) with time zone,
    "purchaseCostPence" integer,
    "warrantyEndsOn" timestamp(3) with time zone,
    "serviceIntervalMonths" integer,
    "lastServicedOn" timestamp(3) with time zone,
    "nextServiceOn" timestamp(3) with time zone,
    condition public."AssetCondition" DEFAULT 'in_service'::public."AssetCondition" NOT NULL
);


--
-- Name: Assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Assignment" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "postId" text NOT NULL,
    "startsAt" timestamp(3) with time zone NOT NULL,
    "endsAt" timestamp(3) with time zone NOT NULL,
    state public."AssignmentState" DEFAULT 'draft'::public."AssignmentState" NOT NULL,
    "publishedAt" timestamp(3) with time zone,
    "publishedById" text,
    "publishCheckNote" text,
    CONSTRAINT assignment_ends_after_start CHECK (("endsAt" > "startsAt"))
);


--
-- Name: AssignmentAmendment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AssignmentAmendment" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "byUserId" text,
    change text NOT NULL,
    reason text NOT NULL,
    "previousPersonId" text,
    "previousStartsAt" timestamp(3) with time zone,
    "previousEndsAt" timestamp(3) with time zone
);


--
-- Name: AuthorityMatter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AuthorityMatter" (
    id text NOT NULL,
    reference text NOT NULL,
    body public."AuthorityBody" NOT NULL,
    "matterType" text NOT NULL,
    "personId" text,
    "receivedOn" timestamp(3) with time zone NOT NULL,
    "dueOn" timestamp(3) with time zone,
    state public."AuthorityMatterState" DEFAULT 'open'::public."AuthorityMatterState" NOT NULL,
    summary text NOT NULL,
    "respondedOn" timestamp(3) with time zone,
    "closedOn" timestamp(3) with time zone
);


--
-- Name: BookOff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BookOff" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    at timestamp(3) with time zone NOT NULL,
    channel public."ContactChannel" NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) with time zone,
    CONSTRAINT book_off_approval_complete CHECK ((num_nonnulls("approvedById", "approvedAt") <> 1))
);


--
-- Name: BookOn; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."BookOn" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    at timestamp(3) with time zone NOT NULL,
    channel public."ContactChannel" NOT NULL,
    latitude numeric(9,6),
    longitude numeric(9,6),
    "locationVerified" boolean DEFAULT false NOT NULL,
    "recordedByUserId" text
);


--
-- Name: Candidacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Candidacy" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "requirementId" text,
    stage public."RecruitmentStage" DEFAULT 'sourcing'::public."RecruitmentStage" NOT NULL,
    "stageSince" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source public."CandidateSource",
    "ownerUserId" text,
    "withdrawnReason" text
);


--
-- Name: CheckCall; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CheckCall" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    at timestamp(3) with time zone NOT NULL,
    channel public."ContactChannel" NOT NULL,
    "allWell" boolean DEFAULT true NOT NULL,
    note text,
    "takenByUserId" text
);


--
-- Name: Client; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Client" (
    id text NOT NULL,
    name text NOT NULL,
    "screeningPeriodYears" integer DEFAULT 5 NOT NULL,
    "requiresAdditionalInterview" boolean DEFAULT false NOT NULL,
    "regulatedActivity" boolean DEFAULT false NOT NULL,
    "contractStart" date,
    "contractEnd" date,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: ContactAttempt; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactAttempt" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "byUserId" text,
    channel public."ContactChannel" NOT NULL,
    reached boolean DEFAULT false NOT NULL,
    note text
);


--
-- Name: DisposalRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DisposalRecord" (
    id text NOT NULL,
    at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rule public."DisposalRule" NOT NULL,
    "subjectDescription" text NOT NULL,
    "personRef" text,
    "screeningFileRef" text,
    "documentRef" text,
    "itemsDestroyed" integer DEFAULT 1 NOT NULL,
    "retainedInstead" text,
    "performedByUserId" text,
    "performedBySystem" text,
    "verifiedByUserId" text,
    CONSTRAINT disposal_has_performer CHECK ((num_nonnulls("performedByUserId", "performedBySystem") = 1)),
    CONSTRAINT disposal_items_positive CHECK (("itemsDestroyed" > 0))
);


--
-- Name: DocumentRecord; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentRecord" (
    id text NOT NULL,
    "typeId" text NOT NULL,
    "personId" text,
    "siteId" text,
    "clientId" text,
    "screeningFileId" text,
    verification public."DocumentVerification" DEFAULT 'not_supplied'::public."DocumentVerification" NOT NULL,
    "storageKey" text,
    "rejectionReason" text,
    "suppliedAt" timestamp(3) with time zone,
    "verifiedAt" timestamp(3) with time zone,
    "verifiedById" text,
    "expiresAt" date,
    "disposedAt" timestamp(3) with time zone,
    CONSTRAINT document_one_owner CHECK ((num_nonnulls("personId", "siteId", "clientId", "screeningFileId") = 1))
);


--
-- Name: DocumentType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DocumentType" (
    id text NOT NULL,
    label text NOT NULL,
    department public."Department" NOT NULL,
    expires boolean DEFAULT false NOT NULL,
    "copyRetained" boolean DEFAULT true NOT NULL,
    "retentionNote" text,
    clause text
);


--
-- Name: Employment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Employment" (
    id text NOT NULL,
    "personId" text NOT NULL,
    state public."EmploymentState" DEFAULT 'conditional'::public."EmploymentState" NOT NULL,
    pin text NOT NULL,
    "controlTeam" text,
    "startedAt" date NOT NULL,
    "confirmedAt" timestamp(3) with time zone,
    "endedAt" timestamp(3) with time zone,
    "leaverReason" text
);


--
-- Name: EquipmentIssue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EquipmentIssue" (
    id text NOT NULL,
    "itemId" text NOT NULL,
    "personId" text NOT NULL,
    size text,
    quantity integer DEFAULT 1 NOT NULL,
    "issuedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "issuedById" text,
    "returnedAt" timestamp(3) with time zone,
    "writtenOffAt" timestamp(3) with time zone
);


--
-- Name: EquipmentItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EquipmentItem" (
    id text NOT NULL,
    category text NOT NULL,
    label text NOT NULL,
    returnable boolean DEFAULT true NOT NULL
);


--
-- Name: Event; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Event" (
    id text NOT NULL,
    at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    type text NOT NULL,
    "actorUserId" text,
    "actorRole" public."Role",
    "actorSystem" text,
    department public."Department" NOT NULL,
    "personId" text,
    "assignmentId" text,
    "screeningFileId" text,
    "requirementId" text,
    "documentId" text,
    "siteId" text,
    detail text,
    payload jsonb,
    "adminItemId" text,
    CONSTRAINT event_has_actor CHECK ((num_nonnulls("actorUserId", "actorSystem") >= 1))
);


--
-- Name: FormAnswer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormAnswer" (
    id text NOT NULL,
    "responseId" text NOT NULL,
    "fieldId" text NOT NULL,
    "valueText" text,
    "valueNumber" numeric(12,2),
    "valueBool" boolean,
    "valueDate" timestamp(3) with time zone,
    "documentId" text
);


--
-- Name: FormDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormDefinition" (
    id text NOT NULL,
    key text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    title text NOT NULL,
    purpose text,
    department public."Department" NOT NULL,
    "filledBy" text NOT NULL,
    trigger text,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: FormField; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormField" (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    kind public."FieldKind" NOT NULL,
    required boolean DEFAULT false NOT NULL,
    "position" integer NOT NULL,
    "feedsKpi" text,
    choices text[]
);


--
-- Name: FormResponse; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FormResponse" (
    id text NOT NULL,
    "definitionId" text NOT NULL,
    "definitionVersion" integer NOT NULL,
    "personId" text,
    "assignmentId" text,
    "siteId" text,
    "clientId" text,
    "submittedById" text,
    "submittedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) with time zone,
    CONSTRAINT form_response_one_subject CHECK ((num_nonnulls("personId", "assignmentId", "siteId", "clientId") = 1))
);


--
-- Name: HolidayEntitlement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HolidayEntitlement" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "leaveYearStart" timestamp(3) with time zone NOT NULL,
    "leaveYearEnd" timestamp(3) with time zone NOT NULL,
    "entitlementHours" integer NOT NULL,
    "carriedOverHours" integer DEFAULT 0 NOT NULL,
    basis text,
    CONSTRAINT entitlement_hours_not_negative CHECK ((("entitlementHours" >= 0) AND ("carriedOverHours" >= 0))),
    CONSTRAINT entitlement_leave_year_ordered CHECK (("leaveYearEnd" > "leaveYearStart"))
);


--
-- Name: HolidayRequest; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."HolidayRequest" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "entitlementId" text,
    "startsOn" timestamp(3) with time zone NOT NULL,
    "endsOn" timestamp(3) with time zone NOT NULL,
    "hoursRequested" integer NOT NULL,
    decision public."HolidayDecision" DEFAULT 'pending'::public."HolidayDecision" NOT NULL,
    "raisedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedAt" timestamp(3) with time zone,
    "decidedByUserId" text,
    note text,
    "shiftsAffected" integer,
    CONSTRAINT holiday_dates_ordered CHECK (("endsOn" >= "startsOn")),
    CONSTRAINT holiday_decision_whole CHECK (((decision = 'pending'::public."HolidayDecision") OR (num_nonnulls("decidedAt", "decidedByUserId") = 2))),
    CONSTRAINT holiday_hours_positive CHECK (("hoursRequested" > 0))
);


--
-- Name: Incident; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Incident" (
    id text NOT NULL,
    "assignmentId" text,
    at timestamp(3) with time zone NOT NULL,
    severity public."IncidentSeverity" NOT NULL,
    summary text NOT NULL,
    "reportedByUserId" text,
    "reportedByPersonId" text,
    "clientNotified" boolean DEFAULT false NOT NULL,
    "clientNotifiedAt" timestamp(3) with time zone,
    "reviewedById" text,
    "reviewedAt" timestamp(3) with time zone
);


--
-- Name: Interview; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Interview" (
    id text NOT NULL,
    "candidacyId" text NOT NULL,
    stage public."InterviewStage" NOT NULL,
    "interviewerUserId" text,
    "heldAt" timestamp(3) with time zone NOT NULL,
    outcome public."InterviewOutcome" NOT NULL,
    notes text
);


--
-- Name: Licence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Licence" (
    id text NOT NULL,
    "personId" text NOT NULL,
    kind public."LicenceKind" NOT NULL,
    number text NOT NULL,
    "nameOnBadge" text NOT NULL,
    "expiresAt" date NOT NULL,
    "lastVerifiedAt" timestamp(3) with time zone,
    "registerStatus" text
);


--
-- Name: MaintenanceJob; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MaintenanceJob" (
    id text NOT NULL,
    "assetId" text NOT NULL,
    kind public."MaintenanceKind" NOT NULL,
    "reportedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "reportedByUserId" text,
    description text NOT NULL,
    "supplierId" text,
    "costPence" integer,
    "completedAt" timestamp(3) with time zone,
    outcome text
);


--
-- Name: NoSignalHandover; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."NoSignalHandover" (
    id text NOT NULL,
    "assignmentId" text NOT NULL,
    "notifiedAt" timestamp(3) with time zone,
    "notifiedByUserId" text,
    "notifiedContact" text,
    "lossReportedAt" timestamp(3) with time zone,
    "lossReportedBy" text,
    "lossDetail" text,
    CONSTRAINT no_signal_loss_after_handover CHECK ((("lossReportedAt" IS NULL) OR (("notifiedAt" IS NOT NULL) AND ("lossReportedAt" >= "notifiedAt")))),
    CONSTRAINT no_signal_loss_report_whole CHECK ((num_nonnulls("lossReportedAt", "lossReportedBy") <> 1)),
    CONSTRAINT no_signal_notification_whole CHECK ((num_nonnulls("notifiedAt", "notifiedContact") <> 1))
);


--
-- Name: PaymentInstance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PaymentInstance" (
    id text NOT NULL,
    "recurringPaymentId" text NOT NULL,
    "dueOn" timestamp(3) with time zone NOT NULL,
    "amountDuePence" integer NOT NULL,
    "paidOn" timestamp(3) with time zone,
    "amountPaidPence" integer,
    reference text,
    "varianceApprovedByUserId" text,
    "varianceApprovedAt" timestamp(3) with time zone,
    CONSTRAINT payment_instance_amounts_not_negative CHECK ((("amountDuePence" >= 0) AND (("amountPaidPence" IS NULL) OR ("amountPaidPence" >= 0)))),
    CONSTRAINT payment_instance_paid_whole CHECK ((num_nonnulls("paidOn", "amountPaidPence") <> 1))
);


--
-- Name: Penalty; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Penalty" (
    id text NOT NULL,
    reference text NOT NULL,
    "personId" text NOT NULL,
    kind public."PenaltyKind" NOT NULL,
    "amountPence" integer NOT NULL,
    grounds text NOT NULL,
    state public."PenaltyState" DEFAULT 'raised'::public."PenaltyState" NOT NULL,
    "raisedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "recoveredOn" timestamp(3) with time zone,
    "writtenOffOn" timestamp(3) with time zone,
    "writtenOffReason" text,
    CONSTRAINT penalty_amount_positive CHECK (("amountPence" > 0)),
    CONSTRAINT penalty_write_off_has_reason CHECK (((state <> 'written_off'::public."PenaltyState") OR (("writtenOffOn" IS NOT NULL) AND ("writtenOffReason" IS NOT NULL))))
);


--
-- Name: Person; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Person" (
    id text NOT NULL,
    lifecycle public."PersonLifecycle" DEFAULT 'enquiry'::public."PersonLifecycle" NOT NULL,
    "fullName" text NOT NULL,
    "previousName" text,
    "dateOfBirth" date NOT NULL,
    email text,
    phone text,
    "nationalInsurance" text,
    "nextOfKinName" text,
    "nextOfKinPhone" text,
    "payrollRef" text,
    "firstContactAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) with time zone NOT NULL
);


--
-- Name: PersonIdentityKey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PersonIdentityKey" (
    id text NOT NULL,
    "personId" text NOT NULL,
    kind public."IdentityKeyKind" NOT NULL,
    value text NOT NULL
);


--
-- Name: Post; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Post" (
    id text NOT NULL,
    "siteId" text NOT NULL,
    name text NOT NULL,
    pattern text,
    "requiresSiaLicence" boolean DEFAULT true NOT NULL,
    "screeningPeriodYears" integer DEFAULT 5 NOT NULL,
    "checkCallsRequired" boolean DEFAULT true NOT NULL,
    "loneWorking" boolean DEFAULT false NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "mobileSignal" boolean DEFAULT true NOT NULL
);


--
-- Name: RecurringPayment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RecurringPayment" (
    id text NOT NULL,
    "supplierId" text NOT NULL,
    label text NOT NULL,
    "agreedAmountPence" integer NOT NULL,
    frequency public."PaymentFrequency" NOT NULL,
    "dayOfMonth" integer,
    "firstDueOn" timestamp(3) with time zone NOT NULL,
    "endsOn" timestamp(3) with time zone,
    active boolean DEFAULT true NOT NULL,
    CONSTRAINT recurring_payment_amount_positive CHECK (("agreedAmountPence" > 0)),
    CONSTRAINT recurring_payment_day_matches_frequency CHECK (
CASE
    WHEN (frequency = 'weekly'::public."PaymentFrequency") THEN ("dayOfMonth" IS NULL)
    ELSE (("dayOfMonth" IS NOT NULL) AND (("dayOfMonth" >= 1) AND ("dayOfMonth" <= 28)))
END)
);


--
-- Name: Reminder; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Reminder" (
    id text NOT NULL,
    "ruleId" text NOT NULL,
    state public."ReminderState" DEFAULT 'pending'::public."ReminderState" NOT NULL,
    "personId" text,
    "documentId" text,
    "workItemId" text,
    "screeningFileId" text,
    "dueAt" timestamp(3) with time zone NOT NULL,
    "sentAt" timestamp(3) with time zone,
    "cancelledAt" timestamp(3) with time zone,
    "cancelledReason" text,
    attempt integer DEFAULT 1 NOT NULL
);


--
-- Name: ReminderRule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ReminderRule" (
    id text NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    subject text NOT NULL,
    offsets integer[],
    channel text DEFAULT 'email'::text NOT NULL,
    "escalatesTo" public."Role",
    active boolean DEFAULT true NOT NULL
);


--
-- Name: Requirement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Requirement" (
    id text NOT NULL,
    reference text NOT NULL,
    "clientId" text NOT NULL,
    "siteId" text NOT NULL,
    "controlTeam" text,
    post text NOT NULL,
    "headcountRequired" integer DEFAULT 1 NOT NULL,
    "shiftPattern" text,
    "startDate" date NOT NULL,
    status public."RequirementStatus" DEFAULT 'received'::public."RequirementStatus" NOT NULL,
    "receivedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "releasedToSourcingAt" timestamp(3) with time zone,
    "ownerUserId" text
);


--
-- Name: RoleDelegation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."RoleDelegation" (
    id text NOT NULL,
    role public."Role" NOT NULL,
    "fromUserId" text NOT NULL,
    "toUserId" text NOT NULL,
    "startsAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "endsAt" timestamp(3) with time zone NOT NULL,
    reason text NOT NULL,
    "grantedByUserId" text NOT NULL,
    "grantedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revokedAt" timestamp(3) with time zone,
    "revokedByUserId" text,
    "revokedReason" text,
    CONSTRAINT delegation_ends_after_it_starts CHECK (("endsAt" > "startsAt")),
    CONSTRAINT delegation_not_granted_to_self CHECK (("toUserId" <> "grantedByUserId")),
    CONSTRAINT delegation_not_longer_than_90_days CHECK (("endsAt" <= ("startsAt" + '90 days'::interval))),
    CONSTRAINT delegation_not_to_self CHECK (("toUserId" <> "fromUserId")),
    CONSTRAINT delegation_revocation_whole CHECK ((num_nonnulls("revokedAt", "revokedByUserId", "revokedReason") = ANY (ARRAY[0, 3])))
);


--
-- Name: ScreeningCheck; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScreeningCheck" (
    id text NOT NULL,
    "fileId" text NOT NULL,
    "group" public."CheckGroup" NOT NULL,
    label text NOT NULL,
    clause text NOT NULL,
    status public."CheckStatus" DEFAULT 'not_started'::public."CheckStatus" NOT NULL,
    "ownerUserId" text,
    "requestCode" text,
    "firstRequestSentAt" timestamp(3) with time zone,
    "secondRequestSentAt" timestamp(3) with time zone,
    "confirmedAt" timestamp(3) with time zone,
    "coversFrom" date,
    "coversTo" date,
    notes text
);


--
-- Name: ScreeningDecision; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScreeningDecision" (
    id text NOT NULL,
    "fileId" text NOT NULL,
    kind public."DecisionKind" NOT NULL,
    "decidedById" text NOT NULL,
    "decidedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rationale text NOT NULL,
    "amountGbp" numeric(12,2)
);


--
-- Name: ScreeningFile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScreeningFile" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "screeningPeriodYears" integer DEFAULT 5 NOT NULL,
    status public."VettingStatus" DEFAULT 'not_started'::public."VettingStatus" NOT NULL,
    "conditionalEmploymentStart" date,
    "extensionWeeks" integer DEFAULT 0 NOT NULL,
    "extensionApprovedById" text,
    "extensionApprovedAt" timestamp(3) with time zone,
    "administratorUserId" text,
    "controllerUserId" text,
    "controllerReview1At" timestamp(3) with time zone,
    "controllerReview2At" timestamp(3) with time zone,
    "unverifiedDays" integer DEFAULT 0 NOT NULL,
    "gapsOver31Days" integer DEFAULT 0 NOT NULL,
    "openedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "completedAt" timestamp(3) with time zone,
    "retainUntil" date,
    "disposedAt" timestamp(3) with time zone,
    CONSTRAINT screening_extension_approved CHECK ((("extensionWeeks" = 0) OR (("extensionApprovedById" IS NOT NULL) AND ("extensionApprovedAt" IS NOT NULL)))),
    CONSTRAINT screening_extension_limit CHECK (("extensionWeeks" = ANY (ARRAY[0, 4]))),
    CONSTRAINT screening_period_valid CHECK (("screeningPeriodYears" = ANY (ARRAY[5, 10])))
);


--
-- Name: Setting; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Setting" (
    key text NOT NULL,
    value text NOT NULL,
    "valueType" text DEFAULT 'number'::text NOT NULL,
    label text NOT NULL,
    "usedBy" text,
    "updatedAt" timestamp(3) with time zone NOT NULL,
    "updatedById" text
);


--
-- Name: Site; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Site" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    name text NOT NULL,
    address text,
    "clientRef" text,
    "checkCallInstruction" text
);


--
-- Name: SiteReference; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SiteReference" (
    id text NOT NULL,
    "siteId" text NOT NULL,
    "employmentId" text NOT NULL,
    prn text NOT NULL
);


--
-- Name: StockItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StockItem" (
    id text NOT NULL,
    "equipmentItemId" text NOT NULL,
    size text,
    "reorderLevel" integer DEFAULT 0 NOT NULL,
    location text,
    CONSTRAINT stock_reorder_level_not_negative CHECK (("reorderLevel" >= 0))
);


--
-- Name: StockMovement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."StockMovement" (
    id text NOT NULL,
    "stockItemId" text NOT NULL,
    kind public."StockMovementKind" NOT NULL,
    quantity integer NOT NULL,
    at timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "byUserId" text,
    note text,
    "equipmentIssueId" text,
    CONSTRAINT stock_movement_sign_matches_kind CHECK ((((kind = ANY (ARRAY['received'::public."StockMovementKind", 'returned'::public."StockMovementKind"])) AND (quantity > 0)) OR ((kind = ANY (ARRAY['issued'::public."StockMovementKind", 'written_off'::public."StockMovementKind"])) AND (quantity < 0)) OR ((kind = 'adjustment'::public."StockMovementKind") AND (quantity <> 0))))
);


--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    "contactName" text,
    email text,
    phone text,
    "accountRef" text,
    "paymentTermsDays" integer DEFAULT 30 NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: SupplierContract; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SupplierContract" (
    id text NOT NULL,
    "supplierId" text NOT NULL,
    reference text NOT NULL,
    "startsOn" timestamp(3) with time zone NOT NULL,
    "endsOn" timestamp(3) with time zone,
    "noticePeriodDays" integer DEFAULT 30 NOT NULL,
    "agreedAmountPence" integer,
    notes text,
    CONSTRAINT contract_dates_ordered CHECK ((("endsOn" IS NULL) OR ("endsOn" > "startsOn")))
);


--
-- Name: Suspension; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Suspension" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "startsOn" timestamp(3) with time zone NOT NULL,
    "endsOn" timestamp(3) with time zone,
    reason text NOT NULL,
    paid boolean DEFAULT true NOT NULL,
    "decidedByUserId" text,
    "liftedOn" timestamp(3) with time zone,
    CONSTRAINT suspension_dates_ordered CHECK ((("endsOn" IS NULL) OR ("endsOn" >= "startsOn")))
);


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "personId" text NOT NULL,
    "ssoSubject" text,
    "displayName" text NOT NULL,
    "ownScreeningComplete" boolean DEFAULT false NOT NULL,
    "confidentialityAgreementOnFile" boolean DEFAULT false NOT NULL,
    "trainingReviewedAt" timestamp(3) with time zone,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: UserRole; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserRole" (
    id text NOT NULL,
    "userId" text NOT NULL,
    role public."Role" NOT NULL,
    "grantedAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "grantedById" text NOT NULL,
    "grantBasis" text,
    "revokedAt" timestamp(3) with time zone
);


--
-- Name: Voucher; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Voucher" (
    id text NOT NULL,
    reference text NOT NULL,
    "personId" text,
    "valuePence" integer NOT NULL,
    purpose text NOT NULL,
    "issuedOn" timestamp(3) with time zone NOT NULL,
    "expiresOn" timestamp(3) with time zone NOT NULL,
    state public."VoucherState" DEFAULT 'issued'::public."VoucherState" NOT NULL,
    "redeemedOn" timestamp(3) with time zone,
    CONSTRAINT voucher_expiry_after_issue CHECK (("expiresOn" > "issuedOn")),
    CONSTRAINT voucher_redeemed_has_date CHECK (((state <> 'redeemed'::public."VoucherState") OR ("redeemedOn" IS NOT NULL))),
    CONSTRAINT voucher_value_positive CHECK (("valuePence" > 0))
);


--
-- Name: WorkItem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WorkItem" (
    id text NOT NULL,
    "definitionId" text,
    title text NOT NULL,
    state public."WorkItemState" DEFAULT 'open'::public."WorkItemState" NOT NULL,
    "personId" text,
    "screeningFileId" text,
    "requirementId" text,
    "assignmentId" text,
    "documentId" text,
    "formResponseId" text,
    "ownerUserId" text,
    "ownerRole" public."Role",
    "dueAt" timestamp(3) with time zone NOT NULL,
    "slaDays" integer NOT NULL,
    "createdAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "doneAt" timestamp(3) with time zone,
    "blockedReason" text,
    "escalatedAt" timestamp(3) with time zone,
    "adminItemId" text,
    CONSTRAINT work_item_one_subject CHECK ((num_nonnulls("personId", "screeningFileId", "requirementId", "assignmentId", "documentId", "formResponseId", "adminItemId") = 1))
);


--
-- Name: WorkItemDefinition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WorkItemDefinition" (
    id text NOT NULL,
    title text NOT NULL,
    department public."Department" NOT NULL,
    recurrence public."Recurrence" DEFAULT 'none'::public."Recurrence" NOT NULL,
    "slaDays" integer DEFAULT 3 NOT NULL,
    "ownerRole" public."Role" NOT NULL,
    "escalatesTo" public."Role" NOT NULL,
    active boolean DEFAULT true NOT NULL
);


--
-- Name: WorkSession; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WorkSession" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "activeRole" public."Role" NOT NULL,
    "signedInAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastSeenAt" timestamp(3) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "signedOutAt" timestamp(3) with time zone
);


--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


--
-- Data for Name: Accreditation; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Accreditation" (id, name, body, scope, "certificateNumber", "firstAwardedOn", "expiresOn", "nextAuditOn", state, "ownerRole") FROM stdin;
acc-acs	SIA Approved Contractor Scheme	Security Industry Authority	Security guarding and key holding	ACS-114872	2023-06-11 05:43:36.806+00	2026-12-07 05:43:36.806+00	2026-11-02 05:43:36.806+00	held	top_management
acc-9001	ISO 9001:2015	BSI	Provision of manned guarding services	FS-662104	2024-04-06 05:43:36.806+00	2027-04-21 05:43:36.806+00	2027-01-21 05:43:36.806+00	held	admin_manager
acc-safecontractor	SafeContractor	Alcumus	Health and safety competence	SC-77219	2024-09-13 05:43:36.806+00	2026-10-15 05:43:36.806+00	\N	held	admin_manager
\.


--
-- Data for Name: AccreditationRequirement; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AccreditationRequirement" (id, "accreditationId", clause, label, source, "derivedFrom", "documentId", "satisfiedAt", "satisfiedByUserId", note) FROM stdin;
cmudogep5009d7ddcthjysjwa	acc-acs	3.1	Screening to BS 7858 for all operational staff	derived_screening	ScreeningFile where status = full_screening_complete, all deployed officers	\N	\N	\N	\N
cmudogep5009e7ddcrt0yuf2u	acc-acs	3.2	Licence checks current for all licensable staff	derived_screening	Licence where kind = sia and expiresOn > today	\N	\N	\N	\N
cmudogep5009f7ddcks42gju2	acc-acs	5.4	Site inspections carried out to programme	derived_quality	Inspection forms in the last 12 months, per site	\N	\N	\N	\N
cmudogep5009g7ddc95zfkjnk	acc-acs	6.2	Staff training records current	derived_training	User.trainingReviewedAt within 12 months for screening roles	\N	\N	\N	\N
cmudogep5009h7ddcsclgx2ha	acc-acs	7.1	Current insurance certificate	manual	\N	\N	2026-08-24 05:43:36.808+00	u9	Employer's and public liability, renewed in August.
cmudogep5009i7ddce7tiy82s	acc-acs	8.3	Written complaints procedure, reviewed annually	manual	\N	\N	\N	\N	\N
cmudogep5009j7ddc8hhjocvd	acc-9001	7.2	Competence records for all staff	derived_training	User.trainingReviewedAt, all active users	\N	\N	\N	\N
cmudogep5009k7ddcotnqxk8y	acc-9001	9.1	Client satisfaction monitoring	derived_quality	Client feedback form responses, last 12 months	\N	\N	\N	\N
cmudogep5009l7ddccwg7xpn0	acc-9001	10.2	Corrective actions closed out	derived_quality	Corrective-action work items, state = done	\N	\N	\N	\N
cmudogep5009m7ddck5szpo6e	acc-9001	6.1	Risk register reviewed	manual	\N	\N	2026-07-25 05:43:36.808+00	u9	\N
cmudogep5009n7ddc5n5ws4na	acc-safecontractor	\N	Health and safety policy signed by a director	manual	\N	\N	2026-03-07 05:43:36.808+00	u5	\N
cmudogep5009o7ddceqfii80o	acc-safecontractor	\N	Accident and near-miss records	derived_quality	Incident records, last 12 months	\N	\N	\N	\N
cmudogep5009p7ddc8o3uwohn	acc-safecontractor	\N	Risk assessments for each site	manual	\N	\N	\N	\N	\N
cmudogep5009q7ddcqxwui479	acc-safecontractor	\N	Training records for manual handling and lone working	derived_training	Training records by course, all deployed officers	\N	\N	\N	\N
\.


--
-- Data for Name: AccreditationSubmission; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AccreditationSubmission" (id, "accreditationId", "submittedOn", "submittedByUserId", outcome, "newExpiresOn") FROM stdin;
cmudogep8009r7ddc1sg05m1j	acc-9001	2026-09-13 05:43:36.811+00	u9	Surveillance audit booked	\N
cmudogep8009s7ddcrnk2ba0a	acc-acs	2025-08-19 05:43:36.811+00	u5	Renewed	2026-12-07 05:43:36.811+00
\.


--
-- Data for Name: AdminApproval; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AdminApproval" (id, "itemId", step, "requiredRoles", reason, decision, "decidedByUserId", "decidedByRole", "decidedAt", grounds, "amountApprovedPence") FROM stdin;
cmudogeq8009x7ddcpaoe02tu	cmudogeq8009w7ddcaizkomnp	1	{admin_manager}	£189 is at or under £250, so the Admin Manager decides alone.	\N	\N	\N	\N	\N	\N
cmudogeqk00a47ddcrtebl0qf	cmudogeqk00a37ddchrgifgw0	1	{admin_manager}	£127 is at or under £250, so the Admin Manager decides alone.	approved	u10	finance_officer	2026-09-04 05:43:36.859+00	Standing charge increase confirmed against the meter reading.	12700
cmudogequ00ac7ddcbep7hl4s	cmudogeqt00aa7ddc0ly380a4	2	{top_management}	Over the high threshold a second, different approver from higher management is required. The Finance Officer cannot be both.	\N	\N	\N	\N	\N	\N
cmudogequ00ab7ddco9kv01dv	cmudogeqt00aa7ddc0ly380a4	1	{finance_officer}	£2,480 is over £2,000, so the Finance Officer approves first.	approved	u10	finance_officer	2026-09-21 05:43:36.869+00	Within the annual uniform budget; three sizes are at reorder.	248000
cmudoger200ai7ddcyownc0kb	cmudoger200ah7ddcbsga11ny	1	{admin_manager}	£120 is at or under £250, so the Admin Manager decides alone.	\N	\N	\N	\N	\N	\N
cmudoger200aj7ddc4lfrivs7	cmudoger200ah7ddcbsga11ny	2	{recruitment_manager}	A decision affecting a member of staff is approved by the HR Manager.	\N	\N	\N	\N	\N	\N
cmudoger200ak7ddcwly877xk	cmudoger200ah7ddcbsga11ny	3	{top_management}	A decision affecting a member of staff also takes higher management.	\N	\N	\N	\N	\N	\N
cmudogeru00bd7ddcwy1k71ho	cmudogeru00bc7ddcxcdowso3	1	{recruitment_manager,top_management}	Correspondence leaving the company to an external authority is signed off by the HR Manager or higher management.	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: AdminItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AdminItem" (id, reference, track, category, kind, title, detail, priority, state, "amountPence", "aboutPersonId", "supplierId", "recurringPaymentId", "assetId", "holidayRequestId", "penaltyId", "voucherId", "accreditationId", "authorityMatterId", "stockItemId", "requestedByUserId", "assignedToUserId", "assignedToRole", "raisedAt", "dueAt", "startedAt", "reviewedAt", "decidedAt", "completedAt", "cancelledAt", "escalatedStage") FROM stdin;
cmudogeq8009w7ddcaizkomnp	ADM-0001	request	premises	purchase	Replace the kitchen water boiler	Element has failed. A like-for-like replacement is £189 fitted.	P3	reviewed	18900	\N	\N	\N	as-kettle	\N	\N	\N	\N	\N	\N	u8	u8	\N	2026-09-20 05:43:36.817+00	2026-09-23 05:43:36.817+00	\N	2026-09-20 05:43:36.817+00	\N	\N	\N	0
cmudogeqk00a37ddchrgifgw0	ADM-0002	request	payments	payment	Variance on Electricity and gas	Paid £512.00 against an agreed £385.00.	P2	approved	12700	\N	\N	rp-power	\N	\N	\N	\N	\N	\N	\N	u8	\N	\N	2026-09-04 05:43:36.859+00	2026-09-05 05:43:36.859+00	\N	2026-09-04 05:43:36.859+00	\N	\N	\N	0
cmudogeqt00aa7ddc0ly380a4	ADM-0003	request	uniform	purchase	Uniform order — trousers and shirts	Three sizes at or below their reorder level.	P3	reviewed	248000	\N	\N	\N	\N	\N	\N	\N	\N	\N	st-tr-36	u8	u9	\N	2026-09-21 05:43:36.869+00	2026-09-24 05:43:36.869+00	\N	2026-09-21 05:43:36.869+00	\N	\N	\N	0
cmudoger200ah7ddcbsga11ny	ADM-0004	request	decisions	penalty	Recharge for a parking penalty in a company vehicle	\N	P3	reviewed	12000	hr1	\N	\N	\N	\N	\N	\N	\N	\N	\N	u9	\N	\N	2026-09-20 05:43:36.877+00	2026-09-23 05:43:36.877+00	\N	2026-09-20 05:43:36.877+00	\N	\N	\N	0
cmudoger800aq7ddcwvfatgkw	ADM-0005	task	accreditations	\N	Gather the outstanding SafeContractor evidence	Site risk assessments are the only manual requirement still open, and it expires in three weeks.	P1	in_progress	\N	\N	\N	\N	\N	\N	\N	\N	acc-safecontractor	\N	\N	u9	u8	\N	2026-09-22 05:43:36.883+00	2026-09-22 09:43:36.883+00	2026-09-23 05:43:36.883+00	\N	\N	\N	\N	0
cmudogerd00aw7ddcxcl0f0n3	ADM-0006	task	premises	\N	Book the boiler's annual gas safety service	Overdue. Kestrel Facilities hold the contract.	P2	assigned	\N	\N	\N	\N	as-boiler	\N	\N	\N	\N	\N	\N	u8	u8	\N	2026-09-19 05:43:36.889+00	2026-09-20 05:43:36.889+00	\N	\N	\N	\N	\N	0
cmudogerk00b27ddcj6n87q9m	ADM-0007	task	payments	\N	Give notice on Lines and broadband, or renegotiate	The notice window closes in five days; after that it rolls on for another year.	P2	raised	\N	\N	sup-telecoms	\N	\N	\N	\N	\N	\N	\N	\N	u9	\N	\N	2026-09-17 05:43:36.895+00	2026-09-18 05:43:36.895+00	\N	\N	\N	\N	\N	0
cmudogerp00b77ddcmy73a0c7	ADM-0008	task	uniform	\N	Chase outstanding kit from September leavers	\N	P3	completed	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	u9	u8	\N	2026-09-12 05:43:36.9+00	2026-09-15 05:43:36.9+00	\N	2026-09-12 05:43:36.9+00	\N	2026-09-22 05:43:36.9+00	\N	0
cmudogeru00bc7ddcxcdowso3	ADM-0009	request	people_admin	authority_response	Response to the DWP earnings enquiry	Six months of earnings and hours. Goes out under the HR Manager's signature.	P2	reviewed	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	u8	u8	\N	2026-09-15 05:43:36.905+00	2026-09-16 05:43:36.905+00	\N	2026-09-15 05:43:36.905+00	\N	\N	\N	0
\.


--
-- Data for Name: Asset; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Asset" (id, tag, label, category, location, "supplierId", "purchasedOn", "purchaseCostPence", "warrantyEndsOn", "serviceIntervalMonths", "lastServicedOn", "nextServiceOn", condition) FROM stdin;
as-boiler	AST-001	Gas boiler	heating	Plant room	sup-facilities	2024-04-06 05:43:36.775+00	245000	\N	12	2025-09-08 05:43:36.775+00	2026-09-08 05:43:36.775+00	needs_attention
as-alarm	AST-002	Intruder alarm panel	security	Reception	\N	2024-10-23 05:43:36.775+00	89000	\N	6	2026-04-06 05:43:36.775+00	2026-10-04 05:43:36.775+00	in_service
as-printer	AST-003	Multifunction printer	office	Admin office	\N	2025-11-27 05:43:36.775+00	62000	2027-11-27 05:43:36.775+00	12	\N	2026-11-27 05:43:36.775+00	in_service
as-kettle	AST-004	Water boiler	kitchen	Kitchen	\N	2026-05-26 05:43:36.775+00	18000	\N	\N	\N	\N	out_of_service
as-server	AST-005	Control room UPS	it	Control room	\N	2025-05-11 05:43:36.775+00	134000	\N	12	2026-03-07 05:43:36.775+00	2027-03-07 05:43:36.775+00	in_service
\.


--
-- Data for Name: Assignment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Assignment" (id, "personId", "postId", "startsAt", "endsAt", state, "publishedAt", "publishedById", "publishCheckNote") FROM stdin;
a1	p20	post1	2026-09-23 00:43:34.997+00	2026-09-23 12:43:34.997+00	published	2026-09-17 05:43:34.997+00	u6	\N
a2	p22	post4	2026-09-23 02:43:34.997+00	2026-09-23 14:43:34.997+00	published	2026-09-17 05:43:34.997+00	u6	\N
a3	p1	post8	2026-09-22 22:43:34.997+00	2026-09-23 10:43:34.997+00	amended	2026-09-17 05:43:34.997+00	u6	\N
a4	p21	post6	2026-09-23 02:43:34.997+00	2026-09-23 14:43:34.997+00	published	2026-09-18 05:43:34.997+00	u6	\N
a5	p2	post7	2026-09-23 05:21:34.997+00	2026-09-23 17:13:34.997+00	published	2026-09-18 05:43:34.997+00	u6	\N
a6	p3	post3	2026-09-23 04:58:34.997+00	2026-09-23 16:43:34.997+00	published	2026-09-18 05:43:34.997+00	u6	\N
a7	p4	post5	2026-09-23 03:43:34.997+00	2026-09-23 13:43:34.997+00	published	2026-09-19 05:43:34.997+00	u6	\N
a8	p5	post2	2026-09-22 20:43:34.997+00	2026-09-23 06:43:34.997+00	published	2026-09-19 05:43:34.997+00	u6	\N
a9	p7	post6	2026-09-23 11:43:34.997+00	2026-09-23 23:43:34.997+00	published	2026-09-20 05:43:34.997+00	u6	\N
a10	p6	post9	2026-09-23 01:43:34.997+00	2026-09-23 13:43:34.997+00	amended	2026-09-20 05:43:34.997+00	u6	\N
a11	p20	post1	2026-09-24 00:43:34.997+00	2026-09-24 12:43:34.997+00	published	2026-09-21 05:43:34.997+00	u6	\N
a12	p22	post4	2026-09-24 02:43:34.997+00	2026-09-24 14:43:34.997+00	draft	\N	\N	\N
a13	p21	post6	2026-09-25 00:43:34.997+00	2026-09-25 12:43:34.997+00	draft	\N	\N	\N
a14	p8	post7	2026-09-25 07:43:34.997+00	2026-09-25 19:43:34.997+00	draft	\N	\N	\N
a15	p5	post2	2026-09-23 20:43:34.997+00	2026-09-24 06:43:34.997+00	published	2026-09-21 05:43:34.997+00	u6	\N
a16	p4	post5	2026-09-24 17:43:34.997+00	2026-09-25 03:43:34.997+00	published	2026-09-21 05:43:34.997+00	u6	\N
\.


--
-- Data for Name: AssignmentAmendment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AssignmentAmendment" (id, "assignmentId", at, "byUserId", change, reason, "previousPersonId", "previousStartsAt", "previousEndsAt") FROM stdin;
cmudogemi007i7ddc5gti1vl6	a3	2026-09-22 05:43:34.997+00	u6	Officer changed from Elena Petrova to Adebayo Fashola	Elena moved to cover the relief post at short notice	p6	\N	\N
cmudogemw007j7ddcea14mn0h	a10	2026-09-22 05:43:34.997+00	u6	Moved from the manufacturing gate to the relief post	Cover swap with Adebayo Fashola	\N	\N	\N
\.


--
-- Data for Name: AuthorityMatter; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."AuthorityMatter" (id, reference, body, "matterType", "personId", "receivedOn", "dueOn", state, summary, "respondedOn", "closedOn") FROM stdin;
cmudogeol008k7ddct005ka7y	AUT-0001	dwp	Earnings enquiry	hr1	2026-09-14 05:43:36.789+00	2026-09-28 05:43:36.789+00	open	Written request for earnings and hours over the last six months. Response goes out under the HR Manager's signature.	\N	\N
cmudogeol008l7ddcvn7hzpok	AUT-0002	hmrc	PAYE coding query	\N	2026-08-24 05:43:36.789+00	2026-09-21 05:43:36.789+00	awaiting_response	Coding notice query on two employees. Overdue — chased twice.	\N	\N
cmudogeol008m7ddc2vcri5hx	AUT-0003	dwp	Benefit verification	\N	2026-06-25 05:43:36.789+00	\N	closed	Verification of employment dates. Answered and closed.	2026-06-30 05:43:36.789+00	2026-07-05 05:43:36.789+00
\.


--
-- Data for Name: BookOff; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."BookOff" (id, "assignmentId", at, channel, "approvedById", "approvedAt") FROM stdin;
\.


--
-- Data for Name: BookOn; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."BookOn" (id, "assignmentId", at, channel, latitude, longitude, "locationVerified", "recordedByUserId") FROM stdin;
cmudogen6007k7ddcw704kepr	a1	2026-09-23 00:43:34.997+00	qr	\N	\N	t	\N
cmudogen6007l7ddc1h7q97ic	a2	2026-09-23 02:55:34.997+00	app	\N	\N	t	\N
cmudogen6007m7ddccloi6kvh	a3	2026-09-22 22:43:34.997+00	site_phone	\N	\N	f	\N
cmudogen6007n7ddc4oy558j9	a7	2026-09-23 03:43:34.997+00	sms	\N	\N	f	\N
cmudogen6007o7ddcorjdqta3	a8	2026-09-22 20:43:34.997+00	phone	\N	\N	f	\N
cmudogen6007p7ddcrykxo40b	a10	2026-09-23 01:43:34.997+00	supervisor	\N	\N	f	\N
cmudogen6007q7ddcw7cj1sxp	a4	2026-09-23 02:33:22.997+00	app	\N	\N	t	\N
\.


--
-- Data for Name: Candidacy; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Candidacy" (id, "personId", "requirementId", stage, "stageSince", source, "ownerUserId", "withdrawnReason") FROM stdin;
cand1	p1	r5	deployed	2026-07-10 05:43:34.99+00	existing_indeed	u1	\N
cand2	p2	r1	deployed	2026-07-16 05:43:34.99+00	previous_enquiry	u1	\N
cand3	p3	r3	deployed	2026-07-30 05:43:34.99+00	new_indeed_ad	u2	\N
cand4	p4	r4	deployed	2026-08-16 05:43:34.99+00	previous_enquiry	u2	\N
cand5	p5	r2	deployed	2026-06-22 05:43:34.99+00	existing_indeed	u2	\N
cand6	p6	r4	deployed	2026-09-07 05:43:34.99+00	new_indeed_ad	u1	\N
cand7	p7	r3	deployed	2026-07-22 05:43:34.99+00	referral	u1	\N
cand8	p8	r2	second_interview	2026-09-17 05:43:34.99+00	existing_indeed	u2	\N
cand9	p9	r5	application_complete	2026-09-20 05:43:34.99+00	new_indeed_ad	u1	\N
cand10	p10	r5	application_received	2026-09-15 05:43:34.99+00	previous_enquiry	u1	\N
cand11	p11	r7	invited	2026-09-12 05:43:34.99+00	new_indeed_ad	u2	\N
cand12	p12	r7	shortlisted	2026-09-21 05:43:34.99+00	existing_indeed	u2	\N
cand13	p13	r1	invited	2026-09-08 05:43:34.99+00	previous_enquiry	u1	\N
cand14	p14	r1	sourcing	2026-09-22 05:43:34.99+00	existing_indeed	u1	\N
cw-pw1	pw1	\N	withdrawn	2025-08-19 05:43:36.7+00	\N	\N	Unsuccessful at preliminary checks
cw-pw2	pw2	\N	withdrawn	2025-09-16 05:43:36.7+00	\N	\N	Unsuccessful at preliminary checks
cw-pw3	pw3	\N	withdrawn	2025-10-08 05:43:36.7+00	\N	\N	Unsuccessful at preliminary checks
\.


--
-- Data for Name: CheckCall; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."CheckCall" (id, "assignmentId", at, channel, "allWell", note, "takenByUserId") FROM stdin;
cc1	a1	2026-09-23 05:23:34.997+00	phone	t	\N	u6
cc2	a1	2026-09-23 04:21:34.997+00	phone	t	\N	u6
cc3	a2	2026-09-23 04:21:34.997+00	app	t	\N	u6
cc4	a3	2026-09-23 03:28:34.997+00	site_phone	t	Quiet. Contractors on site until 1800.	u6
cc5	a7	2026-09-23 05:13:34.997+00	app	t	\N	u6
cc6	a10	2026-09-23 04:41:34.997+00	phone	t	\N	u6
\.


--
-- Data for Name: Client; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Client" (id, name, "screeningPeriodYears", "requiresAdditionalInterview", "regulatedActivity", "contractStart", "contractEnd", active) FROM stdin;
c1	Meridian Logistics	5	f	f	\N	\N	t
c2	Northgate Retail Park	5	f	f	\N	\N	t
c3	Halton Data Centre	5	t	f	\N	\N	t
c4	Riverside Estates	5	f	f	\N	\N	t
c5	Clearwater Pharma	5	t	t	\N	\N	t
\.


--
-- Data for Name: ContactAttempt; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ContactAttempt" (id, "assignmentId", at, "byUserId", channel, reached, note) FROM stdin;
at1	a2	2026-09-23 05:29:34.997+00	u2	phone	f	Mobile rang out twice.
at2	a3	2026-09-23 04:43:34.997+00	u2	phone	f	No answer on the mobile.
at3	a3	2026-09-23 05:03:34.997+00	u2	site_phone	f	Site phone unanswered. No other officer on site to ask.
at4	a1	2026-09-23 01:43:34.997+00	u1	phone	t	Answered — radio had been left in the gatehouse.
\.


--
-- Data for Name: DisposalRecord; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."DisposalRecord" (id, at, rule, "subjectDescription", "personRef", "screeningFileRef", "documentRef", "itemsDestroyed", "retainedInstead", "performedByUserId", "performedBySystem", "verifiedByUserId") FROM stdin;
dl1	2026-09-12 05:43:34.998+00	unsuccessful_applicant_12_months	Screening files, applicants unsuccessful at preliminary checks, Aug 2025	\N	\N	\N	4	Outcome and date only, per the criminality document rule	\N	retention-sweep	u3
dl2	2026-08-16 05:43:34.998+00	after_cessation_7_years	Employment and screening records, leavers ceased Aug 2019	\N	\N	\N	2	\N	\N	retention-sweep	u3
dl3	2026-07-22 05:43:34.998+00	document_type_rule	Criminal record certificates seen at screening, Jun 2026 intake	\N	\N	\N	9	Check outcome and date of issue	u4	\N	\N
\.


--
-- Data for Name: DocumentRecord; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."DocumentRecord" (id, "typeId", "personId", "siteId", "clientId", "screeningFileId", verification, "storageKey", "rejectionReason", "suppliedAt", "verifiedAt", "verifiedById", "expiresAt", "disposedAt") FROM stdin;
doc-sia-p20	sia_licence	p20	\N	\N	\N	verified	s3://leon-docs/doc-sia-p20	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2026-10-17	\N
doc-sia-p21	sia_licence	p21	\N	\N	\N	verified	s3://leon-docs/doc-sia-p21	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2026-11-13	\N
doc-rtw-p21	right_to_work	p21	\N	\N	\N	verified	s3://leon-docs/doc-rtw-p21	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2026-10-31	\N
doc-sia-p22	sia_licence	p22	\N	\N	\N	verified	s3://leon-docs/doc-sia-p22	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2026-12-10	\N
doc-sia-p1	sia_licence	p1	\N	\N	\N	verified	s3://leon-docs/doc-sia-p1	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2027-11-09	\N
doc-sia-p2	sia_licence	p2	\N	\N	\N	verified	s3://leon-docs/doc-sia-p2	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2026-11-20	\N
doc-sia-p3	sia_licence	p3	\N	\N	\N	verified	s3://leon-docs/doc-sia-p3	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2028-08-13	\N
doc-sia-p4	sia_licence	p4	\N	\N	\N	verified	s3://leon-docs/doc-sia-p4	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2027-05-01	\N
doc-sia-p5	sia_licence	p5	\N	\N	\N	verified	s3://leon-docs/doc-sia-p5	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2027-07-30	\N
doc-sia-p6	sia_licence	p6	\N	\N	\N	verified	s3://leon-docs/doc-sia-p6	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2028-02-10	\N
doc-sia-p7	sia_licence	p7	\N	\N	\N	verified	s3://leon-docs/doc-sia-p7	\N	2026-05-26 05:43:34.998+00	2026-05-27 05:43:34.998+00	\N	2027-02-10	\N
doc-t1	training_certificate	p22	\N	\N	\N	expired	s3://leon-docs/doc-t1	\N	2025-08-19 05:43:34.997+00	2025-08-20 05:43:34.997+00	\N	2026-09-14	\N
doc-t2	training_certificate	p20	\N	\N	\N	verified	s3://leon-docs/doc-t2	\N	2025-11-27 05:43:34.997+00	2025-11-28 05:43:34.997+00	\N	2026-11-03	\N
doc-si1	site_instructions	\N	s4	\N	\N	verified	s3://leon-docs/doc-si1	\N	2025-10-28 05:43:34.997+00	2025-10-28 05:43:34.997+00	\N	2026-10-12	\N
doc-si2	site_instructions	\N	s2	\N	\N	expired	s3://leon-docs/doc-si2	\N	2025-08-19 05:43:34.997+00	2025-08-19 05:43:34.997+00	\N	2026-08-27	\N
doc-cc1	client_contract	\N	\N	c3	\N	verified	s3://leon-docs/doc-cc1	\N	2024-10-23 05:43:34.997+00	2024-10-23 05:43:34.997+00	\N	2026-12-10	\N
doc-cc2	client_contract	\N	\N	c5	\N	verified	s3://leon-docs/doc-cc2	\N	2025-05-11 05:43:34.997+00	2025-05-11 05:43:34.997+00	\N	2027-02-10	\N
\.


--
-- Data for Name: DocumentType; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."DocumentType" (id, label, department, expires, "copyRetained", "retentionNote", clause) FROM stdin;
sia_licence	SIA licence	compliance	t	t	Held while employed; disposed 7 years after cessation.	7.4c
right_to_work	Right to work evidence	compliance	t	t	Statutory excuse requires the copy be kept for the employment plus 2 years.	7.4b
visa	Visa / leave to remain	compliance	t	t	As right to work. Expiry blocks assignment publication.	\N
photo_id	Photographic identity	vetting	t	t	Part of the screening file; 7 years after cessation.	7.4a
address_proof	Proof of address	vetting	f	t	Part of the screening file; 7 years after cessation.	7.4a
employment_reference	Employment reference	vetting	f	t	Screening file. Request dates retained as extension evidence.	7.7
gap_evidence	Evidence for a gap over 31 days	vetting	f	t	Screening file; no unverified gap over 31 days may remain.	7.7
statutory_declaration	Statutory declaration	vetting	t	t	Valid for 6 months from swearing.	7.7i
criminal_record_outcome	Criminality check outcome	vetting	f	f	Outcome and date only. The certificate is seen, recorded, and not copied.	7.7j
welcome_pack	Signed welcome pack	recruitment	f	t	Employment record; 7 years after cessation.	\N
training_certificate	Training certificate	compliance	t	t	Held while valid. Expiry drives a renewal task, not a block.	6.2
site_instructions	Site assignment instructions	operations	t	t	Current version held against the site; reviewed annually.	\N
client_contract	Client contract	account_management	t	t	Held for the contract term plus 7 years. Sets the screening period.	\N
inspection_report	Site inspection report	quality	f	t	Held 3 years; evidence for ACS assessment.	\N
\.


--
-- Data for Name: Employment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Employment" (id, "personId", state, pin, "controlTeam", "startedAt", "confirmedAt", "endedAt", "leaverReason") FROM stdin;
o1	p20	confirmed	3312	alpha	2025-08-19	\N	\N	\N
o2	p21	confirmed	3318	bravo	2025-08-19	\N	\N	\N
o3	p22	confirmed	3325	alpha	2025-08-19	\N	\N	\N
o4	p1	conditional	4417	alpha	2025-08-19	\N	\N	\N
o5	p2	conditional	4418	alpha	2025-08-19	\N	\N	\N
cmudogem7007g7ddc7umgoi5o	pl1	ended	2201	\N	2017-03-24	\N	2019-09-10 05:43:36.702+00	Resigned
cmudogem7007h7ddcvz4x0p9n	pl2	ended	2204	\N	2017-06-02	\N	2019-11-19 05:43:36.702+00	Resigned
\.


--
-- Data for Name: EquipmentIssue; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EquipmentIssue" (id, "itemId", "personId", size, quantity, "issuedAt", "issuedById", "returnedAt", "writtenOffAt") FROM stdin;
\.


--
-- Data for Name: EquipmentItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."EquipmentItem" (id, category, label, returnable) FROM stdin;
eq-trousers	uniform	Cargo trousers	f
eq-shirt	uniform	Long-sleeve shirt	f
eq-coat	uniform	Waterproof coat	t
eq-radio	equipment	Handheld radio	t
eq-boots	ppe	Safety boots	f
\.


--
-- Data for Name: Event; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Event" (id, at, type, "actorUserId", "actorRole", "actorSystem", department, "personId", "assignmentId", "screeningFileId", "requirementId", "documentId", "siteId", detail, payload, "adminItemId") FROM stdin;
cmudogeqg00a17ddclxqbi999	2026-09-20 05:43:36.817+00	admin_request.raised	u8	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0001: Replace the kitchen water boiler.	\N	cmudogeq8009w7ddcaizkomnp
cmudogeqr00a87ddcmu90nudf	2026-09-04 05:43:36.859+00	admin_request.raised	u8	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0002: Variance on Electricity and gas.	\N	cmudogeqk00a37ddchrgifgw0
cmudoger000ag7ddcf8tsmcff	2026-09-21 05:43:36.869+00	admin_request.raised	u8	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0003: Uniform order — trousers and shirts.	\N	cmudogeqt00aa7ddc0ly380a4
cmudoger600ao7ddcse1rdgd9	2026-09-20 05:43:36.877+00	admin_request.raised	u9	admin_officer	\N	administration	hr1	\N	\N	\N	\N	\N	ADM-0004: Recharge for a parking penalty in a company vehicle.	\N	cmudoger200ah7ddcbsga11ny
cmudogerc00au7ddcw6pefzcc	2026-09-22 05:43:36.883+00	admin_task.raised	u9	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0005: Gather the outstanding SafeContractor evidence.	\N	cmudoger800aq7ddcwvfatgkw
cmudogeri00b07ddcdcrykopn	2026-09-19 05:43:36.889+00	admin_task.raised	u8	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0006: Book the boiler's annual gas safety service.	\N	cmudogerd00aw7ddcxcl0f0n3
cmudogern00b67ddctwurlft7	2026-09-17 05:43:36.895+00	admin_task.raised	u9	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0007: Give notice on Lines and broadband, or renegotiate.	\N	cmudogerk00b27ddcj6n87q9m
cmudogers00bb7ddc6btrsi4c	2026-09-12 05:43:36.9+00	admin_task.raised	u9	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0008: Chase outstanding kit from September leavers.	\N	cmudogerp00b77ddcmy73a0c7
cmudogery00bh7ddcz5dpaucz	2026-09-15 05:43:36.905+00	admin_request.raised	u8	admin_officer	\N	administration	\N	\N	\N	\N	\N	\N	ADM-0009: Response to the DWP earnings enquiry.	\N	cmudogeru00bc7ddcxcdowso3
e1	2026-09-23 05:35:34.998+00	check_call.recorded	u2	recruitment	\N	control	\N	a1	\N	\N	\N	\N	All well. Depot 4 night gatehouse.	\N	\N
e2	2026-09-23 05:21:34.998+00	book_on.missed	\N	\N	System	control	\N	a5	\N	\N	\N	\N	Book-on not received within the grace period at Block A concierge.	\N	\N
e3	2026-09-23 05:03:34.998+00	incident.reported	\N	\N	Liam Corrigan	operations	\N	a2	\N	\N	\N	\N	Shoplifting detained and handed to police. Client notification outstanding.	\N	\N
e4	2026-09-23 04:58:34.998+00	book_on.no_show	\N	\N	System	control	\N	a6	\N	\N	\N	\N	No show at Depot 7 gatehouse. Escalated to Control Alpha.	\N	\N
e5	2026-09-23 02:43:34.998+00	document.expired	\N	\N	System	compliance	\N	\N	\N	\N	\N	\N	Training certificate expired 9 days ago. Renewal task raised.	\N	\N
e6	2026-09-23 00:43:34.998+00	assignment.amended	u2	recruitment	\N	control	\N	a3	\N	\N	\N	\N	Officer changed from Elena Petrova to Adebayo Fashola.	\N	\N
e7	2026-09-22 22:43:34.998+00	screening.check_verified	u4	vetting_admin	\N	vetting	\N	\N	\N	\N	\N	\N	Employment reference verified — Brightwater Security.	\N	\N
e8	2026-09-22 20:43:34.998+00	gate.passed	u3	vetting_admin	\N	vetting	\N	\N	\N	\N	\N	\N	Deployment gate cleared. Criminality and right to work complete.	\N	\N
e9	2026-09-22 18:43:34.998+00	interview.held	u5	top_management	\N	recruitment	\N	\N	\N	\N	\N	\N	Second interview held. Outcome: progress.	\N	\N
e11	2026-09-23 05:31:34.998+00	check_call.escalated	u2	recruitment	\N	control	\N	a3	\N	\N	\N	\N	No check call for 2 hours. Mobile and site phone tried. Escalated to step 3 — operational team attending site.	\N	\N
e10	2026-09-22 03:43:34.998+00	requirement.released	u2	recruitment	\N	control	\N	\N	\N	\N	\N	\N	Released to sourcing after the pool check found no internal cover.	\N	\N
\.


--
-- Data for Name: FormAnswer; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FormAnswer" (id, "responseId", "fieldId", "valueText", "valueNumber", "valueBool", "valueDate", "documentId") FROM stdin;
\.


--
-- Data for Name: FormDefinition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FormDefinition" (id, key, version, title, purpose, department, "filledBy", trigger, active) FROM stdin;
application	application	3	Application form	Everything clause 7.3.2 requires, plus the declared history that the document checklist is derived from.	recruitment	candidate	Sent when a candidate is invited to apply.	t
welcome_pack	welcome_pack	2	Welcome pack	Contract, handbook and policy acknowledgements. Signed on the day or the next day.	recruitment	candidate	Issued on conditional offer.	t
uniform	uniform	1	Uniform measurements	Sizes, so the right kit is issued once rather than exchanged twice.	administration	staff	Part of onboarding.	t
site_inspection	site_inspection	4	Site inspection	The operational quality check. Failures raise corrective actions automatically.	quality	supervisor	Scheduled per site, per the client's contracted frequency.	t
welfare_check	welfare_check	1	Welfare check	A lone-working officer confirming they are safe. Distinct from a check call: the check call proves presence, this asks after the person.	control	officer	On a timer during lone-working shifts, and after any incident.	t
incident_report	incident_report	2	Incident report	What happened, when, who was told. The record a client and an insurer both ask for.	operations	officer	Raised by the officer or by Control.	t
client_satisfaction	client_satisfaction	1	Client satisfaction review	Typed scores, so satisfaction trends without anyone compiling it by hand.	account_management	client	Quarterly per client, and after any serious incident.	t
exit_interview	exit_interview	1	Exit interview	Why officers leave, in typed categories, so retention is measurable.	administration	staff	On notice being given.	t
\.


--
-- Data for Name: FormField; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FormField" (id, "definitionId", key, label, kind, required, "position", "feedsKpi", choices) FROM stdin;
cmudogeip00007ddcajocxcv0	application	identity	Full name, previous names, date of birth	text	t	0	\N	\N
cmudogeip00017ddcipvsc138	application	addresses	Address history for the screening period	text	t	1	\N	\N
cmudogeip00027ddcs0dc94qk	application	employment	Employment and education history, with dates	text	t	2	\N	\N
cmudogeip00037ddcb7gorfr7	application	gaps	Explanation for any gap over 31 days	text	f	3	\N	\N
cmudogeip00047ddc0e5vs20i	application	sia	SIA licence number	text	f	4	\N	\N
cmudogeip00057ddc8r2f55vj	application	consent	Consent to screening	signature	t	5	\N	\N
cmudogeip00067ddclwbc2fmn	application	declaration	Declaration of convictions	boolean	t	6	\N	\N
cmudogeiv00077ddce9o99jaa	welcome_pack	contract	Contract of employment	signature	t	0	\N	\N
cmudogeiv00087ddcdn2yz5mx	welcome_pack	conditional	Acknowledgement that confirmation depends on screening	signature	t	1	\N	\N
cmudogeiv00097ddccjm2a7w4	welcome_pack	handbook	Handbook received	boolean	t	2	\N	\N
cmudogeiv000a7ddcmrc3jbu4	welcome_pack	bank	Bank details	text	t	3	\N	\N
cmudogeiv000b7ddc4epin7v3	welcome_pack	nok	Next of kin	text	t	4	\N	\N
cmudogeiy000c7ddc5dkkqg5r	uniform	shirt	Shirt / blouse	choice	t	0	\N	\N
cmudogeiy000d7ddcdw9mbliz	uniform	trouser	Trousers	choice	t	1	\N	\N
cmudogeiy000e7ddchunpxav9	uniform	jacket	Jacket	choice	t	2	\N	\N
cmudogeiy000f7ddcw5id8a8q	uniform	boots	Footwear	choice	t	3	\N	\N
cmudogeiy000g7ddcpn8x79ub	uniform	issued	Items issued	text	f	4	\N	\N
cmudogej0000h7ddc5s94naqm	site_inspection	appearance	Officer appearance and uniform	boolean	t	0	inspection_pass_rate	\N
cmudogej0000i7ddcskxyepz7	site_inspection	knowledge	Site knowledge and assignment instructions	boolean	t	1	inspection_pass_rate	\N
cmudogej0000j7ddc89ouaity	site_inspection	occurrence	Occurrence book up to date	boolean	t	2	inspection_pass_rate	\N
cmudogej0000k7ddc73o6swsq	site_inspection	equipment	Equipment present and working	boolean	t	3	\N	\N
cmudogej0000l7ddc6s5s7v7u	site_inspection	score	Overall score	score	t	4	inspection_score	\N
cmudogej0000m7ddcf27fg3sb	site_inspection	photos	Photographs	photo	f	5	\N	\N
cmudogej0000n7ddcxpc0ajxj	site_inspection	actions	Corrective actions required	text	f	6	\N	\N
cmudogej2000o7ddc4rd4jhf0	welfare_check	safe	Are you safe and well?	boolean	t	0	welfare_response_rate	\N
cmudogej2000p7ddcvdj43ico	welfare_check	concerns	Anything you need?	text	f	1	\N	\N
cmudogej4000q7ddcpbmv5xo4	incident_report	when	Date and time	date	t	0	\N	\N
cmudogej4000r7ddc6tjll8hq	incident_report	severity	Severity	choice	t	1	incidents_by_severity	\N
cmudogej4000s7ddcb6w3arf8	incident_report	account	Account of the incident	text	t	2	\N	\N
cmudogej4000t7ddcno1doiza	incident_report	photos	Photographs	photo	f	3	\N	\N
cmudogej4000u7ddchyq9r962	incident_report	client_notified	Client notified	boolean	t	4	client_notification_rate	\N
cmudogej7000v7ddclac4b6ss	client_satisfaction	officers	Quality of officers	score	t	0	csat_officers	\N
cmudogej7000w7ddcn0o6hxfp	client_satisfaction	response	Responsiveness of Control	score	t	1	csat_response	\N
cmudogej7000x7ddchjdwruem	client_satisfaction	admin	Administration and reporting	score	t	2	csat_admin	\N
cmudogej7000y7ddcscsnhhso	client_satisfaction	recommend	Would you recommend us?	score	t	3	nps	\N
cmudogej7000z7ddcv3bwxo8a	client_satisfaction	comments	Comments	text	f	4	\N	\N
cmudogej900107ddcmchoxhyh	exit_interview	reason	Primary reason for leaving	choice	t	0	leaver_reasons	\N
cmudogej900117ddc9rvsjwts	exit_interview	would_return	Would consider returning	boolean	t	1	\N	\N
cmudogej900127ddche28oehf	exit_interview	kit_returned	Uniform and equipment returned	boolean	t	2	\N	\N
\.


--
-- Data for Name: FormResponse; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."FormResponse" (id, "definitionId", "definitionVersion", "personId", "assignmentId", "siteId", "clientId", "submittedById", "submittedAt", "completedAt") FROM stdin;
\.


--
-- Data for Name: HolidayEntitlement; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."HolidayEntitlement" (id, "personId", "leaveYearStart", "leaveYearEnd", "entitlementHours", "carriedOverHours", basis) FROM stdin;
hol-ent-0	hr6	2026-01-01 00:00:00+00	2026-12-31 00:00:00+00	224	16	Statutory, plus 16 hours carried over with approval
hol-ent-1	hr7	2026-01-01 00:00:00+00	2026-12-31 00:00:00+00	224	0	Statutory 28 days at 8 hours
hol-ent-2	hr1	2026-01-01 00:00:00+00	2026-12-31 00:00:00+00	224	0	Statutory 28 days at 8 hours
hol-ent-3	hr2	2026-01-01 00:00:00+00	2026-12-31 00:00:00+00	224	0	Statutory 28 days at 8 hours
hol-ent-4	hr3	2026-01-01 00:00:00+00	2026-12-31 00:00:00+00	224	0	Statutory 28 days at 8 hours
\.


--
-- Data for Name: HolidayRequest; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."HolidayRequest" (id, "personId", "entitlementId", "startsOn", "endsOn", "hoursRequested", decision, "raisedAt", "decidedAt", "decidedByUserId", note, "shiftsAffected") FROM stdin;
cmudogeoh008g7ddc9yo0qblu	hr6	hol-ent-0	2026-10-23 05:43:36.784+00	2026-10-30 05:43:36.784+00	48	pending	2026-09-15 05:43:36.784+00	\N	\N	\N	\N
cmudogeoh008h7ddcnd9k2vry	hr6	hol-ent-0	2026-07-25 05:43:36.784+00	2026-08-01 05:43:36.784+00	40	approved	2026-07-05 05:43:36.784+00	2026-07-07 05:43:36.784+00	u9	No rostered shifts in that window.	0
cmudogeoj008j7ddczt1abum1	hr7	hol-ent-1	2026-10-05 05:43:36.787+00	2026-10-09 05:43:36.787+00	32	pending	2026-09-21 05:43:36.787+00	\N	\N	\N	\N
\.


--
-- Data for Name: Incident; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Incident" (id, "assignmentId", at, severity, summary, "reportedByUserId", "reportedByPersonId", "clientNotified", "clientNotifiedAt", "reviewedById", "reviewedAt") FROM stdin;
i1	a2	2026-09-23 05:03:34.997+00	notable	Shoplifting detained and handed to police at the concourse entrance.	\N	\N	f	\N	\N	\N
i2	a8	2026-09-22 23:43:34.997+00	log_only	Delivery vehicle refused entry — no booking reference.	\N	\N	t	2026-09-22 23:43:34.997+00	\N	\N
\.


--
-- Data for Name: Interview; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Interview" (id, "candidacyId", stage, "interviewerUserId", "heldAt", outcome, notes) FROM stdin;
i1	cand1	first	u1	2026-06-03 05:43:34.99+00	progress	Telephone. Strong site experience, available for nights.
i2	cand1	second	u5	2026-06-07 05:43:34.99+00	progress	On site. Approved for conditional offer.
i3	cand2	first	u2	2026-07-05 05:43:34.99+00	progress	Telephone.
i4	cand2	second	u5	2026-07-09 05:43:34.99+00	progress	Video. Approved for conditional offer.
i5	cand3	first	u2	2026-07-19 05:43:34.99+00	progress	Telephone. Retail background, weekends suit.
i6	cand3	second	u5	2026-07-23 05:43:34.99+00	progress	On site. Financial history to be reviewed at screening.
i7	cand4	first	u1	2026-08-05 05:43:34.99+00	progress	Telephone.
i8	cand4	second	u5	2026-08-09 05:43:34.99+00	progress	Video. Approved for conditional offer.
i9	cand5	first	u2	2026-06-09 05:43:34.99+00	progress	Telephone.
i10	cand5	second	u5	2026-06-13 05:43:34.99+00	progress	On site. Overseas history flagged for screening.
i11	cand5	additional	\N	2026-06-15 05:43:34.99+00	progress	Client-required stage.
i12	cand6	first	u1	2026-08-28 05:43:34.99+00	progress	Telephone. Available immediately.
i13	cand6	second	u5	2026-08-31 05:43:34.99+00	progress	Video. Approved for conditional offer.
i14	cand7	first	u1	2026-07-11 05:43:34.99+00	progress	Telephone.
i15	cand7	second	u5	2026-07-15 05:43:34.99+00	progress	On site. Approved for conditional offer.
i16	cand8	first	u2	2026-09-17 05:43:34.99+00	progress	Telephone. Data centre experience.
\.


--
-- Data for Name: Licence; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Licence" (id, "personId", kind, number, "nameOnBadge", "expiresAt", "lastVerifiedAt", "registerStatus") FROM stdin;
cmudogek200387ddcab0k5juk	p20	sia_security_guarding	1010 1111 2222 3333	Wesley Anand	2026-10-17	2026-09-22 17:43:36.625+00	Active
cmudogek200397ddczewsw5hc	p21	sia_security_guarding	1010 2222 3333 4444	Grace Mbeki	2026-11-13	2026-09-22 17:43:36.625+00	Active
cmudogek2003a7ddc6szf2mgh	p22	sia_security_guarding	1010 3333 4444 5555	Liam Corrigan	2026-12-10	2026-09-22 17:43:36.625+00	Active
cmudogek2003b7ddcy11binmd	p1	sia_security_guarding	1010 2233 4455 6677	Adebayo O Fashola	2027-11-09	2026-09-22 17:43:36.625+00	Active
cmudogek2003c7ddc19d081wn	p2	sia_security_guarding	1010 3344 5566 7788	Marta Kowalczyk	2026-11-20	2026-09-22 17:43:36.625+00	Active
cmudogek2003d7ddcoa7sn8n2	p3	sia_security_guarding	1010 4455 6677 8899	Kieran P Doyle	2028-08-13	2026-09-22 17:43:36.625+00	Active
cmudogek2003e7ddcmsd5vx8s	p4	sia_security_guarding	1010 5566 7788 9900	Shanice Bennett	2027-05-01	2026-09-22 17:43:36.625+00	Active
cmudogek2003f7ddci5ufs7de	p5	sia_security_guarding	1010 6677 8899 0011	Rashid Karim	2027-07-30	2026-09-22 17:43:36.625+00	Active
cmudogek2003g7ddc2e4vdy99	p6	sia_security_guarding	1010 7788 9900 1122	Elena Petrova	2028-02-10	2026-09-22 17:43:36.625+00	Active
cmudogek2003h7ddcd6w2pizo	p7	sia_security_guarding	1010 8899 0011 2233	Callum J Reid	2027-02-10	2026-09-22 17:43:36.625+00	Active
cmudogek2003i7ddc4bi6mpew	p8	sia_security_guarding	1010 9900 1122 3344	Ify Nwachukwu	2026-12-27	2026-09-22 17:43:36.625+00	Active
\.


--
-- Data for Name: MaintenanceJob; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."MaintenanceJob" (id, "assetId", kind, "reportedAt", "reportedByUserId", description, "supplierId", "costPence", "completedAt", outcome) FROM stdin;
cmudogeob008d7ddc30mykzu4	as-boiler	service	2025-09-08 05:43:36.778+00	\N	Annual service and gas safety check	sup-facilities	21000	2025-09-10 05:43:36.778+00	Passed. Flue seal replaced.
cmudogeob008e7ddcgsna5g3g	as-kettle	repair	2026-09-17 05:43:36.778+00	u8	Element failed, no hot water	\N	\N	\N	\N
cmudogeob008f7ddcdeq2k5gp	as-alarm	inspection	2026-04-06 05:43:36.778+00	\N	Six-monthly inspection	\N	\N	2026-04-06 05:43:36.778+00	No faults.
\.


--
-- Data for Name: NoSignalHandover; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."NoSignalHandover" (id, "assignmentId", "notifiedAt", "notifiedByUserId", "notifiedContact", "lossReportedAt", "lossReportedBy", "lossDetail") FROM stdin;
cmudogenk007s7ddcdlt3gkya	a4	2026-09-23 02:39:22.997+00	\N	Site duty manager	\N	\N	\N
\.


--
-- Data for Name: PaymentInstance; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PaymentInstance" (id, "recurringPaymentId", "dueOn", "amountDuePence", "paidOn", "amountPaidPence", reference, "varianceApprovedByUserId", "varianceApprovedAt") FROM stdin;
cmudogeo500867ddcp2nsz2sc	rp-rent	2026-07-23 05:43:36.772+00	180000	2026-07-22 05:43:36.772+00	180000	BACS 8841	\N	\N
cmudogeo500877ddcumjoyank	rp-rent	2026-08-22 05:43:36.772+00	180000	2026-08-21 05:43:36.772+00	180000	BACS 8902	\N	\N
cmudogeo500887ddc4wxs016t	rp-rent	2026-09-29 05:43:36.772+00	180000	\N	\N	\N	\N	\N
cmudogeo500897ddcbvipn5c4	rp-power	2026-09-03 05:43:36.772+00	38500	2026-09-04 05:43:36.772+00	51200	DD Sept	\N	\N
cmudogeo5008a7ddcex8pt4bv	rp-power	2026-10-02 05:43:36.772+00	38500	\N	\N	\N	\N	\N
cmudogeo5008b7ddcyu25ngtn	rp-lines	2026-09-19 05:43:36.772+00	14900	\N	\N	\N	\N	\N
cmudogeo5008c7ddc4cgbq4cc	rp-clean	2026-10-05 05:43:36.772+00	42000	\N	\N	\N	\N	\N
\.


--
-- Data for Name: Penalty; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Penalty" (id, reference, "personId", kind, "amountPence", grounds, state, "raisedAt", "recoveredOn", "writtenOffOn", "writtenOffReason") FROM stdin;
cmudogeop008p7ddcvdq6kdn3	PEN-0001	hr1	recharge	4500	Site key not returned after a shift change; replacement lock barrel.	approved	2026-09-03 05:43:36.793+00	\N	\N	\N
cmudogeop008q7ddcvqikltz8	PEN-0002	hr1	fine	12000	Parking penalty incurred in a company vehicle.	raised	2026-09-20 05:43:36.793+00	\N	\N	\N
cmudogeop008r7ddc633tmarg	PEN-0003	hr1	deduction	2500	Uniform not returned on leaving.	written_off	2026-03-07 05:43:36.793+00	\N	2026-05-26 05:43:36.793+00	Uncollectable — the cost of recovery exceeded the value.
\.


--
-- Data for Name: Person; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Person" (id, lifecycle, "fullName", "previousName", "dateOfBirth", email, phone, "nationalInsurance", "nextOfKinName", "nextOfKinPhone", "payrollRef", "firstContactAt", "createdAt", "updatedAt") FROM stdin;
hr1	confirmed_officer	Priya	\N	1987-04-25	priya@example.com	07700 900100	QQ100000C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr2	confirmed_officer	Joel	\N	1988-05-26	joel@example.com	07700 900101	QQ100007C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr3	confirmed_officer	Marcus	\N	1989-06-27	marcus@example.com	07700 900102	QQ100014C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr4	confirmed_officer	Ruth	\N	1990-07-01	ruth@example.com	07700 900103	QQ100021C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr5	confirmed_officer	Eleanor	\N	1991-08-02	eleanor@example.com	07700 900104	QQ100028C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
ct1	confirmed_officer	Control Alpha desk	\N	1984-01-22	control.alpha.desk@example.com	07700 900105	QQ100035C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
ct2	confirmed_officer	Control Bravo desk	\N	1985-02-23	control.bravo.desk@example.com	07700 900106	QQ100042C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr6	confirmed_officer	Kirsty	\N	1992-09-03	kirsty@example.com	07700 900107	QQ100049C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr7	confirmed_officer	Douglas	\N	1993-10-04	douglas@example.com	07700 900108	QQ100056C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
hr8	confirmed_officer	Vivien	\N	1994-11-05	vivien@example.com	07700 900109	QQ100063C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p20	candidate	Wesley Anand	\N	1986-07-22	wesley.anand@example.com	07700 900110	QQ100070C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p21	candidate	Grace Mbeki	\N	1987-08-23	grace.mbeki@example.com	07700 900111	QQ100077C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p22	candidate	Liam Corrigan	\N	1988-09-24	liam.corrigan@example.com	07700 900112	QQ100084C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p1	candidate	Adebayo O Fashola	\N	1993-06-27	adebayo.o.fashola@example.com	07700 900113	QQ100091C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p2	candidate	Marta Kowalczyk	\N	1994-07-01	marta.kowalczyk@example.com	07700 900114	QQ100098C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p3	candidate	Kieran Doyle	\N	1995-08-02	kieran.doyle@example.com	07700 900115	QQ100105C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p4	candidate	Shanice Bennett	\N	1996-09-03	shanice.bennett@example.com	07700 900116	QQ100112C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p5	candidate	Rashid Karim	\N	1997-10-04	rashid.karim@example.com	07700 900117	QQ100119C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p6	candidate	Elena Petrova	\N	1998-11-05	elena.petrova@example.com	07700 900118	QQ100126C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p7	candidate	Callum Reid	\N	1999-12-06	callum.reid@example.com	07700 900119	QQ100133C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p8	candidate	Ify Nwachukwu	\N	1972-01-07	ify.nwachukwu@example.com	07700 900120	QQ100140C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p9	candidate	Gareth Llewellyn	\N	1973-02-08	gareth.llewellyn@example.com	07700 900121	QQ100147C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p10	candidate	Amara Sesay	\N	1985-06-21	amara.sesay@example.com	07700 900122	QQ100154C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p11	candidate	Viktor Horvat	\N	1986-07-22	viktor.horvat@example.com	07700 900123	QQ100161C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p12	candidate	Joanne Fitzgerald	\N	1987-08-23	joanne.fitzgerald@example.com	07700 900124	QQ100168C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p13	candidate	Dele Ajayi	\N	1988-09-24	dele.ajayi@example.com	07700 900125	QQ100175C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
p14	candidate	Hannah Oyelaran	\N	1989-10-25	hannah.oyelaran@example.com	07700 900126	QQ100182C	\N	\N	\N	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00	2026-09-23 05:43:36.607+00
pw1	leaver	Withdrawn Applicant A	\N	1972-05-11	\N	\N	QQ900000C	\N	\N	\N	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00
pw2	leaver	Withdrawn Applicant B	\N	1973-06-12	\N	\N	QQ900011C	\N	\N	\N	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00
pw3	leaver	Withdrawn Applicant C	\N	1974-07-13	\N	\N	QQ900022C	\N	\N	\N	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00
pl1	leaver	Former Officer A	\N	1989-06-27	\N	\N	QQ900033C	\N	\N	\N	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00
pl2	leaver	Former Officer B	\N	1990-07-01	\N	\N	QQ900044C	\N	\N	\N	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00	2026-09-23 05:43:36.699+00
\.


--
-- Data for Name: PersonIdentityKey; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."PersonIdentityKey" (id, "personId", kind, value) FROM stdin;
cmudogejp001a7ddcxhs4x4pj	hr1	name_and_dob	priya|1987-04-25
cmudogejp001b7ddcn8hpn7uy	hr1	national_insurance	QQ100000C
cmudogejp001c7ddc4iwpohkt	hr2	name_and_dob	joel|1988-05-26
cmudogejp001d7ddczwl1wa3u	hr2	national_insurance	QQ100007C
cmudogejp001e7ddc2nmzrk54	hr3	name_and_dob	marcus|1989-06-27
cmudogejp001f7ddck5xr3v2q	hr3	national_insurance	QQ100014C
cmudogejp001g7ddcl3juc8vs	hr4	name_and_dob	ruth|1990-07-01
cmudogejp001h7ddcdrzhawl5	hr4	national_insurance	QQ100021C
cmudogejp001i7ddcze9mr35e	hr5	name_and_dob	eleanor|1991-08-02
cmudogejp001j7ddcjrppwyob	hr5	national_insurance	QQ100028C
cmudogejp001k7ddcgzsrm3os	ct1	name_and_dob	controlalphadesk|1984-01-22
cmudogejp001l7ddc6igpo6lb	ct1	national_insurance	QQ100035C
cmudogejp001m7ddcv6ulofpv	ct2	name_and_dob	controlbravodesk|1985-02-23
cmudogejp001n7ddcer8prelo	ct2	national_insurance	QQ100042C
cmudogejp001o7ddc3unrk9z4	hr6	name_and_dob	kirsty|1992-09-03
cmudogejp001p7ddcym9hhh0j	hr6	national_insurance	QQ100049C
cmudogejp001q7ddcdjv4y021	hr7	name_and_dob	douglas|1993-10-04
cmudogejp001r7ddcu13h3z14	hr7	national_insurance	QQ100056C
cmudogejp001s7ddcbq39zjwh	hr8	name_and_dob	vivien|1994-11-05
cmudogejp001t7ddcjo5rppqc	hr8	national_insurance	QQ100063C
cmudogejp001u7ddcbxqr23i9	p20	name_and_dob	wesleyanand|1986-07-22
cmudogejp001v7ddcfj4vjo37	p20	national_insurance	QQ100070C
cmudogejp001w7ddcebjqjrza	p21	name_and_dob	gracembeki|1987-08-23
cmudogejp001x7ddc0hl3z932	p21	national_insurance	QQ100077C
cmudogejp001y7ddch1b3fvn2	p22	name_and_dob	liamcorrigan|1988-09-24
cmudogejp001z7ddc1ddnkya2	p22	national_insurance	QQ100084C
cmudogejp00207ddclp8ajx44	p1	name_and_dob	adebayoofashola|1993-06-27
cmudogejp00217ddc5s0e3ldv	p1	national_insurance	QQ100091C
cmudogejp00227ddcmwammx7x	p2	name_and_dob	martakowalczyk|1994-07-01
cmudogejp00237ddc25pe2ts0	p2	national_insurance	QQ100098C
cmudogejp00247ddc3ljit6uq	p3	name_and_dob	kierandoyle|1995-08-02
cmudogejp00257ddc1rt0w14k	p3	national_insurance	QQ100105C
cmudogejp00267ddcowc0fkky	p4	name_and_dob	shanicebennett|1996-09-03
cmudogejp00277ddcd5t4uqrk	p4	national_insurance	QQ100112C
cmudogejp00287ddc2epjkl8u	p5	name_and_dob	rashidkarim|1997-10-04
cmudogejp00297ddc7vjzm04a	p5	national_insurance	QQ100119C
cmudogejp002a7ddc1lyss83q	p6	name_and_dob	elenapetrova|1998-11-05
cmudogejp002b7ddctgrkhhbz	p6	national_insurance	QQ100126C
cmudogejp002c7ddctednsvf0	p7	name_and_dob	callumreid|1999-12-06
cmudogejp002d7ddcywmcme0l	p7	national_insurance	QQ100133C
cmudogejp002e7ddcn50fxd8h	p8	name_and_dob	ifynwachukwu|1972-01-07
cmudogejp002f7ddcu7uq9xx9	p8	national_insurance	QQ100140C
cmudogejp002g7ddchfjf8ske	p9	name_and_dob	garethllewellyn|1973-02-08
cmudogejp002h7ddca13yipel	p9	national_insurance	QQ100147C
cmudogejp002i7ddc5dr0iodn	p10	name_and_dob	amarasesay|1985-06-21
cmudogejp002j7ddcjv5tmbhg	p10	national_insurance	QQ100154C
cmudogejp002k7ddcoh45i2lw	p11	name_and_dob	viktorhorvat|1986-07-22
cmudogejp002l7ddceiy7ttxu	p11	national_insurance	QQ100161C
cmudogejp002m7ddcdmkemxme	p12	name_and_dob	joannefitzgerald|1987-08-23
cmudogejp002n7ddce3kjkfmz	p12	national_insurance	QQ100168C
cmudogejp002o7ddcrq1yilak	p13	name_and_dob	deleajayi|1988-09-24
cmudogejp002p7ddclhbz0psg	p13	national_insurance	QQ100175C
cmudogejp002q7ddcnbu62kro	p14	name_and_dob	hannahoyelaran|1989-10-25
cmudogejp002r7ddch94h5fjs	p14	national_insurance	QQ100182C
\.


--
-- Data for Name: Post; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Post" (id, "siteId", name, pattern, "requiresSiaLicence", "screeningPeriodYears", "checkCallsRequired", "loneWorking", active, "mobileSignal") FROM stdin;
post1	s1	Night gatehouse	Mon–Sun 1900–0700	t	5	t	f	t	t
post2	s1	Day patrol	Mon–Fri 0700–1900	t	5	f	f	t	t
post3	s2	Gatehouse	Mon–Sun 1800–0600	t	5	t	t	t	t
post4	s3	Concourse, retail hours	Mon–Sat 0900–2100	t	5	t	f	t	t
post5	s3	Concourse, second officer	Fri–Sun 1200–2200	t	5	t	f	t	t
post6	s4	Perimeter, nights	Mon–Sun 1900–0700	t	5	t	t	t	f
post7	s5	Concierge desk	Mon–Sun 0700–1900	t	5	f	t	t	t
post8	s6	Vehicle gate	Mon–Sun 0600–1800	t	5	t	t	t	t
post9	s6	Vehicle gate, relief	Sat–Sun 0600–1800	t	5	t	f	t	t
\.


--
-- Data for Name: RecurringPayment; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."RecurringPayment" (id, "supplierId", label, "agreedAmountPence", frequency, "dayOfMonth", "firstDueOn", "endsOn", active) FROM stdin;
rp-rent	sup-landlord	Office rent — Unit 4	180000	monthly	1	2025-04-01 05:43:36.77+00	\N	t
rp-power	sup-utilities	Electricity and gas	38500	monthly	14	2025-08-19 05:43:36.77+00	\N	t
rp-lines	sup-telecoms	Lines and broadband	14900	monthly	20	2025-08-19 05:43:36.77+00	\N	t
rp-clean	sup-facilities	Cleaning and waste	42000	quarterly	5	2026-03-07 05:43:36.77+00	\N	t
\.


--
-- Data for Name: Reminder; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Reminder" (id, "ruleId", state, "personId", "documentId", "workItemId", "screeningFileId", "dueAt", "sentAt", "cancelledAt", "cancelledReason", attempt) FROM stdin;
\.


--
-- Data for Name: ReminderRule; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ReminderRule" (id, key, label, subject, offsets, channel, "escalatesTo", active) FROM stdin;
cmudogeje00137ddcai4i9881	document_expiry	Document expiry warnings	DocumentRecord.expiresAt	{-90,-60,-30}	email	\N	t
cmudogeje00147ddc9imu86e0	chase_application	Application chaser	Candidacy.stage	{3,7}	email	\N	t
cmudogeje00157ddckpnpvqud	chase_documents	Document chaser	DocumentRecord.verification	{2,5,8}	email	\N	t
cmudogeje00167ddc84b43xp5	chase_signatures	Welcome pack signature chaser	FormResponse.completedAt	{2,5}	email	\N	t
cmudogeje00177ddcoiy5vc3t	chase_reference	Employment reference chaser	ScreeningCheck.firstRequestSentAt	{0,10,20}	email	\N	t
cmudogeje00187ddcvodacnhc	screening_clock	Screening deadline warnings	ScreeningFile.conditionalEmploymentStart	{-28,-14,-7,0}	email	top_management	t
cmudogeje00197ddcqymz9m85	retention_sweep	Retention and disposal sweep	ScreeningFile.retainUntil	{0}	task	vetting_controller	t
cmudogent007t7ddc24e8syw8	admin.recurring_payment_due	Recurring payment falling due	recurring_payment.dueDate	{-7,-2,0,1}	email	finance_officer	t
cmudogent007u7ddc0ds0rsus	admin.payment_variance	Payment differs from the agreed amount	recurring_payment.variance	{0}	email	finance_officer	t
cmudogent007v7ddc9ptq54x5	admin.supplier_contract_renewal	Supplier contract approaching its end	supplier_contract.endsOn	{-90,-60,-30,-7}	email	admin_manager	t
cmudogent007w7ddc0hfibs9q	admin.accreditation_renewal	Accreditation renewal due	accreditation.expiresOn	{-120,-90,-60,-30,-7}	email	top_management	t
cmudogent007x7ddckmjmrpp5	admin.accreditation_evidence_gap	Accreditation evidence still missing	accreditation.evidenceGap	{-60,-30,-14}	email	admin_manager	t
cmudogent007y7ddcqxc5z3zp	admin.holiday_awaiting_decision	Holiday request waiting on a decision	holiday_request.raisedAt	{2,5}	email	recruitment_manager	t
cmudogent007z7ddcl8fwt5j3	admin.holiday_entitlement_unused	Holiday entitlement at risk of being lost	holiday_entitlement.leaveYearEnd	{-90,-30}	email	recruitment_manager	t
cmudogent00807ddcyomqztq9	admin.maintenance_due	Asset service or inspection due	asset.nextServiceOn	{-14,-3,0,7}	email	admin_manager	t
cmudogent00817ddcp9il4evw	admin.uniform_return_outstanding	Uniform still out with a leaver	equipment_issue.leaverDate	{7,14,30}	email	admin_manager	t
cmudogent00827ddccm686c4v	admin.approval_waiting	Approval unanswered	admin_request.awaitingApprovalSince	{1,2,3}	email	top_management	t
\.


--
-- Data for Name: Requirement; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Requirement" (id, reference, "clientId", "siteId", "controlTeam", post, "headcountRequired", "shiftPattern", "startDate", status, "receivedAt", "releasedToSourcingAt", "ownerUserId") FROM stdin;
r1	REQ-1042	c1	s1	alpha	Static guard	3	4 on 4 off, nights	2026-10-05	released_to_sourcing	2026-09-02 05:43:34.99+00	2026-09-04 05:43:34.99+00	u1
r2	REQ-1043	c3	s4	bravo	Data centre officer	2	Days, Mon–Fri	2026-09-27	released_to_sourcing	2026-08-20 05:43:34.99+00	2026-08-23 05:43:34.99+00	u2
r3	REQ-1045	c2	s3	alpha	Retail security officer	1	Weekends	2026-10-13	allocated	2026-09-09 05:43:34.99+00	2026-09-10 05:43:34.99+00	u1
r4	REQ-1046	c4	s5	bravo	Concierge	2	Rotating 12s	2026-10-23	filled	2026-08-14 05:43:34.99+00	2026-08-16 05:43:34.99+00	u2
r5	REQ-1047	c5	s6	alpha	Gatehouse officer	4	Continental	2026-09-20	released_to_sourcing	2026-08-08 05:43:34.99+00	2026-08-10 05:43:34.99+00	u1
r6	REQ-1048	c1	s2	alpha	Mobile patrol	1	Nights	2026-10-01	pool_check	2026-09-21 05:43:34.99+00	\N	\N
r7	REQ-1049	c3	s4	bravo	Data centre officer	1	Nights	2026-09-24	released_to_sourcing	2026-09-14 05:43:34.99+00	2026-09-15 05:43:34.99+00	u2
\.


--
-- Data for Name: RoleDelegation; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."RoleDelegation" (id, role, "fromUserId", "toUserId", "startsAt", "endsAt", reason, "grantedByUserId", "grantedAt", "revokedAt", "revokedByUserId", "revokedReason") FROM stdin;
cmudogepa009u7ddcc0y4qsl6	finance_officer	u10	u5	2026-09-21 05:43:36.813+00	2026-10-05 05:43:36.813+00	Annual leave. Cover for spend approvals only.	u10	2026-09-23 05:43:36.814+00	\N	\N	\N
\.


--
-- Data for Name: ScreeningCheck; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ScreeningCheck" (id, "fileId", "group", label, clause, status, "ownerUserId", "requestCode", "firstRequestSentAt", "secondRequestSentAt", "confirmedAt", "coversFrom", "coversTo", notes) FROM stdin;
cmudogekq003m7ddcvgy7c0yo	f1	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003n7ddc8awjulkw	f1	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003o7ddczpxxr78k	f1	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003p7ddcsywyjm80	f1	preliminary	Identity confirmed from original documents	7.4c	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003q7ddczjl2j30e	f1	preliminary	SIA licence verified against the public register	7.4c1	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003r7ddcge641g8i	f1	preliminary	Current address confirmed	7.4d	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003s7ddc2x71uhb2	f1	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003t7ddc3ap6dd3u	f1	preliminary	OFAC sanctions screening	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003u7ddcbvreybzb	f1	preliminary	Creditsafe public record search	7.4f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003v7ddciazitgp5	f1	history	Career and history — 3 years before application	7.5.2a	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003w7ddcs6s7p9zs	f1	history	Career and history — whole screening period	7.7	chased	u4	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogekq003x7ddcyj5qlshh	f1	history	Date of leaving full-time education	7.7a	requested	u4	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogekq003y7ddc6i827uzg	f1	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq003z7ddcfxiwyekv	f1	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq00407ddcb3shdwnx	f1	legal	Right to work — share code checked independently	outside scope	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq00417ddc9lv62eps	f1	signoff	Controller review — limited screening	7.5.2b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekq00427ddcwzxzk1eh	f1	signoff	Controller review — completed file	7.7	not_started	u4	\N	\N	\N	\N	\N	\N	\N
cmudogekz00437ddcdmsqswwn	f2	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00447ddcqtoh8lit	f2	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00457ddcxldeamf0	f2	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00467ddcu7vwh1o3	f2	preliminary	Identity confirmed from original documents	7.4c	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00477ddcdy7c2bbg	f2	preliminary	SIA licence verified against the public register	7.4c1	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00487ddc3ll7dxu5	f2	preliminary	Current address confirmed	7.4d	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz00497ddco23gs9tl	f2	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004a7ddcf5mdswpo	f2	preliminary	OFAC sanctions screening	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004b7ddcky20ixci	f2	preliminary	Creditsafe public record search	7.4f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004c7ddc7wslrjxr	f2	history	Career and history — 3 years before application	7.5.2a	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004d7ddcbqsu3vf9	f2	history	Career and history — whole screening period	7.7	chased	u3	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogekz004e7ddcdaslwu57	f2	history	Date of leaving full-time education	7.7a	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogekz004f7ddci12yqnow	f2	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004g7ddcezbrogzo	f2	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004h7ddcvvlase9x	f2	legal	Right to work — share code checked independently	outside scope	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004i7ddcjxqk69sg	f2	signoff	Controller review — limited screening	7.5.2b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogekz004j7ddcmmqia128	f2	signoff	Controller review — completed file	7.7	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogel3004k7ddc7lg97a81	f3	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004l7ddcku3vrvfq	f3	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004m7ddcgj3x93f4	f3	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004n7ddcb9xsurky	f3	preliminary	Identity confirmed from original documents	7.4c	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004o7ddc1avmkma1	f3	preliminary	SIA licence verified against the public register	7.4c1	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004p7ddcheqtqvwq	f3	preliminary	Current address confirmed	7.4d	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004q7ddcv7ovy5ny	f3	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004r7ddckouugmg7	f3	preliminary	OFAC sanctions screening	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004s7ddc4nizcm5p	f3	preliminary	Creditsafe public record search	7.4f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004t7ddcy0vlfbxg	f3	history	Career and history — 3 years before application	7.5.2a	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004u7ddcomp6am0b	f3	history	Career and history — whole screening period	7.7	chased	u4	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogel3004v7ddc9m1sxvs2	f3	history	Date of leaving full-time education	7.7a	requested	u4	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogel3004w7ddc8ez1qavb	f3	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004x7ddc123zntpk	f3	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004y7ddcaho69pkd	f3	legal	Right to work — share code checked independently	outside scope	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel3004z7ddcvib3eapl	f3	signoff	Controller review — limited screening	7.5.2b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel300507ddc5w2pnmb1	f3	signoff	Controller review — completed file	7.7	not_started	u4	\N	\N	\N	\N	\N	\N	\N
cmudogel700517ddcwfso0hhr	f4	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700527ddce8mv3l4m	f4	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700537ddcdvr03h4f	f4	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700547ddcen5n100g	f4	preliminary	Identity confirmed from original documents	7.4c	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700557ddck0b7xbgd	f4	preliminary	SIA licence verified against the public register	7.4c1	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700567ddcdscombka	f4	preliminary	Current address confirmed	7.4d	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700577ddcq8jb9wmw	f4	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700587ddchgawgj0e	f4	preliminary	OFAC sanctions screening	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel700597ddcze0p73gi	f4	preliminary	Creditsafe public record search	7.4f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005a7ddcm0w1u9f5	f4	history	Career and history — 3 years before application	7.5.2a	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005b7ddc0gp029tt	f4	history	Career and history — whole screening period	7.7	chased	u3	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogel7005c7ddci5wclcd2	f4	history	Date of leaving full-time education	7.7a	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogel7005d7ddcu0euuu10	f4	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005e7ddcj14zf2iv	f4	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005f7ddcvfo9o2wh	f4	legal	Right to work — share code checked independently	outside scope	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005g7ddc25ew4nnu	f4	signoff	Controller review — limited screening	7.5.2b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogel7005h7ddckoccho5k	f4	signoff	Controller review — completed file	7.7	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogelb005i7ddcvgkb8ngb	f5	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelb005j7ddcm7fqwip2	f5	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005k7ddc67wc8cs8	f5	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005l7ddczm1dmbpc	f5	preliminary	Identity confirmed from original documents	7.4c	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005m7ddcvpjolfd9	f5	preliminary	SIA licence verified against the public register	7.4c1	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005n7ddct257v7zs	f5	preliminary	Current address confirmed	7.4d	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005o7ddclcordmp9	f5	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005p7ddczneifm11	f5	preliminary	OFAC sanctions screening	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005q7ddcnandbhah	f5	preliminary	Creditsafe public record search	7.4f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005r7ddcw5f8sd92	f5	history	Career and history — 3 years before application	7.5.2a	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005s7ddcmcnpv8o4	f5	history	Career and history — whole screening period	7.7	chased	u4	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogelc005t7ddc4dyy4mwv	f5	history	Date of leaving full-time education	7.7a	requested	u4	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelc005u7ddcn0f5rw4z	f5	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005v7ddccd7b4xgy	f5	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005w7ddcqy531tvq	f5	legal	Right to work — share code checked independently	outside scope	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005x7ddc64i0o2r7	f5	signoff	Controller review — limited screening	7.5.2b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelc005y7ddcz3wwgqlb	f5	signoff	Controller review — completed file	7.7	not_started	u4	\N	\N	\N	\N	\N	\N	\N
cmudogelg005z7ddchv30f7bb	f6	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00607ddclb1f9noe	f6	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00617ddckzfeqfnn	f6	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00627ddchl42ewri	f6	preliminary	Identity confirmed from original documents	7.4c	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00637ddc8rokv99u	f6	preliminary	SIA licence verified against the public register	7.4c1	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00647ddcy0oypan6	f6	preliminary	Current address confirmed	7.4d	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00657ddc2uevjzp0	f6	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00667ddc8xfff4wt	f6	preliminary	OFAC sanctions screening	7.4e	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00677ddc3clpvlx1	f6	preliminary	Creditsafe public record search	7.4f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00687ddcyir342z1	f6	history	Career and history — 3 years before application	7.5.2a	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg00697ddcsn3jrvk8	f6	history	Career and history — whole screening period	7.7	chased	u3	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogelg006a7ddc51b23wt8	f6	history	Date of leaving full-time education	7.7a	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelg006b7ddc8eblxa5v	f6	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg006c7ddc7ixvri08	f6	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg006d7ddcb81p1yvo	f6	legal	Right to work — share code checked independently	outside scope	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg006e7ddcfr9vn5cg	f6	signoff	Controller review — limited screening	7.5.2b	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelg006f7ddcsdira9yc	f6	signoff	Controller review — completed file	7.7	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogell006g7ddc0careicb	f7	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006h7ddcxqj5k1yy	f7	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006i7ddcla6h2nm7	f7	preliminary	Information complete and reviewed as likely to complete	7.4b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006j7ddcdt46baok	f7	preliminary	Identity confirmed from original documents	7.4c	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006k7ddc7gkhi80b	f7	preliminary	SIA licence verified against the public register	7.4c1	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006l7ddcs585su0h	f7	preliminary	Current address confirmed	7.4d	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006m7ddcdhmzdr56	f7	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006n7ddcd883s2zk	f7	preliminary	OFAC sanctions screening	7.4e	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006o7ddc9ykdlcpc	f7	preliminary	Creditsafe public record search	7.4f	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006p7ddcz5cm68ch	f7	history	Career and history — 3 years before application	7.5.2a	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006q7ddc37lne5j0	f7	history	Career and history — whole screening period	7.7	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006r7ddc7tqyihjd	f7	history	Date of leaving full-time education	7.7a	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006s7ddc2uqqbb4e	f7	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006t7ddcezywzegk	f7	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006u7ddct8shs66x	f7	legal	Right to work — share code checked independently	outside scope	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006v7ddcjcb9xsh7	f7	signoff	Controller review — limited screening	7.5.2b	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogell006w7ddcafmdhjl7	f7	signoff	Controller review — completed file	7.7	verified	u4	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelp006x7ddcho4vv18b	f8	consent	Authorisation to approach employers, government departments and a credit reference agency	7.3.2f	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelp006y7ddcg5oh8001	f8	consent	Signed declaration and misrepresentation acknowledgement	7.3.2e, g	verified	u3	\N	2026-09-03 05:43:34.99+00	\N	2026-09-20 05:43:34.99+00	\N	\N	\N
cmudogelp006z7ddc8ointe3b	f8	preliminary	Information complete and reviewed as likely to complete	7.4b	received	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00707ddc0wfit7hr	f8	preliminary	Identity confirmed from original documents	7.4c	received	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00717ddchboliaa8	f8	preliminary	SIA licence verified against the public register	7.4c1	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00727ddctwyc8swv	f8	preliminary	Current address confirmed	7.4d	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00737ddcesnjpj9c	f8	preliminary	UK sanctions screening (HM Treasury consolidated list)	7.4e	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogelp00747ddcwzktlsxs	f8	preliminary	OFAC sanctions screening	7.4e	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogelp00757ddcqafjphyi	f8	preliminary	Creditsafe public record search	7.4f	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogelp00767ddcfemybhxp	f8	history	Career and history — 3 years before application	7.5.2a	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00777ddcwmsgdd5j	f8	history	Career and history — whole screening period	7.7	chased	u3	\N	2026-09-03 05:43:34.99+00	2026-09-17 05:43:34.99+00	\N	\N	\N	\N
cmudogelp00787ddc7micqhj5	f8	history	Date of leaving full-time education	7.7a	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp00797ddcbedwxhwl	f8	criminality	SIA licence, NPCC Appendix C or disclosure held	7.7j	requested	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp007a7ddcopybceqt	f8	criminality	Enhanced disclosure — post involves contact with children or vulnerable adults	7.7j Note 6	not_applicable	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp007b7ddc488ta2ud	f8	legal	Right to work — share code checked independently	outside scope	received	u3	\N	2026-09-03 05:43:34.99+00	\N	\N	\N	\N	\N
cmudogelp007c7ddcgieiiz0q	f8	signoff	Controller review — limited screening	7.5.2b	not_started	u3	\N	\N	\N	\N	\N	\N	\N
cmudogelp007d7ddc67hov2yu	f8	signoff	Controller review — completed file	7.7	not_started	u3	\N	\N	\N	\N	\N	\N	\N
\.


--
-- Data for Name: ScreeningDecision; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ScreeningDecision" (id, "fileId", kind, "decidedById", "decidedAt", rationale, "amountGbp") FROM stdin;
cmudogelt007f7ddcg3iozt3x	f3	risk_acceptance	u5	2026-09-20 05:43:36.688+00	CCJ of £14,200 satisfied in full 18 months ago, unrelated to the intended role, and the officer disclosed it at application. Accepted with annual review.	14200.00
\.


--
-- Data for Name: ScreeningFile; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ScreeningFile" (id, "personId", "screeningPeriodYears", status, "conditionalEmploymentStart", "extensionWeeks", "extensionApprovedById", "extensionApprovedAt", "administratorUserId", "controllerUserId", "controllerReview1At", "controllerReview2At", "unverifiedDays", "gapsOver31Days", "openedAt", "completedAt", "retainUntil", "disposedAt") FROM stdin;
f1	p1	5	full_screening_in_progress	2026-07-07	0	\N	\N	u4	u3	2026-07-05 05:43:34.99+00	\N	47	1	2026-09-23 05:43:36.65+00	\N	\N	\N
f2	p2	5	full_screening_in_progress	2026-07-13	0	\N	\N	u3	u4	2026-07-11 05:43:34.99+00	\N	96	2	2026-09-23 05:43:36.659+00	\N	\N	\N
f3	p3	5	risk_acceptance_required	2026-07-27	0	\N	\N	u4	u3	2026-07-25 05:43:34.99+00	\N	12	0	2026-09-23 05:43:36.663+00	\N	\N	\N
f4	p4	5	full_screening_in_progress	2026-08-13	0	\N	\N	u3	u4	2026-08-11 05:43:34.99+00	\N	31	1	2026-09-23 05:43:36.667+00	\N	\N	\N
f5	p5	5	full_screening_in_progress	2026-06-19	4	u5	2026-09-03 05:43:36.67+00	u4	u3	2026-06-17 05:43:34.99+00	\N	22	0	2026-09-23 05:43:36.672+00	\N	\N	\N
f6	p6	5	full_screening_in_progress	2026-09-04	0	\N	\N	u3	u4	2026-09-02 05:43:34.99+00	\N	64	1	2026-09-23 05:43:36.676+00	\N	\N	\N
f7	p7	5	controller_review_2	2026-07-19	0	\N	\N	u4	u3	2026-07-17 05:43:34.99+00	\N	0	0	2026-09-23 05:43:36.681+00	\N	\N	\N
f8	p8	5	preliminary_checks_complete	\N	0	\N	\N	u3	\N	\N	\N	0	0	2026-09-23 05:43:36.685+00	\N	\N	\N
\.


--
-- Data for Name: Setting; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Setting" (key, value, "valueType", label, "usedBy", "updatedAt", "updatedById") FROM stdin;
ops.bookOnGraceMinutes	15	number	Book-on grace period (minutes)	Live operations	2026-09-23 05:43:36.604+00	\N
ops.bookOnNoShowMinutes	30	number	Treated as a no-show after (minutes)	Live operations	2026-09-23 05:43:36.604+00	\N
ops.checkCallIntervalMinutes	60	number	Check call interval (minutes)	Live operations	2026-09-23 05:43:36.604+00	\N
retention.unsuccessfulApplicantMonths	12	number	Retention — unsuccessful applicants (months)	Retention sweep	2026-09-23 05:43:36.604+00	\N
retention.afterCessationYears	7	number	Retention — after employment ends (years)	Retention sweep	2026-09-23 05:43:36.604+00	\N
expiry.warningDays	90,60,30	list	Expiry warnings at (days before)	Scheduler	2026-09-23 05:43:36.604+00	\N
sla.stageDays	{"sourcing":1,"shortlisted":2,"invited":0,"application_received":3,"application_complete":3,"first_interview":3,"second_interview":5,"additional_interview":5,"conditional_offer":1,"welcome_pack":0,"signed_docs_complete":5,"onboarding_complete":2,"deployed":1,"confirmed_employment":0,"withdrawn":0}	json	Recruitment stage service levels (working days)	Work queue	2026-09-23 05:43:36.604+00	\N
admin.approval.low_threshold_pence	25000	number	Admin approval — the Admin Manager decides alone at or under this	lib/core/admin.ts approvalChain	2026-09-23 05:43:36.76+00	\N
admin.approval.high_threshold_pence	200000	number	Admin approval — a second, different approver is required above this	lib/core/admin.ts approvalChain	2026-09-23 05:43:36.76+00	\N
\.


--
-- Data for Name: Site; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Site" (id, "clientId", name, address, "clientRef", "checkCallInstruction") FROM stdin;
s1	c1	Meridian — Depot 4	\N	\N	\N
s2	c1	Meridian — Depot 7	\N	\N	\N
s3	c2	Northgate — Main concourse	\N	\N	\N
s4	c3	Halton — DC1 perimeter	\N	\N	\N
s5	c4	Riverside — Block A concierge	\N	\N	\N
s6	c5	Clearwater — Manufacturing gate	\N	\N	\N
\.


--
-- Data for Name: SiteReference; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SiteReference" (id, "siteId", "employmentId", prn) FROM stdin;
cmudogekc003j7ddct52s2evm	s1	o1	MER-0442
cmudogekc003k7ddc4m1pfd4b	s4	o2	HAL-1180
cmudogekc003l7ddcj5wi3b7o	s6	o4	CW-2207
\.


--
-- Data for Name: StockItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."StockItem" (id, "equipmentItemId", size, "reorderLevel", location) FROM stdin;
st-tr-32	eq-trousers	32R	6	Store — shelf A
st-tr-34	eq-trousers	34R	6	Store — shelf A
st-tr-36	eq-trousers	36R	6	Store — shelf A
st-sh-m	eq-shirt	M	8	Store — shelf B
st-sh-l	eq-shirt	L	8	Store — shelf B
st-coat-l	eq-coat	L	3	Store — rail
st-radio	eq-radio	\N	2	Control room cabinet
st-boots-9	eq-boots	9	4	Store — shelf C
\.


--
-- Data for Name: StockMovement; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."StockMovement" (id, "stockItemId", kind, quantity, at, "byUserId", note, "equipmentIssueId") FROM stdin;
cmudogeoz008v7ddcnlr4bqnb	st-tr-32	received	12	2026-06-25 05:43:36.802+00	u8	\N	\N
cmudogeoz008w7ddc7hxwz9b0	st-tr-32	issued	-4	2026-07-25 05:43:36.802+00	u8	\N	\N
cmudogeoz008x7ddcxafwjv28	st-tr-34	received	18	2026-06-25 05:43:36.802+00	u8	\N	\N
cmudogeoz008y7ddcugjk0vwu	st-tr-34	issued	-13	2026-08-14 05:43:36.802+00	u8	\N	\N
cmudogeoz008z7ddcl043b0b1	st-tr-36	received	10	2026-06-25 05:43:36.802+00	u8	\N	\N
cmudogeoz00907ddcg17ppyv4	st-tr-36	issued	-4	2026-08-24 05:43:36.802+00	u8	\N	\N
cmudogeoz00917ddc9wgk6x96	st-sh-m	received	24	2026-05-26 05:43:36.802+00	u8	\N	\N
cmudogeoz00927ddcyr80wox8	st-sh-m	issued	-9	2026-08-04 05:43:36.802+00	u8	\N	\N
cmudogeoz00937ddcef7rdvvi	st-sh-l	received	20	2026-05-26 05:43:36.802+00	u8	\N	\N
cmudogeoz00947ddcjdes0kan	st-sh-l	issued	-16	2026-08-29 05:43:36.802+00	u8	\N	\N
cmudogeoz00957ddc07yg3adm	st-coat-l	received	6	2026-04-26 05:43:36.802+00	u8	\N	\N
cmudogeoz00967ddc4evuluny	st-coat-l	issued	-5	2026-09-03 05:43:36.802+00	u8	\N	\N
cmudogeoz00977ddcofh1hzs4	st-coat-l	returned	1	2026-09-15 05:43:36.802+00	u8	Returned on leaving, good condition	\N
cmudogeoz00987ddcnxmsxvbe	st-radio	received	8	2026-03-07 05:43:36.802+00	u8	\N	\N
cmudogeoz00997ddcte6nn24m	st-radio	issued	-7	2026-06-15 05:43:36.802+00	u8	\N	\N
cmudogeoz009a7ddcr9ngusme	st-boots-9	received	10	2026-06-05 05:43:36.802+00	u8	\N	\N
cmudogeoz009b7ddco8kdwpxr	st-boots-9	issued	-3	2026-08-19 05:43:36.802+00	u8	\N	\N
cmudogeoz009c7ddc410j4j0o	st-boots-9	written_off	-1	2026-09-11 05:43:36.802+00	u8	Damaged in the store	\N
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Supplier" (id, name, category, "contactName", email, phone, "accountRef", "paymentTermsDays", active, "createdAt") FROM stdin;
sup-landlord	Brockley Estates	premises	\N	\N	\N	BE-4471	0	t	2026-09-23 05:43:36.766+00
sup-utilities	Northern Power	utilities	\N	\N	\N	NP-90112	14	t	2026-09-23 05:43:36.766+00
sup-telecoms	Linehaul Telecom	telecoms	\N	\N	\N	LT-2208	30	t	2026-09-23 05:43:36.766+00
sup-uniform	Sentinel Workwear	uniform	\N	\N	\N	SW-1190	30	t	2026-09-23 05:43:36.766+00
sup-facilities	Kestrel Facilities	maintenance	\N	\N	\N	KF-0043	30	t	2026-09-23 05:43:36.766+00
\.


--
-- Data for Name: SupplierContract; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."SupplierContract" (id, "supplierId", reference, "startsOn", "endsOn", "noticePeriodDays", "agreedAmountPence", notes) FROM stdin;
cmudogeo000837ddc07aq2dnr	sup-landlord	Office lease — Unit 4	2025-04-01 05:43:36.767+00	2027-04-01 05:43:36.768+00	90	180000	Three-year lease. Rent reviewed annually in April.
cmudogeo000847ddc14fj391e	sup-telecoms	Lines and broadband	2025-08-19 05:43:36.768+00	2026-10-18 05:43:36.768+00	30	14900	\N
cmudogeo000857ddcho3p04om	sup-facilities	Cleaning and waste	2026-03-07 05:43:36.768+00	2028-02-25 05:43:36.768+00	60	42000	\N
\.


--
-- Data for Name: Suspension; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Suspension" (id, "personId", "startsOn", "endsOn", reason, paid, "decidedByUserId", "liftedOn") FROM stdin;
cmudogeon008o7ddc5uhhkzew	hr1	2026-09-11 05:43:36.791+00	\N	Pending the outcome of a site incident investigation.	t	u5	\N
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."User" (id, "personId", "ssoSubject", "displayName", "ownScreeningComplete", "confidentialityAgreementOnFile", "trainingReviewedAt", active, "createdAt") FROM stdin;
u1	hr1	\N	Priya	t	t	2026-05-26 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u2	hr2	\N	Joel	t	t	2026-04-26 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u3	hr3	\N	Marcus	t	t	2026-06-25 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u4	hr4	\N	Ruth	t	t	2026-03-07 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u5	hr5	\N	Eleanor	t	t	2026-07-25 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u6	ct1	\N	Control Alpha desk	t	t	2025-11-27 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u7	ct2	\N	Control Bravo desk	t	t	2025-11-27 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u8	hr6	\N	Kirsty	t	t	2026-07-05 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u9	hr7	\N	Douglas	t	t	2026-08-09 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
u10	hr8	\N	Vivien	t	t	2026-08-24 05:43:34.989+00	t	2026-09-23 05:43:36.617+00
\.


--
-- Data for Name: UserRole; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."UserRole" (id, "userId", role, "grantedAt", "grantedById", "grantBasis", "revokedAt") FROM stdin;
cmudogejw002s7ddc5ofnplq9	u1	recruitment	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002t7ddcst1j2rb0	u2	recruitment	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002u7ddc5iibztw3	u3	vetting_admin	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002v7ddccxe2jg11	u3	vetting_controller	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002w7ddcdvrxcabt	u4	vetting_admin	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002x7ddcloy1v1rb	u4	vetting_controller	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002y7ddcnom4a8j3	u5	top_management	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw002z7ddc3tbv8336	u5	recruitment_manager	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00307ddcay7zdehz	u5	vetting_admin	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00317ddccaifh3ai	u6	control	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00327ddcvwvsazrt	u7	control	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00337ddcjyztce2f	u8	admin_officer	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00347ddc2htjk6ye	u9	admin_manager	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00357ddc7f82320e	u9	admin_officer	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00367ddc5ycrboln	u10	finance_officer	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
cmudogejw00377ddcofoz4ifi	u10	top_management	2026-09-23 05:43:36.62+00	u5	Own screening complete, NDA on file, training in date (6.1, 6.2)	\N
\.


--
-- Data for Name: Voucher; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Voucher" (id, reference, "personId", "valuePence", purpose, "issuedOn", "expiresOn", state, "redeemedOn") FROM stdin;
cmudogeos008s7ddcfzgmy47y	VCH-0001	hr6	5000	Officer of the month	2026-08-14 05:43:36.796+00	2026-10-13 05:43:36.796+00	issued	\N
cmudogeos008t7ddc11owmdyu	VCH-0002	hr1	2500	Referral bonus	2026-06-15 05:43:36.796+00	2026-09-13 05:43:36.796+00	redeemed	2026-08-24 05:43:36.796+00
cmudogeos008u7ddcw3jh8ikq	VCH-0003	\N	10000	Client goodwill after a cover failure	2026-09-08 05:43:36.796+00	2026-12-07 05:43:36.796+00	issued	\N
\.


--
-- Data for Name: WorkItem; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."WorkItem" (id, "definitionId", title, state, "personId", "screeningFileId", "requirementId", "assignmentId", "documentId", "formResponseId", "ownerUserId", "ownerRole", "dueAt", "slaDays", "createdAt", "doneAt", "blockedReason", "escalatedAt", "adminItemId") FROM stdin;
t1	\N	2nd request — Brightwater Security (WR)	open	p1	\N	\N	\N	\N	\N	u4	\N	2026-09-19 05:43:34.99+00	3	2026-09-09 05:43:34.99+00	\N	\N	\N	\N
t2	\N	Documentary evidence for gap Mar–Jun 2023 (DR)	open	p2	\N	\N	\N	\N	\N	u3	\N	2026-09-17 05:43:34.99+00	3	2026-09-11 05:43:34.99+00	\N	\N	\N	\N
t3	\N	Risk acceptance — CCJ £14,200	open	p3	\N	\N	\N	\N	\N	u5	\N	2026-09-21 05:43:34.99+00	2	2026-09-18 05:43:34.99+00	\N	\N	\N	\N
t4	\N	Controller review — completed file	open	p7	\N	\N	\N	\N	\N	u3	\N	2026-09-24 05:43:34.99+00	2	2026-09-22 05:43:34.99+00	\N	\N	\N	\N
t5	\N	3rd chaser — application not returned	open	p13	\N	\N	\N	\N	\N	u1	\N	2026-09-22 05:43:34.99+00	3	2026-09-08 05:43:34.99+00	\N	\N	\N	\N
t6	\N	Two documents needed for Acme Ltd period	open	p9	\N	\N	\N	\N	\N	u1	\N	2026-09-25 05:43:34.99+00	3	2026-09-22 05:43:34.99+00	\N	\N	\N	\N
t7	\N	SIA public register check — blocks deployment	open	p8	\N	\N	\N	\N	\N	u3	\N	2026-09-24 05:43:34.99+00	3	2026-09-21 05:43:34.99+00	\N	\N	\N	\N
t8	\N	Hire in Casper from submitted application	open	p6	\N	\N	\N	\N	\N	u1	\N	2026-09-24 05:43:34.99+00	2	2026-09-22 05:43:34.99+00	\N	\N	\N	\N
t9	\N	Restrictive covenant unsigned	open	p10	\N	\N	\N	\N	\N	u1	\N	2026-09-20 05:43:34.99+00	5	2026-09-15 05:43:34.99+00	\N	\N	\N	\N
t10	\N	Secure disposal due — unsuccessful at preliminary (12 months)	open	\N	\N	r1	\N	\N	\N	u3	\N	2026-09-28 05:43:34.99+00	5	2026-09-21 05:43:34.99+00	\N	\N	\N	\N
t11	\N	DWP written request — registered unemployment	blocked	p2	\N	\N	\N	\N	\N	u3	\N	2026-09-26 05:43:34.99+00	3	2026-09-22 05:43:34.99+00	\N	Awaiting DWP response — no API, written request only	\N	\N
t12	\N	1st request — overseas employer (WR)	open	p5	\N	\N	\N	\N	\N	u4	\N	2026-09-27 05:43:34.99+00	3	2026-09-22 05:43:34.99+00	\N	\N	\N	\N
cmudogeqe009z7ddc0uhxynr1	\N	ADM-0001 — Replace the kitchen water boiler	open	\N	\N	\N	\N	\N	\N	u8	\N	2026-09-23 05:43:36.817+00	3	2026-09-23 05:43:36.854+00	\N	\N	\N	cmudogeq8009w7ddcaizkomnp
cmudogeqq00a67ddchl7x1egn	\N	ADM-0002 — Variance on Electricity and gas	open	\N	\N	\N	\N	\N	\N	\N	admin_manager	2026-09-05 05:43:36.859+00	1	2026-09-23 05:43:36.866+00	\N	\N	\N	cmudogeqk00a37ddchrgifgw0
cmudogeqy00ae7ddcszkiajvp	\N	ADM-0003 — Uniform order — trousers and shirts	open	\N	\N	\N	\N	\N	\N	u9	\N	2026-09-24 05:43:36.869+00	3	2026-09-23 05:43:36.875+00	\N	\N	\N	cmudogeqt00aa7ddc0ly380a4
cmudoger400am7ddcwimm0npr	\N	ADM-0004 — Recharge for a parking penalty in a company vehicle	open	\N	\N	\N	\N	\N	\N	\N	admin_manager	2026-09-23 05:43:36.877+00	3	2026-09-23 05:43:36.881+00	\N	\N	\N	cmudoger200ah7ddcbsga11ny
cmudogera00as7ddc1urtjqph	\N	ADM-0005 — Gather the outstanding SafeContractor evidence	open	\N	\N	\N	\N	\N	\N	u8	\N	2026-09-22 09:43:36.883+00	1	2026-09-23 05:43:36.887+00	\N	\N	\N	cmudoger800aq7ddcwvfatgkw
cmudogerg00ay7ddctd87gix4	\N	ADM-0006 — Book the boiler's annual gas safety service	open	\N	\N	\N	\N	\N	\N	u8	\N	2026-09-20 05:43:36.889+00	1	2026-09-23 05:43:36.893+00	\N	\N	\N	cmudogerd00aw7ddcxcl0f0n3
cmudogerm00b47ddc1ibr6wra	\N	ADM-0007 — Give notice on Lines and broadband, or renegotiate	open	\N	\N	\N	\N	\N	\N	\N	admin_manager	2026-09-18 05:43:36.895+00	1	2026-09-23 05:43:36.898+00	\N	\N	\N	cmudogerk00b27ddcj6n87q9m
cmudogerr00b97ddcz00v7m8r	\N	ADM-0008 — Chase outstanding kit from September leavers	done	\N	\N	\N	\N	\N	\N	u8	\N	2026-09-15 05:43:36.9+00	3	2026-09-23 05:43:36.903+00	2026-09-22 05:43:36.902+00	\N	\N	cmudogerp00b77ddcmy73a0c7
cmudogerx00bf7ddcqskuk8m7	\N	ADM-0009 — Response to the DWP earnings enquiry	open	\N	\N	\N	\N	\N	\N	u8	\N	2026-09-16 05:43:36.905+00	1	2026-09-23 05:43:36.909+00	\N	\N	\N	cmudogeru00bc7ddcxcdowso3
\.


--
-- Data for Name: WorkItemDefinition; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."WorkItemDefinition" (id, title, department, recurrence, "slaDays", "ownerRole", "escalatesTo", active) FROM stdin;
w1	Morning rota check — every post covered for the next 24 hours	control	daily	1	control	top_management	t
w2	Watch List sweep — SIA status for every deployed officer	compliance	daily	1	vetting_admin	vetting_controller	t
w3	Right-to-work expiry review	compliance	daily	1	vetting_admin	recruitment_manager	t
w4	Screening clock review — files inside 4 weeks of their deadline	vetting	weekly	2	vetting_controller	top_management	t
w5	Outstanding reference chasers	vetting	weekly	2	vetting_admin	vetting_controller	t
w6	Open requirements without an allocated candidate	recruitment	daily	1	recruitment	recruitment_manager	t
w7	Site inspection programme — sites due this week	quality	weekly	5	control	top_management	t
w8	Client satisfaction reviews due	account_management	quarterly	10	recruitment_manager	top_management	t
w9	Retention disposal run — files past their retention period	administration	monthly	5	vetting_controller	top_management	t
w10	Uniform returns outstanding from leavers	administration	monthly	5	recruitment	recruitment_manager	t
admin.monthly_payment_run	Check the month's recurring payments against their agreed amounts	administration	monthly	1	admin_officer	admin_manager	t
admin.stock_count	Count uniform stock and flag anything under its reorder level	administration	monthly	3	admin_officer	admin_manager	t
admin.leaver_returns_sweep	Chase outstanding uniform and equipment from leavers	administration	weekly	3	admin_officer	admin_manager	t
admin.accreditation_evidence_review	Review accreditation evidence for anything due in the next quarter	administration	monthly	3	admin_manager	admin_manager	t
admin.premises_walk	Walk the office: appliances working, services in date, faults raised	administration	monthly	10	admin_officer	admin_manager	t
admin.holiday_balance_review	Review holiday balances and flag entitlement at risk of being lost	administration	quarterly	10	admin_manager	admin_manager	t
\.


--
-- Data for Name: WorkSession; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."WorkSession" (id, "userId", "activeRole", "signedInAt", "lastSeenAt", "signedOutAt") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
6ce3930d-19d7-4990-87fc-5e7433cccbb1	66966f3733cbfad43b31aa756957a8f048a794d363ae4bad923f13a8d0fe17ce	2026-09-23 05:43:32.849779+00	20260921120000_init	\N	\N	2026-09-23 05:43:32.65254+00	1
ccacd226-23a0-4827-ab50-30d159105bf1	3f9b1f3f71b9e6fdc343248092fcb0c77a5c2fddfa5b98791c9a37886416fd19	2026-09-23 05:43:32.932385+00	20260922083048_admin_department	\N	\N	2026-09-23 05:43:32.850681+00	1
03943824-9045-43b7-8890-8e113749bdaa	b9d593f141e72f8b232c867b0792d1ac7fb8a825c732e082e639a5d741ef435c	2026-09-23 05:43:32.94199+00	20260922094426_role_delegation	\N	\N	2026-09-23 05:43:32.933362+00	1
de5329e3-faa1-451b-8079-3e5db76eb2af	2f84a82268f18a148944d713618d483e395715c23f7528f23dc810696f16b0f6	2026-09-23 05:43:32.949185+00	20260922102236_no_mobile_signal	\N	\N	2026-09-23 05:43:32.942799+00	1
\.


--
-- Name: AccreditationRequirement AccreditationRequirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccreditationRequirement"
    ADD CONSTRAINT "AccreditationRequirement_pkey" PRIMARY KEY (id);


--
-- Name: AccreditationSubmission AccreditationSubmission_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccreditationSubmission"
    ADD CONSTRAINT "AccreditationSubmission_pkey" PRIMARY KEY (id);


--
-- Name: Accreditation Accreditation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Accreditation"
    ADD CONSTRAINT "Accreditation_pkey" PRIMARY KEY (id);


--
-- Name: AdminApproval AdminApproval_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminApproval"
    ADD CONSTRAINT "AdminApproval_pkey" PRIMARY KEY (id);


--
-- Name: AdminItem AdminItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_pkey" PRIMARY KEY (id);


--
-- Name: Asset Asset_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Asset"
    ADD CONSTRAINT "Asset_pkey" PRIMARY KEY (id);


--
-- Name: AssignmentAmendment AssignmentAmendment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentAmendment"
    ADD CONSTRAINT "AssignmentAmendment_pkey" PRIMARY KEY (id);


--
-- Name: Assignment Assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_pkey" PRIMARY KEY (id);


--
-- Name: AuthorityMatter AuthorityMatter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuthorityMatter"
    ADD CONSTRAINT "AuthorityMatter_pkey" PRIMARY KEY (id);


--
-- Name: BookOff BookOff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BookOff"
    ADD CONSTRAINT "BookOff_pkey" PRIMARY KEY (id);


--
-- Name: BookOn BookOn_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BookOn"
    ADD CONSTRAINT "BookOn_pkey" PRIMARY KEY (id);


--
-- Name: Candidacy Candidacy_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Candidacy"
    ADD CONSTRAINT "Candidacy_pkey" PRIMARY KEY (id);


--
-- Name: CheckCall CheckCall_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckCall"
    ADD CONSTRAINT "CheckCall_pkey" PRIMARY KEY (id);


--
-- Name: Client Client_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Client"
    ADD CONSTRAINT "Client_pkey" PRIMARY KEY (id);


--
-- Name: ContactAttempt ContactAttempt_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactAttempt"
    ADD CONSTRAINT "ContactAttempt_pkey" PRIMARY KEY (id);


--
-- Name: DisposalRecord DisposalRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DisposalRecord"
    ADD CONSTRAINT "DisposalRecord_pkey" PRIMARY KEY (id);


--
-- Name: DocumentRecord DocumentRecord_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_pkey" PRIMARY KEY (id);


--
-- Name: DocumentType DocumentType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentType"
    ADD CONSTRAINT "DocumentType_pkey" PRIMARY KEY (id);


--
-- Name: Employment Employment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Employment"
    ADD CONSTRAINT "Employment_pkey" PRIMARY KEY (id);


--
-- Name: EquipmentIssue EquipmentIssue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EquipmentIssue"
    ADD CONSTRAINT "EquipmentIssue_pkey" PRIMARY KEY (id);


--
-- Name: EquipmentItem EquipmentItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EquipmentItem"
    ADD CONSTRAINT "EquipmentItem_pkey" PRIMARY KEY (id);


--
-- Name: Event Event_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_pkey" PRIMARY KEY (id);


--
-- Name: FormAnswer FormAnswer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_pkey" PRIMARY KEY (id);


--
-- Name: FormDefinition FormDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormDefinition"
    ADD CONSTRAINT "FormDefinition_pkey" PRIMARY KEY (id);


--
-- Name: FormField FormField_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormField"
    ADD CONSTRAINT "FormField_pkey" PRIMARY KEY (id);


--
-- Name: FormResponse FormResponse_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_pkey" PRIMARY KEY (id);


--
-- Name: HolidayEntitlement HolidayEntitlement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HolidayEntitlement"
    ADD CONSTRAINT "HolidayEntitlement_pkey" PRIMARY KEY (id);


--
-- Name: HolidayRequest HolidayRequest_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HolidayRequest"
    ADD CONSTRAINT "HolidayRequest_pkey" PRIMARY KEY (id);


--
-- Name: Incident Incident_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Incident"
    ADD CONSTRAINT "Incident_pkey" PRIMARY KEY (id);


--
-- Name: Interview Interview_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Interview"
    ADD CONSTRAINT "Interview_pkey" PRIMARY KEY (id);


--
-- Name: Licence Licence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Licence"
    ADD CONSTRAINT "Licence_pkey" PRIMARY KEY (id);


--
-- Name: MaintenanceJob MaintenanceJob_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MaintenanceJob"
    ADD CONSTRAINT "MaintenanceJob_pkey" PRIMARY KEY (id);


--
-- Name: NoSignalHandover NoSignalHandover_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NoSignalHandover"
    ADD CONSTRAINT "NoSignalHandover_pkey" PRIMARY KEY (id);


--
-- Name: PaymentInstance PaymentInstance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PaymentInstance"
    ADD CONSTRAINT "PaymentInstance_pkey" PRIMARY KEY (id);


--
-- Name: Penalty Penalty_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Penalty"
    ADD CONSTRAINT "Penalty_pkey" PRIMARY KEY (id);


--
-- Name: PersonIdentityKey PersonIdentityKey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PersonIdentityKey"
    ADD CONSTRAINT "PersonIdentityKey_pkey" PRIMARY KEY (id);


--
-- Name: Person Person_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Person"
    ADD CONSTRAINT "Person_pkey" PRIMARY KEY (id);


--
-- Name: Post Post_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Post"
    ADD CONSTRAINT "Post_pkey" PRIMARY KEY (id);


--
-- Name: RecurringPayment RecurringPayment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringPayment"
    ADD CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY (id);


--
-- Name: ReminderRule ReminderRule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ReminderRule"
    ADD CONSTRAINT "ReminderRule_pkey" PRIMARY KEY (id);


--
-- Name: Reminder Reminder_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reminder"
    ADD CONSTRAINT "Reminder_pkey" PRIMARY KEY (id);


--
-- Name: Requirement Requirement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Requirement"
    ADD CONSTRAINT "Requirement_pkey" PRIMARY KEY (id);


--
-- Name: RoleDelegation RoleDelegation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoleDelegation"
    ADD CONSTRAINT "RoleDelegation_pkey" PRIMARY KEY (id);


--
-- Name: ScreeningCheck ScreeningCheck_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningCheck"
    ADD CONSTRAINT "ScreeningCheck_pkey" PRIMARY KEY (id);


--
-- Name: ScreeningDecision ScreeningDecision_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningDecision"
    ADD CONSTRAINT "ScreeningDecision_pkey" PRIMARY KEY (id);


--
-- Name: ScreeningFile ScreeningFile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningFile"
    ADD CONSTRAINT "ScreeningFile_pkey" PRIMARY KEY (id);


--
-- Name: Setting Setting_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Setting"
    ADD CONSTRAINT "Setting_pkey" PRIMARY KEY (key);


--
-- Name: SiteReference SiteReference_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteReference"
    ADD CONSTRAINT "SiteReference_pkey" PRIMARY KEY (id);


--
-- Name: Site Site_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Site"
    ADD CONSTRAINT "Site_pkey" PRIMARY KEY (id);


--
-- Name: StockItem StockItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StockItem"
    ADD CONSTRAINT "StockItem_pkey" PRIMARY KEY (id);


--
-- Name: StockMovement StockMovement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_pkey" PRIMARY KEY (id);


--
-- Name: SupplierContract SupplierContract_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplierContract"
    ADD CONSTRAINT "SupplierContract_pkey" PRIMARY KEY (id);


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY (id);


--
-- Name: Suspension Suspension_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Suspension"
    ADD CONSTRAINT "Suspension_pkey" PRIMARY KEY (id);


--
-- Name: UserRole UserRole_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Voucher Voucher_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Voucher"
    ADD CONSTRAINT "Voucher_pkey" PRIMARY KEY (id);


--
-- Name: WorkItemDefinition WorkItemDefinition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItemDefinition"
    ADD CONSTRAINT "WorkItemDefinition_pkey" PRIMARY KEY (id);


--
-- Name: WorkItem WorkItem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_pkey" PRIMARY KEY (id);


--
-- Name: WorkSession WorkSession_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkSession"
    ADD CONSTRAINT "WorkSession_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: Assignment assignment_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT assignment_no_overlap EXCLUDE USING gist ("personId" WITH =, tstzrange("startsAt", "endsAt", '[)'::text) WITH &&) WHERE ((state <> 'cancelled'::public."AssignmentState"));


--
-- Name: AccreditationRequirement_accreditationId_satisfiedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccreditationRequirement_accreditationId_satisfiedAt_idx" ON public."AccreditationRequirement" USING btree ("accreditationId", "satisfiedAt");


--
-- Name: AccreditationSubmission_accreditationId_submittedOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AccreditationSubmission_accreditationId_submittedOn_idx" ON public."AccreditationSubmission" USING btree ("accreditationId", "submittedOn");


--
-- Name: Accreditation_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Accreditation_name_key" ON public."Accreditation" USING btree (name);


--
-- Name: Accreditation_state_expiresOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Accreditation_state_expiresOn_idx" ON public."Accreditation" USING btree (state, "expiresOn");


--
-- Name: AdminApproval_decision_decidedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminApproval_decision_decidedAt_idx" ON public."AdminApproval" USING btree (decision, "decidedAt");


--
-- Name: AdminApproval_itemId_decidedByUserId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdminApproval_itemId_decidedByUserId_key" ON public."AdminApproval" USING btree ("itemId", "decidedByUserId");


--
-- Name: AdminApproval_itemId_step_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdminApproval_itemId_step_key" ON public."AdminApproval" USING btree ("itemId", step);


--
-- Name: AdminItem_assignedToUserId_state_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminItem_assignedToUserId_state_dueAt_idx" ON public."AdminItem" USING btree ("assignedToUserId", state, "dueAt");


--
-- Name: AdminItem_category_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminItem_category_state_idx" ON public."AdminItem" USING btree (category, state);


--
-- Name: AdminItem_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AdminItem_reference_key" ON public."AdminItem" USING btree (reference);


--
-- Name: AdminItem_requestedByUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminItem_requestedByUserId_idx" ON public."AdminItem" USING btree ("requestedByUserId");


--
-- Name: AdminItem_state_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AdminItem_state_dueAt_idx" ON public."AdminItem" USING btree (state, "dueAt");


--
-- Name: Asset_condition_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_condition_idx" ON public."Asset" USING btree (condition);


--
-- Name: Asset_nextServiceOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Asset_nextServiceOn_idx" ON public."Asset" USING btree ("nextServiceOn");


--
-- Name: Asset_tag_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Asset_tag_key" ON public."Asset" USING btree (tag);


--
-- Name: AssignmentAmendment_assignmentId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AssignmentAmendment_assignmentId_at_idx" ON public."AssignmentAmendment" USING btree ("assignmentId", at);


--
-- Name: Assignment_personId_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_personId_startsAt_idx" ON public."Assignment" USING btree ("personId", "startsAt");


--
-- Name: Assignment_postId_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_postId_startsAt_idx" ON public."Assignment" USING btree ("postId", "startsAt");


--
-- Name: Assignment_startsAt_endsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_startsAt_endsAt_idx" ON public."Assignment" USING btree ("startsAt", "endsAt");


--
-- Name: Assignment_state_startsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Assignment_state_startsAt_idx" ON public."Assignment" USING btree (state, "startsAt");


--
-- Name: AuthorityMatter_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuthorityMatter_personId_idx" ON public."AuthorityMatter" USING btree ("personId");


--
-- Name: AuthorityMatter_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "AuthorityMatter_reference_key" ON public."AuthorityMatter" USING btree (reference);


--
-- Name: AuthorityMatter_state_dueOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "AuthorityMatter_state_dueOn_idx" ON public."AuthorityMatter" USING btree (state, "dueOn");


--
-- Name: BookOff_assignmentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BookOff_assignmentId_key" ON public."BookOff" USING btree ("assignmentId");


--
-- Name: BookOn_assignmentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "BookOn_assignmentId_key" ON public."BookOn" USING btree ("assignmentId");


--
-- Name: Candidacy_personId_requirementId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Candidacy_personId_requirementId_key" ON public."Candidacy" USING btree ("personId", "requirementId");


--
-- Name: Candidacy_stage_stageSince_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Candidacy_stage_stageSince_idx" ON public."Candidacy" USING btree (stage, "stageSince");


--
-- Name: CheckCall_assignmentId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "CheckCall_assignmentId_at_idx" ON public."CheckCall" USING btree ("assignmentId", at);


--
-- Name: Client_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Client_name_key" ON public."Client" USING btree (name);


--
-- Name: ContactAttempt_assignmentId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ContactAttempt_assignmentId_at_idx" ON public."ContactAttempt" USING btree ("assignmentId", at);


--
-- Name: DisposalRecord_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DisposalRecord_at_idx" ON public."DisposalRecord" USING btree (at);


--
-- Name: DisposalRecord_rule_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DisposalRecord_rule_at_idx" ON public."DisposalRecord" USING btree (rule, at);


--
-- Name: DocumentRecord_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentRecord_expiresAt_idx" ON public."DocumentRecord" USING btree ("expiresAt");


--
-- Name: DocumentRecord_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentRecord_personId_idx" ON public."DocumentRecord" USING btree ("personId");


--
-- Name: DocumentRecord_typeId_verification_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "DocumentRecord_typeId_verification_idx" ON public."DocumentRecord" USING btree ("typeId", verification);


--
-- Name: Employment_personId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Employment_personId_key" ON public."Employment" USING btree ("personId");


--
-- Name: Employment_pin_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Employment_pin_key" ON public."Employment" USING btree (pin);


--
-- Name: Employment_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Employment_state_idx" ON public."Employment" USING btree (state);


--
-- Name: EquipmentIssue_personId_returnedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "EquipmentIssue_personId_returnedAt_idx" ON public."EquipmentIssue" USING btree ("personId", "returnedAt");


--
-- Name: Event_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_at_idx" ON public."Event" USING btree (at);


--
-- Name: Event_department_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_department_at_idx" ON public."Event" USING btree (department, at);


--
-- Name: Event_personId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_personId_at_idx" ON public."Event" USING btree ("personId", at);


--
-- Name: Event_type_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Event_type_at_idx" ON public."Event" USING btree (type, at);


--
-- Name: FormAnswer_fieldId_valueBool_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_fieldId_valueBool_idx" ON public."FormAnswer" USING btree ("fieldId", "valueBool");


--
-- Name: FormAnswer_fieldId_valueNumber_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormAnswer_fieldId_valueNumber_idx" ON public."FormAnswer" USING btree ("fieldId", "valueNumber");


--
-- Name: FormAnswer_responseId_fieldId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormAnswer_responseId_fieldId_key" ON public."FormAnswer" USING btree ("responseId", "fieldId");


--
-- Name: FormDefinition_key_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormDefinition_key_version_key" ON public."FormDefinition" USING btree (key, version);


--
-- Name: FormField_definitionId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "FormField_definitionId_key_key" ON public."FormField" USING btree ("definitionId", key);


--
-- Name: FormResponse_definitionId_submittedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_definitionId_submittedAt_idx" ON public."FormResponse" USING btree ("definitionId", "submittedAt");


--
-- Name: FormResponse_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "FormResponse_personId_idx" ON public."FormResponse" USING btree ("personId");


--
-- Name: HolidayEntitlement_personId_leaveYearStart_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "HolidayEntitlement_personId_leaveYearStart_key" ON public."HolidayEntitlement" USING btree ("personId", "leaveYearStart");


--
-- Name: HolidayRequest_decision_raisedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "HolidayRequest_decision_raisedAt_idx" ON public."HolidayRequest" USING btree (decision, "raisedAt");


--
-- Name: HolidayRequest_personId_startsOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "HolidayRequest_personId_startsOn_idx" ON public."HolidayRequest" USING btree ("personId", "startsOn");


--
-- Name: Incident_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Incident_at_idx" ON public."Incident" USING btree (at);


--
-- Name: Incident_severity_clientNotified_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Incident_severity_clientNotified_idx" ON public."Incident" USING btree (severity, "clientNotified");


--
-- Name: Interview_candidacyId_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Interview_candidacyId_stage_idx" ON public."Interview" USING btree ("candidacyId", stage);


--
-- Name: Licence_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Licence_expiresAt_idx" ON public."Licence" USING btree ("expiresAt");


--
-- Name: Licence_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Licence_number_key" ON public."Licence" USING btree (number);


--
-- Name: Licence_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Licence_personId_idx" ON public."Licence" USING btree ("personId");


--
-- Name: MaintenanceJob_assetId_reportedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MaintenanceJob_assetId_reportedAt_idx" ON public."MaintenanceJob" USING btree ("assetId", "reportedAt");


--
-- Name: MaintenanceJob_completedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "MaintenanceJob_completedAt_idx" ON public."MaintenanceJob" USING btree ("completedAt");


--
-- Name: NoSignalHandover_assignmentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "NoSignalHandover_assignmentId_key" ON public."NoSignalHandover" USING btree ("assignmentId");


--
-- Name: NoSignalHandover_lossReportedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "NoSignalHandover_lossReportedAt_idx" ON public."NoSignalHandover" USING btree ("lossReportedAt");


--
-- Name: PaymentInstance_dueOn_paidOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PaymentInstance_dueOn_paidOn_idx" ON public."PaymentInstance" USING btree ("dueOn", "paidOn");


--
-- Name: PaymentInstance_recurringPaymentId_dueOn_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PaymentInstance_recurringPaymentId_dueOn_key" ON public."PaymentInstance" USING btree ("recurringPaymentId", "dueOn");


--
-- Name: Penalty_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Penalty_personId_idx" ON public."Penalty" USING btree ("personId");


--
-- Name: Penalty_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Penalty_reference_key" ON public."Penalty" USING btree (reference);


--
-- Name: Penalty_state_raisedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Penalty_state_raisedAt_idx" ON public."Penalty" USING btree (state, "raisedAt");


--
-- Name: PersonIdentityKey_kind_value_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "PersonIdentityKey_kind_value_key" ON public."PersonIdentityKey" USING btree (kind, value);


--
-- Name: PersonIdentityKey_personId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "PersonIdentityKey_personId_idx" ON public."PersonIdentityKey" USING btree ("personId");


--
-- Name: Person_fullName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Person_fullName_idx" ON public."Person" USING btree ("fullName");


--
-- Name: Person_lifecycle_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Person_lifecycle_idx" ON public."Person" USING btree (lifecycle);


--
-- Name: Person_nationalInsurance_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Person_nationalInsurance_key" ON public."Person" USING btree ("nationalInsurance");


--
-- Name: Post_siteId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Post_siteId_name_key" ON public."Post" USING btree ("siteId", name);


--
-- Name: RecurringPayment_active_firstDueOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RecurringPayment_active_firstDueOn_idx" ON public."RecurringPayment" USING btree (active, "firstDueOn");


--
-- Name: ReminderRule_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ReminderRule_key_key" ON public."ReminderRule" USING btree (key);


--
-- Name: Reminder_state_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Reminder_state_dueAt_idx" ON public."Reminder" USING btree (state, "dueAt");


--
-- Name: Requirement_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Requirement_reference_key" ON public."Requirement" USING btree (reference);


--
-- Name: Requirement_status_startDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Requirement_status_startDate_idx" ON public."Requirement" USING btree (status, "startDate");


--
-- Name: RoleDelegation_role_endsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RoleDelegation_role_endsAt_idx" ON public."RoleDelegation" USING btree (role, "endsAt");


--
-- Name: RoleDelegation_toUserId_startsAt_endsAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "RoleDelegation_toUserId_startsAt_endsAt_idx" ON public."RoleDelegation" USING btree ("toUserId", "startsAt", "endsAt");


--
-- Name: ScreeningCheck_fileId_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScreeningCheck_fileId_group_idx" ON public."ScreeningCheck" USING btree ("fileId", "group");


--
-- Name: ScreeningCheck_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScreeningCheck_status_idx" ON public."ScreeningCheck" USING btree (status);


--
-- Name: ScreeningDecision_fileId_kind_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScreeningDecision_fileId_kind_idx" ON public."ScreeningDecision" USING btree ("fileId", kind);


--
-- Name: ScreeningFile_conditionalEmploymentStart_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScreeningFile_conditionalEmploymentStart_idx" ON public."ScreeningFile" USING btree ("conditionalEmploymentStart");


--
-- Name: ScreeningFile_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ScreeningFile_status_idx" ON public."ScreeningFile" USING btree (status);


--
-- Name: SiteReference_siteId_employmentId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SiteReference_siteId_employmentId_key" ON public."SiteReference" USING btree ("siteId", "employmentId");


--
-- Name: SiteReference_siteId_prn_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SiteReference_siteId_prn_key" ON public."SiteReference" USING btree ("siteId", prn);


--
-- Name: Site_clientId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Site_clientId_name_key" ON public."Site" USING btree ("clientId", name);


--
-- Name: StockItem_equipmentItemId_size_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "StockItem_equipmentItemId_size_key" ON public."StockItem" USING btree ("equipmentItemId", size);


--
-- Name: StockMovement_stockItemId_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "StockMovement_stockItemId_at_idx" ON public."StockMovement" USING btree ("stockItemId", at);


--
-- Name: SupplierContract_endsOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SupplierContract_endsOn_idx" ON public."SupplierContract" USING btree ("endsOn");


--
-- Name: SupplierContract_supplierId_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "SupplierContract_supplierId_reference_key" ON public."SupplierContract" USING btree ("supplierId", reference);


--
-- Name: Supplier_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Supplier_name_key" ON public."Supplier" USING btree (name);


--
-- Name: Suspension_endsOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Suspension_endsOn_idx" ON public."Suspension" USING btree ("endsOn");


--
-- Name: Suspension_personId_startsOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Suspension_personId_startsOn_idx" ON public."Suspension" USING btree ("personId", "startsOn");


--
-- Name: UserRole_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "UserRole_role_idx" ON public."UserRole" USING btree (role);


--
-- Name: UserRole_userId_role_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "UserRole_userId_role_key" ON public."UserRole" USING btree ("userId", role);


--
-- Name: User_personId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_personId_key" ON public."User" USING btree ("personId");


--
-- Name: User_ssoSubject_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_ssoSubject_key" ON public."User" USING btree ("ssoSubject");


--
-- Name: Voucher_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Voucher_reference_key" ON public."Voucher" USING btree (reference);


--
-- Name: Voucher_state_expiresOn_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Voucher_state_expiresOn_idx" ON public."Voucher" USING btree (state, "expiresOn");


--
-- Name: WorkItem_ownerUserId_state_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkItem_ownerUserId_state_dueAt_idx" ON public."WorkItem" USING btree ("ownerUserId", state, "dueAt");


--
-- Name: WorkItem_state_dueAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkItem_state_dueAt_idx" ON public."WorkItem" USING btree (state, "dueAt");


--
-- Name: WorkSession_lastSeenAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkSession_lastSeenAt_idx" ON public."WorkSession" USING btree ("lastSeenAt");


--
-- Name: WorkSession_userId_signedInAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "WorkSession_userId_signedInAt_idx" ON public."WorkSession" USING btree ("userId", "signedInAt");


--
-- Name: delegation_one_live_per_role_per_person; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX delegation_one_live_per_role_per_person ON public."RoleDelegation" USING btree (role, "toUserId") WHERE ("revokedAt" IS NULL);


--
-- Name: AdminItem admin_approval_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_approval_complete BEFORE UPDATE ON public."AdminItem" FOR EACH ROW EXECUTE FUNCTION public.enforce_approval_complete();


--
-- Name: AdminApproval admin_approval_separation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER admin_approval_separation BEFORE INSERT OR UPDATE ON public."AdminApproval" FOR EACH ROW EXECUTE FUNCTION public.enforce_approval_separation();


--
-- Name: RoleDelegation delegation_source; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER delegation_source BEFORE INSERT ON public."RoleDelegation" FOR EACH ROW EXECUTE FUNCTION public.enforce_delegation_source();


--
-- Name: DisposalRecord disposal_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER disposal_append_only BEFORE DELETE OR UPDATE ON public."DisposalRecord" FOR EACH ROW EXECUTE FUNCTION public.reject_disposal_mutation();


--
-- Name: DisposalRecord disposal_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER disposal_no_truncate BEFORE TRUNCATE ON public."DisposalRecord" FOR EACH STATEMENT EXECUTE FUNCTION public.reject_disposal_mutation();


--
-- Name: DocumentRecord document_copy_retention; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER document_copy_retention BEFORE INSERT OR UPDATE ON public."DocumentRecord" FOR EACH ROW EXECUTE FUNCTION public.enforce_copy_retention();


--
-- Name: Event event_append_only; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_append_only BEFORE DELETE OR UPDATE ON public."Event" FOR EACH ROW EXECUTE FUNCTION public.reject_event_mutation();


--
-- Name: Event event_no_truncate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER event_no_truncate BEFORE TRUNCATE ON public."Event" FOR EACH STATEMENT EXECUTE FUNCTION public.reject_event_mutation();


--
-- Name: NoSignalHandover no_signal_handover_post; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER no_signal_handover_post BEFORE INSERT ON public."NoSignalHandover" FOR EACH ROW EXECUTE FUNCTION public.enforce_no_signal_post();


--
-- Name: ScreeningFile screening_separation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER screening_separation BEFORE INSERT OR UPDATE ON public."ScreeningFile" FOR EACH ROW EXECUTE FUNCTION public.enforce_screening_separation();


--
-- Name: AccreditationRequirement AccreditationRequirement_accreditationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccreditationRequirement"
    ADD CONSTRAINT "AccreditationRequirement_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES public."Accreditation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AccreditationSubmission AccreditationSubmission_accreditationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AccreditationSubmission"
    ADD CONSTRAINT "AccreditationSubmission_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES public."Accreditation"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AdminApproval AdminApproval_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminApproval"
    ADD CONSTRAINT "AdminApproval_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."AdminItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AdminItem AdminItem_accreditationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_accreditationId_fkey" FOREIGN KEY ("accreditationId") REFERENCES public."Accreditation"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public."Asset"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_authorityMatterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_authorityMatterId_fkey" FOREIGN KEY ("authorityMatterId") REFERENCES public."AuthorityMatter"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_holidayRequestId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_holidayRequestId_fkey" FOREIGN KEY ("holidayRequestId") REFERENCES public."HolidayRequest"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_penaltyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_penaltyId_fkey" FOREIGN KEY ("penaltyId") REFERENCES public."Penalty"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_recurringPaymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES public."RecurringPayment"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_stockItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES public."StockItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AdminItem AdminItem_voucherId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AdminItem"
    ADD CONSTRAINT "AdminItem_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES public."Voucher"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Asset Asset_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Asset"
    ADD CONSTRAINT "Asset_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AssignmentAmendment AssignmentAmendment_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AssignmentAmendment"
    ADD CONSTRAINT "AssignmentAmendment_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Assignment Assignment_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Assignment Assignment_postId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Assignment"
    ADD CONSTRAINT "Assignment_postId_fkey" FOREIGN KEY ("postId") REFERENCES public."Post"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AuthorityMatter AuthorityMatter_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AuthorityMatter"
    ADD CONSTRAINT "AuthorityMatter_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BookOff BookOff_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BookOff"
    ADD CONSTRAINT "BookOff_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BookOn BookOn_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."BookOn"
    ADD CONSTRAINT "BookOn_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Candidacy Candidacy_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Candidacy"
    ADD CONSTRAINT "Candidacy_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Candidacy Candidacy_requirementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Candidacy"
    ADD CONSTRAINT "Candidacy_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES public."Requirement"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CheckCall CheckCall_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CheckCall"
    ADD CONSTRAINT "CheckCall_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactAttempt ContactAttempt_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactAttempt"
    ADD CONSTRAINT "ContactAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: DocumentRecord DocumentRecord_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DocumentRecord DocumentRecord_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DocumentRecord DocumentRecord_screeningFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_screeningFileId_fkey" FOREIGN KEY ("screeningFileId") REFERENCES public."ScreeningFile"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DocumentRecord DocumentRecord_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public."Site"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: DocumentRecord DocumentRecord_typeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DocumentRecord"
    ADD CONSTRAINT "DocumentRecord_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES public."DocumentType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Employment Employment_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Employment"
    ADD CONSTRAINT "Employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EquipmentIssue EquipmentIssue_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EquipmentIssue"
    ADD CONSTRAINT "EquipmentIssue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public."EquipmentItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: EquipmentIssue EquipmentIssue_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EquipmentIssue"
    ADD CONSTRAINT "EquipmentIssue_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Event Event_actorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Event Event_adminItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Event"
    ADD CONSTRAINT "Event_adminItemId_fkey" FOREIGN KEY ("adminItemId") REFERENCES public."AdminItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FormAnswer FormAnswer_fieldId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES public."FormField"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FormAnswer FormAnswer_responseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormAnswer"
    ADD CONSTRAINT "FormAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES public."FormResponse"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FormField FormField_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormField"
    ADD CONSTRAINT "FormField_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public."FormDefinition"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FormResponse FormResponse_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FormResponse FormResponse_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FormResponse FormResponse_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public."FormDefinition"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: FormResponse FormResponse_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: FormResponse FormResponse_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FormResponse"
    ADD CONSTRAINT "FormResponse_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public."Site"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: HolidayEntitlement HolidayEntitlement_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HolidayEntitlement"
    ADD CONSTRAINT "HolidayEntitlement_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: HolidayRequest HolidayRequest_entitlementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HolidayRequest"
    ADD CONSTRAINT "HolidayRequest_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES public."HolidayEntitlement"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: HolidayRequest HolidayRequest_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."HolidayRequest"
    ADD CONSTRAINT "HolidayRequest_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Incident Incident_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Incident"
    ADD CONSTRAINT "Incident_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Interview Interview_candidacyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Interview"
    ADD CONSTRAINT "Interview_candidacyId_fkey" FOREIGN KEY ("candidacyId") REFERENCES public."Candidacy"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Licence Licence_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Licence"
    ADD CONSTRAINT "Licence_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MaintenanceJob MaintenanceJob_assetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MaintenanceJob"
    ADD CONSTRAINT "MaintenanceJob_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES public."Asset"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MaintenanceJob MaintenanceJob_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MaintenanceJob"
    ADD CONSTRAINT "MaintenanceJob_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: NoSignalHandover NoSignalHandover_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."NoSignalHandover"
    ADD CONSTRAINT "NoSignalHandover_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."Assignment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PaymentInstance PaymentInstance_recurringPaymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PaymentInstance"
    ADD CONSTRAINT "PaymentInstance_recurringPaymentId_fkey" FOREIGN KEY ("recurringPaymentId") REFERENCES public."RecurringPayment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Penalty Penalty_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Penalty"
    ADD CONSTRAINT "Penalty_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PersonIdentityKey PersonIdentityKey_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PersonIdentityKey"
    ADD CONSTRAINT "PersonIdentityKey_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Post Post_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Post"
    ADD CONSTRAINT "Post_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public."Site"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RecurringPayment RecurringPayment_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RecurringPayment"
    ADD CONSTRAINT "RecurringPayment_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Reminder Reminder_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Reminder"
    ADD CONSTRAINT "Reminder_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES public."ReminderRule"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Requirement Requirement_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Requirement"
    ADD CONSTRAINT "Requirement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Requirement Requirement_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Requirement"
    ADD CONSTRAINT "Requirement_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public."Site"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RoleDelegation RoleDelegation_fromUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoleDelegation"
    ADD CONSTRAINT "RoleDelegation_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: RoleDelegation RoleDelegation_grantedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoleDelegation"
    ADD CONSTRAINT "RoleDelegation_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: RoleDelegation RoleDelegation_toUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."RoleDelegation"
    ADD CONSTRAINT "RoleDelegation_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScreeningCheck ScreeningCheck_fileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningCheck"
    ADD CONSTRAINT "ScreeningCheck_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES public."ScreeningFile"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScreeningDecision ScreeningDecision_fileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningDecision"
    ADD CONSTRAINT "ScreeningDecision_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES public."ScreeningFile"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScreeningFile ScreeningFile_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScreeningFile"
    ADD CONSTRAINT "ScreeningFile_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SiteReference SiteReference_employmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteReference"
    ADD CONSTRAINT "SiteReference_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES public."Employment"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SiteReference SiteReference_siteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SiteReference"
    ADD CONSTRAINT "SiteReference_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES public."Site"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Site Site_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Site"
    ADD CONSTRAINT "Site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."Client"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: StockItem StockItem_equipmentItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StockItem"
    ADD CONSTRAINT "StockItem_equipmentItemId_fkey" FOREIGN KEY ("equipmentItemId") REFERENCES public."EquipmentItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: StockMovement StockMovement_stockItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."StockMovement"
    ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES public."StockItem"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SupplierContract SupplierContract_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SupplierContract"
    ADD CONSTRAINT "SupplierContract_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Suspension Suspension_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Suspension"
    ADD CONSTRAINT "Suspension_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UserRole UserRole_grantedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UserRole UserRole_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRole"
    ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: User User_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Voucher Voucher_personId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Voucher"
    ADD CONSTRAINT "Voucher_personId_fkey" FOREIGN KEY ("personId") REFERENCES public."Person"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkItem WorkItem_adminItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_adminItemId_fkey" FOREIGN KEY ("adminItemId") REFERENCES public."AdminItem"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkItem WorkItem_definitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES public."WorkItemDefinition"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkItem WorkItem_ownerUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkItem WorkItem_requirementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES public."Requirement"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkItem WorkItem_screeningFileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkItem"
    ADD CONSTRAINT "WorkItem_screeningFileId_fkey" FOREIGN KEY ("screeningFileId") REFERENCES public."ScreeningFile"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WorkSession WorkSession_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WorkSession"
    ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xaYb9XgQr7w6LnRxB6uhXPfGFMr0grBYPgcy2dvT09K9BwZUWQrpy8r4CNMWwSw

