/**
 * Seed.
 *
 * Two jobs, and they are different in kind.
 *
 * 1. CONFIGURATION — document types, form definitions, reminder rules, service
 *    levels. These are not demonstration data: they are the real registries,
 *    read straight out of lib/core so there is exactly one place they are
 *    written down. Once the platform is live these move into the database for
 *    good and the code imports stop.
 *
 * 2. DEMONSTRATION DATA — the people, sites, shifts and screening files, read
 *    out of lib/mock so the seeded database matches what the screens already
 *    show. Invented, and replaced by a real load at R1 (decision E9).
 *
 * Run: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import { DOCUMENT_TYPES } from "../lib/core/documents";
import { FORM_DEFINITIONS } from "../lib/core/forms";
import { OPS_RULES } from "../lib/core/ops";
import { CHASERS, EXPIRY_WARNING_DAYS, STAGE_SLA_DAYS } from "../lib/sla";
import { RETENTION } from "../lib/bs7858";
import {
  candidates,
  clients,
  interviews,
  officers,
  requirements,
  screeningFiles,
  siteReferences,
  sites,
  tasks,
  users,
} from "../lib/mock/data";
import {
  assignments,
  bookOns,
  checkCalls,
  contactAttempts,
  disposalLog,
  documents,
  events,
  incidents,
  personName,
  posts,
  workItemDefinitions,
} from "../lib/mock/ops";
import {
  ADMIN_TABLES,
  seedAdminConfiguration,
  seedAdminDemonstration,
} from "./seed-admin";

const db = new PrismaClient();

/** Deterministic, so re-seeding does not shuffle ages. */
function dobFor(personId: string): Date {
  const n = personId.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const year = 1972 + (n % 28);
  const month = n % 12;
  const day = 1 + (n % 27);
  return new Date(Date.UTC(year, month, day));
}

const userIdByName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
const userId = (name: string | null | undefined) =>
  name ? (userIdByName.get(name.toLowerCase()) ?? null) : null;

async function reset() {
  // The append-only triggers refuse DELETE, so they come off for the duration
  // and go straight back on. Only a seed may do this; nothing in the
  // application can, which is the point of enforcing it in the database.
  await db.$executeRawUnsafe('ALTER TABLE "Event" DISABLE TRIGGER event_append_only');
  await db.$executeRawUnsafe('ALTER TABLE "DisposalRecord" DISABLE TRIGGER disposal_append_only');
  try {
    // Event and DisposalRecord go FIRST, before User.
    //
    // Event.actorUserId is an optional relation, so deleting a user sets it to
    // null — and `event_has_actor` then refuses the row, because an event with
    // no actor is an event nobody did. The constraint is right and the delete
    // order is what has to change. The same rule applies in the application:
    // a user who has done anything is deactivated (`active = false`), never
    // deleted, because deleting them would either void their attribution or be
    // refused.
    for (const table of [
      "Event", "DisposalRecord",
      // Admin first, because its rows point at WorkItem, Setting and Person.
      ...ADMIN_TABLES,
      "FormAnswer", "FormResponse", "FormField", "FormDefinition",
      "ContactAttempt", "CheckCall", "BookOff", "BookOn", "Incident",
      "AssignmentAmendment", "Assignment",
      "WorkItem", "WorkItemDefinition", "Reminder", "ReminderRule",
      "ScreeningDecision", "ScreeningCheck",
      "DocumentRecord", "ScreeningFile", "DocumentType",
      "Interview", "Candidacy", "Requirement",
      "SiteReference", "Employment", "Licence",
      "Post", "Site", "Client",
      "UserRole", "WorkSession", "User",
      "PersonIdentityKey", "Person",
      "Setting",
    ]) {
      await db.$executeRawUnsafe(`DELETE FROM "${table}"`);
    }
  } finally {
    await db.$executeRawUnsafe('ALTER TABLE "Event" ENABLE TRIGGER event_append_only');
    await db.$executeRawUnsafe('ALTER TABLE "DisposalRecord" ENABLE TRIGGER disposal_append_only');
  }
}

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

async function seedConfiguration() {
  await db.documentType.createMany({
    data: DOCUMENT_TYPES.map((t) => ({
      id: t.id,
      label: t.label,
      department: t.department,
      expires: t.expires,
      copyRetained: t.copyRetained,
      retentionNote: t.retentionNote,
      clause: t.clause ?? null,
    })),
  });

  for (const form of FORM_DEFINITIONS) {
    await db.formDefinition.create({
      data: {
        id: form.id,
        key: form.id,
        version: form.version,
        title: form.title,
        purpose: form.purpose,
        department: form.department,
        filledBy: form.filledBy,
        trigger: form.trigger,
        fields: {
          create: form.fields.map((f, i) => ({
            key: f.id,
            label: f.label,
            kind: f.kind,
            required: f.required,
            position: i,
            feedsKpi: f.feedsKpi ?? null,
          })),
        },
      },
    });
  }

  await db.workItemDefinition.createMany({
    data: workItemDefinitions.map((w) => ({
      id: w.id,
      title: w.title,
      department: w.department,
      recurrence: w.recurrence,
      slaDays: w.slaDays,
      ownerRole: w.ownerRole as never,
      escalatesTo: w.escalatesTo as never,
    })),
  });

  await db.reminderRule.createMany({
    data: [
      { key: "document_expiry", label: "Document expiry warnings", subject: "DocumentRecord.expiresAt", offsets: EXPIRY_WARNING_DAYS.map((d) => -d), channel: "email" },
      { key: "chase_application", label: "Application chaser", subject: "Candidacy.stage", offsets: [...CHASERS.application.days], channel: "email" },
      { key: "chase_documents", label: "Document chaser", subject: "DocumentRecord.verification", offsets: [...CHASERS.documents.days], channel: "email" },
      { key: "chase_signatures", label: "Welcome pack signature chaser", subject: "FormResponse.completedAt", offsets: [...CHASERS.signatures.days], channel: "email" },
      { key: "chase_reference", label: "Employment reference chaser", subject: "ScreeningCheck.firstRequestSentAt", offsets: [0, CHASERS.reference.secondRequestDay, CHASERS.reference.documentaryRouteDay], channel: "email" },
      { key: "screening_clock", label: "Screening deadline warnings", subject: "ScreeningFile.conditionalEmploymentStart", offsets: [-28, -14, -7, 0], channel: "email", escalatesTo: "top_management" },
      { key: "retention_sweep", label: "Retention and disposal sweep", subject: "ScreeningFile.retainUntil", offsets: [0], channel: "task", escalatesTo: "vetting_controller" },
    ],
  });

  // Our numbers, not the standard's. The standard's live in lib/bs7858.ts and
  // are deliberately absent here — a fixed rule in a settings table is a rule
  // someone can edit.
  await db.setting.createMany({
    data: [
      { key: "ops.bookOnGraceMinutes", value: String(OPS_RULES.bookOnGraceMinutes), label: "Book-on grace period (minutes)", usedBy: "Live operations" },
      { key: "ops.bookOnNoShowMinutes", value: String(OPS_RULES.bookOnNoShowMinutes), label: "Treated as a no-show after (minutes)", usedBy: "Live operations" },
      { key: "ops.checkCallIntervalMinutes", value: String(OPS_RULES.checkCallIntervalMinutes), label: "Check call interval (minutes)", usedBy: "Live operations" },
      { key: "retention.unsuccessfulApplicantMonths", value: String(RETENTION.unsuccessfulApplicantMonths), label: "Retention — unsuccessful applicants (months)", usedBy: "Retention sweep" },
      { key: "retention.afterCessationYears", value: String(RETENTION.afterCessationYears), label: "Retention — after employment ends (years)", usedBy: "Retention sweep" },
      { key: "expiry.warningDays", value: EXPIRY_WARNING_DAYS.join(","), valueType: "list", label: "Expiry warnings at (days before)", usedBy: "Scheduler" },
      { key: "sla.stageDays", value: JSON.stringify(STAGE_SLA_DAYS), valueType: "json", label: "Recruitment stage service levels (working days)", usedBy: "Work queue" },
    ],
  });
}

// ---------------------------------------------------------------------------
// 2. Demonstration data
// ---------------------------------------------------------------------------

async function seedPeople() {
  const staff = users.map((u) => ({ personId: u.personId, name: u.name }));
  const officerPeople = officers.map((o) => ({ personId: o.personId, name: o.siaBadgeName }));
  const candidatePeople = candidates.map((c) => ({ personId: c.personId, name: c.fullName }));

  const seen = new Set<string>();
  const people: { personId: string; name: string }[] = [];
  for (const p of [...staff, ...officerPeople, ...candidatePeople]) {
    if (seen.has(p.personId)) continue;
    seen.add(p.personId);
    people.push(p);
  }

  await db.person.createMany({
    data: people.map((p, i) => ({
      id: p.personId,
      fullName: p.name,
      dateOfBirth: dobFor(p.personId),
      lifecycle: p.personId.startsWith("hr") || p.personId.startsWith("ct")
        ? "confirmed_officer"
        : "candidate",
      email: `${p.name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      phone: `07700 9${String(100 + i).padStart(5, "0")}`,
      nationalInsurance: `QQ${String(100000 + i * 7).slice(0, 6)}C`,
    })),
  });

  // The duplicate-check keys, normalised. Written here because the constraint
  // that stops a duplicate lives on this table, not in the code that calls it.
  await db.personIdentityKey.createMany({
    data: people.flatMap((p, i) => [
      { personId: p.personId, kind: "name_and_dob" as const, value: `${p.name.toLowerCase().replace(/\s+/g, "")}|${dobFor(p.personId).toISOString().slice(0, 10)}` },
      { personId: p.personId, kind: "national_insurance" as const, value: `QQ${String(100000 + i * 7).slice(0, 6)}C` },
    ]),
  });

  await db.user.createMany({
    data: users.map((u) => ({
      id: u.id,
      personId: u.personId,
      displayName: u.name,
      ownScreeningComplete: u.ownScreeningComplete,
      confidentialityAgreementOnFile: u.confidentialityAgreementOnFile,
      trainingReviewedAt: u.trainingReviewedAt ? new Date(u.trainingReviewedAt) : null,
    })),
  });

  await db.userRole.createMany({
    data: users.flatMap((u) =>
      u.roles.map((r) => ({
        userId: u.id,
        role: r as never,
        grantedById: "u5",
        grantBasis: "Own screening complete, NDA on file, training in date (6.1, 6.2)",
      })),
    ),
  });

  await db.employment.createMany({
    data: officers.map((o) => ({
      id: o.id,
      personId: o.personId,
      pin: o.pin,
      state: o.employmentState === "conditional" ? "conditional" : "confirmed",
      controlTeam: o.control,
      startedAt: new Date(Date.now() - 400 * 86_400_000),
    })),
  });

  const licenceHolders = [
    ...officers.map((o) => ({ personId: o.personId, number: o.siaLicenceNumber, name: o.siaBadgeName, expiry: o.siaLicenceExpiry })),
    ...candidates
      .filter((c) => c.siaLicenceNumber && c.siaLicenceExpiry && !officers.some((o) => o.personId === c.personId))
      .map((c) => ({ personId: c.personId, number: c.siaLicenceNumber!, name: c.siaBadgeName ?? c.fullName, expiry: c.siaLicenceExpiry! })),
  ];
  await db.licence.createMany({
    data: licenceHolders.map((l) => ({
      personId: l.personId,
      kind: "sia_security_guarding",
      number: l.number,
      nameOnBadge: l.name,
      expiresAt: new Date(l.expiry),
      lastVerifiedAt: new Date(Date.now() - 12 * 3_600_000),
      registerStatus: "Active",
    })),
  });
}

async function seedPlaces() {
  await db.client.createMany({
    data: clients.map((c) => ({
      id: c.id,
      name: c.name,
      screeningPeriodYears: c.screeningPeriodYears,
      requiresAdditionalInterview: c.requiresAdditionalInterview,
      regulatedActivity: c.regulatedActivity,
    })),
  });
  await db.site.createMany({
    data: sites.map((s) => ({ id: s.id, clientId: s.clientId, name: s.name })),
  });
  await db.post.createMany({
    data: posts.map((p) => ({
      id: p.id,
      siteId: p.siteId,
      name: p.name,
      pattern: p.pattern,
      requiresSiaLicence: p.requiresSiaLicence,
      screeningPeriodYears: p.screeningPeriodYears,
      checkCallsRequired: p.checkCallsRequired,
      loneWorking: p.loneWorking,
    })),
  });
  await db.siteReference.createMany({
    data: siteReferences.map((r) => ({
      siteId: r.siteId,
      employmentId: r.officerId,
      prn: r.prn,
    })),
  });
}

async function seedRecruitment() {
  await db.requirement.createMany({
    data: requirements.map((r) => ({
      id: r.id,
      reference: r.reference,
      clientId: r.clientId,
      siteId: r.siteId,
      controlTeam: r.control,
      post: r.post,
      headcountRequired: r.headcountRequired,
      shiftPattern: r.shiftPattern,
      startDate: new Date(r.startDate),
      status: r.status,
      receivedAt: new Date(r.receivedAt),
      releasedToSourcingAt: r.releasedToSourcingAt ? new Date(r.releasedToSourcingAt) : null,
      ownerUserId: userId(r.owner),
    })),
  });

  await db.candidacy.createMany({
    data: candidates.map((c) => ({
      id: c.id,
      personId: c.personId,
      requirementId: c.requirementId,
      stage: c.stage,
      stageSince: new Date(c.stageSince),
      source: c.source,
      ownerUserId: userId(c.owner),
    })),
  });

  await db.interview.createMany({
    data: interviews.map((i) => ({
      id: i.id,
      candidacyId: i.candidateId,
      stage: i.stage,
      interviewerUserId: userId(i.interviewer),
      heldAt: new Date(i.heldAt),
      outcome: i.outcome,
      notes: i.notes,
    })),
  });
}

async function seedVetting() {
  for (const f of screeningFiles) {
    const candidate = candidates.find((c) => c.id === f.candidateId);
    if (!candidate) continue;
    await db.screeningFile.create({
      data: {
        id: f.id,
        personId: candidate.personId,
        screeningPeriodYears: f.screeningPeriodYears,
        status: f.status === "withdrawn" ? "withdrawn" : f.status,
        conditionalEmploymentStart: f.conditionalEmploymentStart ? new Date(f.conditionalEmploymentStart) : null,
        extensionWeeks: f.extensionWeeks,
        extensionApprovedById: f.extensionWeeks > 0 ? userId(f.extensionApprovedBy) ?? "u5" : null,
        extensionApprovedAt: f.extensionWeeks > 0 ? new Date(Date.now() - 20 * 86_400_000) : null,
        administratorUserId: userId(f.administrator),
        controllerUserId: userId(f.controller),
        controllerReview1At: f.controllerReview1At ? new Date(f.controllerReview1At) : null,
        controllerReview2At: f.controllerReview2At ? new Date(f.controllerReview2At) : null,
        unverifiedDays: f.unverifiedDays,
        gapsOver31Days: f.gapsOver31Days,
        checks: {
          create: f.checks.map((c) => ({
            group: c.group,
            label: c.label,
            clause: c.clause,
            status: c.status,
            ownerUserId: userId(c.owner),
            firstRequestSentAt: c.firstRequestSentAt ? new Date(c.firstRequestSentAt) : null,
            secondRequestSentAt: c.secondRequestSentAt ? new Date(c.secondRequestSentAt) : null,
            confirmedAt: c.confirmedAt ? new Date(c.confirmedAt) : null,
          })),
        },
      },
    });
  }

  // A risk acceptance that has to be attributable to a named person [7.4f].
  await db.screeningDecision.create({
    data: {
      fileId: screeningFiles[2].id,
      kind: "risk_acceptance",
      decidedById: "u5",
      decidedAt: new Date(Date.now() - 3 * 86_400_000),
      rationale:
        "CCJ of £14,200 satisfied in full 18 months ago, unrelated to the intended role, and the officer disclosed it at application. Accepted with annual review.",
      amountGbp: 14200,
    },
  });
}

async function seedDocuments() {
  const personIds = new Set((await db.person.findMany({ select: { id: true } })).map((p) => p.id));
  const siteIds = new Set(sites.map((s) => s.id));
  const clientIds = new Set(clients.map((c) => c.id));

  await db.documentRecord.createMany({
    data: documents
      .map((d) => {
        const owner = d.ownerRef;
        return {
          id: d.id,
          typeId: d.typeId,
          personId: personIds.has(owner) ? owner : null,
          siteId: siteIds.has(owner) ? owner : null,
          clientId: clientIds.has(owner) ? owner : null,
          verification: d.verification,
          // The types that forbid a copy get no storage key. The database
          // enforces this too — see prisma/constraints.sql §4.
          storageKey: d.typeId === "criminal_record_outcome" ? null : `s3://leon-docs/${d.id}`,
          suppliedAt: d.suppliedAt ? new Date(d.suppliedAt) : null,
          verifiedAt: d.verifiedAt ? new Date(d.verifiedAt) : null,
          expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        };
      })
      .filter((d) => d.personId || d.siteId || d.clientId),
  });
}

async function seedOperations() {
  for (const a of assignments) {
    await db.assignment.create({
      data: {
        id: a.id,
        personId: a.personId,
        postId: a.postId,
        startsAt: new Date(a.startsAt),
        endsAt: new Date(a.endsAt),
        state: a.state,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
        publishedById: a.publishedAt ? "u6" : null,
        amendments: {
          create: a.amendments.map((m) => ({
            at: new Date(m.at),
            byUserId: userId(m.by === "Control Alpha" ? "Control Alpha desk" : m.by),
            change: m.change,
            reason: m.reason,
            previousPersonId: m.previousPersonId,
          })),
        },
      },
    });
  }

  await db.bookOn.createMany({
    data: bookOns.map((b) => ({
      assignmentId: b.assignmentId,
      at: new Date(b.at),
      channel: b.channel,
      locationVerified: b.locationVerified,
    })),
  });

  await db.checkCall.createMany({
    data: checkCalls.map((c) => ({
      id: c.id,
      assignmentId: c.assignmentId,
      at: new Date(c.at),
      channel: c.channel,
      allWell: c.allWell,
      note: c.note,
      takenByUserId: "u6",
    })),
  });

  await db.contactAttempt.createMany({
    data: contactAttempts.map((a) => ({
      id: a.id,
      assignmentId: a.assignmentId,
      at: new Date(a.at),
      byUserId: userId(a.by),
      channel: a.channel,
      reached: a.reached,
      note: a.note,
    })),
  });

  await db.incident.createMany({
    data: incidents.map((i) => ({
      id: i.id,
      assignmentId: i.assignmentId,
      at: new Date(i.at),
      severity: i.severity,
      summary: i.summary,
      clientNotified: i.clientNotified,
      clientNotifiedAt: i.clientNotified ? new Date(i.at) : null,
    })),
  });
}

/**
 * Records whose retention clock has started.
 *
 * The retention queue is DERIVED from these rather than maintained as a list,
 * which is the only way it can be right: a withdrawn applicant is due for
 * disposal 12 months after their application closed, and a leaver 7 years
 * after employment ceased. Both dates are already in the data.
 */
async function seedRetentionSubjects() {
  const withdrawn = [
    { id: "pw1", name: "Withdrawn Applicant A", closedDaysAgo: 400 },
    { id: "pw2", name: "Withdrawn Applicant B", closedDaysAgo: 372 },
    { id: "pw3", name: "Withdrawn Applicant C", closedDaysAgo: 350 },
  ];
  const leavers = [
    { id: "pl1", name: "Former Officer A", pin: "2201", endedDaysAgo: 2570 },
    { id: "pl2", name: "Former Officer B", pin: "2204", endedDaysAgo: 2500 },
  ];

  await db.person.createMany({
    data: [...withdrawn, ...leavers].map((p, i) => ({
      id: p.id,
      fullName: p.name,
      dateOfBirth: dobFor(p.id),
      lifecycle: "leaver" as const,
      nationalInsurance: `QQ${String(900000 + i * 11).slice(0, 6)}C`,
    })),
  });

  await db.candidacy.createMany({
    data: withdrawn.map((w) => ({
      id: `cw-${w.id}`,
      personId: w.id,
      stage: "withdrawn" as const,
      stageSince: new Date(Date.now() - w.closedDaysAgo * 86_400_000),
      withdrawnReason: "Unsuccessful at preliminary checks",
    })),
  });

  await db.employment.createMany({
    data: leavers.map((l) => ({
      personId: l.id,
      pin: l.pin,
      state: "ended" as const,
      startedAt: new Date(Date.now() - (l.endedDaysAgo + 900) * 86_400_000),
      endedAt: new Date(Date.now() - l.endedDaysAgo * 86_400_000),
      leaverReason: "Resigned",
    })),
  });
}

async function seedWork() {
  const personByName = new Map(
    candidates.map((c) => [c.fullName.toLowerCase(), c.personId]),
  );
  await db.workItem.createMany({
    data: tasks.map((t) => {
      const personId = personByName.get(t.subjectName.toLowerCase()) ?? null;
      return {
        id: t.id,
        title: t.title,
        state: t.blocked ? ("blocked" as const) : ("open" as const),
        personId,
        // Exactly one subject, so where the person is unknown the item hangs
        // off the requirement instead. The database rejects both or neither.
        requirementId: personId ? null : "r1",
        ownerUserId: userId(t.owner),
        dueAt: new Date(t.dueAt),
        slaDays: t.slaDays,
        createdAt: new Date(t.createdAt),
        blockedReason: t.blockedReason,
      };
    }),
  });
}

async function seedEventsAndDisposals() {
  await db.event.createMany({
    data: events.map((e) => {
      const uid = userId(e.actorName);
      return {
        id: e.id,
        at: new Date(e.at),
        type: e.type,
        actorUserId: uid,
        actorRole: uid ? (users.find((u) => u.id === uid)!.roles[0] as never) : null,
        actorSystem: uid ? null : e.actorName,
        department: e.department,
        detail: e.detail,
        personId: null,
        assignmentId: assignments.some((a) => a.id === e.subjectRef) ? e.subjectRef : null,
      };
    }),
  });

  await db.disposalRecord.createMany({
    data: disposalLog.map((d) => ({
      id: d.id,
      at: new Date(d.at),
      rule: d.rule.startsWith("12")
        ? "unsuccessful_applicant_12_months"
        : d.rule.startsWith("7")
          ? "after_cessation_7_years"
          : "document_type_rule",
      subjectDescription: d.subjectDescription,
      itemsDestroyed: d.itemsDestroyed,
      retainedInstead: d.retainedInstead,
      performedBySystem: d.performedBy.startsWith("Retention sweep") ? "retention-sweep" : null,
      performedByUserId: d.performedBy.startsWith("Retention sweep") ? null : "u4",
      verifiedByUserId: d.performedBy.includes("verified") ? "u3" : null,
    })),
  });
}

async function main() {
  console.log(`Seeding. ${personName("p1")} and friends.`);
  await reset();
  await seedConfiguration();
  await seedPeople();
  await seedPlaces();
  await seedRecruitment();
  await seedVetting();
  await seedDocuments();
  await seedRetentionSubjects();
  await seedOperations();
  await seedWork();
  await seedAdminConfiguration(db);
  await seedAdminDemonstration(
    db,
    (name) => {
      const id = userId(name);
      if (!id) throw new Error(`Seed expects a user called ${name}`);
      return id;
    },
    (name) => {
      const user = users.find((u) => u.name.toLowerCase() === name.toLowerCase());
      if (user) return user.personId;
      const officer = officers.find(
        (o) => o.siaBadgeName.toLowerCase() === name.toLowerCase(),
      );
      return officer ? officer.personId : null;
    },
  );
  await seedEventsAndDisposals();

  const counts = {
    people: await db.person.count(),
    users: await db.user.count(),
    posts: await db.post.count(),
    assignments: await db.assignment.count(),
    checkCalls: await db.checkCall.count(),
    screeningFiles: await db.screeningFile.count(),
    checks: await db.screeningCheck.count(),
    documents: await db.documentRecord.count(),
    formFields: await db.formField.count(),
    workItems: await db.workItem.count(),
    events: await db.event.count(),
    disposals: await db.disposalRecord.count(),
    settings: await db.setting.count(),
    dueForDisposal: await db.candidacy.count({ where: { stage: "withdrawn" } }),
    adminItems: await db.adminItem.count(),
    adminApprovals: await db.adminApproval.count(),
    suppliers: await db.supplier.count(),
    paymentInstances: await db.paymentInstance.count(),
    assets: await db.asset.count(),
    holidayRequests: await db.holidayRequest.count(),
    stockLines: await db.stockItem.count(),
    stockMovements: await db.stockMovement.count(),
    accreditations: await db.accreditation.count(),
    roleDelegations: await db.roleDelegation.count(),
  };
  console.table(counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
