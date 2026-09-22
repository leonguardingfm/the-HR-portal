/**
 * The read layer.
 *
 * Every query returns the domain types in lib/core and lib/types — ISO strings,
 * not Date objects — so the rule modules (lib/bs7858.ts, lib/policy.ts,
 * lib/core/ops.ts, lib/core/deployability.ts) work unchanged against database
 * rows and against anything else. The rules do not know where their input came
 * from, which is the point: they are the same rules in a test, in a screen and
 * in a background job.
 *
 * Dates cross the server/client boundary as strings deliberately. A Date in a
 * server-component prop is serialised and comes back as a string anyway, so
 * pretending otherwise just moves the bug.
 */

import { RETENTION } from "../bs7858";
import { evaluateDeployability } from "../core/deployability";
import type { Deployability } from "../core/deployability";
import { canPublishAssignment } from "../core/deployability";
import { evaluateDeploymentGate } from "../policy";
import type {
  Assignment,
  BookOn,
  CheckCall,
  ContactAttempt,
  DocumentRecord,
  EventRecord,
  Post,
} from "../core/types";
import type { DeployabilityInput } from "../core/deployability";
import type { NoSignalHandover } from "../core/ops";
import type { Check, Role, ScreeningFile, ScreeningPeriodYears } from "../types";
import { db } from "./client";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const isoRequired = (d: Date) => d.toISOString();

// ---------------------------------------------------------------------------
// Live operations
// ---------------------------------------------------------------------------

export interface LiveRow {
  assignment: Assignment;
  post: Post;
  siteName: string;
  clientName: string;
  personName: string;
  pin: string | null;
  bookOn: BookOn | undefined;
  calls: CheckCall[];
  attempts: ContactAttempt[];
  /** Only present on a post with no mobile signal. */
  noSignal: NoSignalHandover | undefined;
}

/** Shifts that touch now, plus anything starting inside the window. */
export async function getLiveRows(windowHours = 6, now = new Date()): Promise<LiveRow[]> {
  const rows = await db.assignment.findMany({
    where: {
      state: { notIn: ["draft", "cancelled"] },
      endsAt: { gt: now },
      startsAt: { lt: new Date(now.getTime() + windowHours * 3_600_000) },
    },
    orderBy: { startsAt: "asc" },
    include: {
      post: { include: { site: { include: { client: true } } } },
      person: { include: { employment: true } },
      bookOn: true,
      checkCalls: { orderBy: { at: "desc" } },
      attempts: { orderBy: { at: "desc" } },
      noSignal: true,
    },
  });

  return rows.map((a) => ({
    assignment: {
      id: a.id,
      personId: a.personId,
      postId: a.postId,
      startsAt: isoRequired(a.startsAt),
      endsAt: isoRequired(a.endsAt),
      state: a.state,
      publishedAt: iso(a.publishedAt),
      amendments: [],
    },
    post: {
      id: a.post.id,
      siteId: a.post.siteId,
      name: a.post.name,
      pattern: a.post.pattern ?? "",
      requiresSiaLicence: a.post.requiresSiaLicence,
      screeningPeriodYears: a.post.screeningPeriodYears as ScreeningPeriodYears,
      checkCallsRequired: a.post.checkCallsRequired,
      loneWorking: a.post.loneWorking,
      mobileSignal: a.post.mobileSignal,
    },
    noSignal: a.noSignal
      ? {
          assignmentId: a.id,
          notifiedAt: iso(a.noSignal.notifiedAt),
          lossReportedAt: iso(a.noSignal.lossReportedAt),
        }
      : undefined,
    siteName: a.post.site.name,
    clientName: a.post.site.client.name,
    personName: a.person.fullName,
    pin: a.person.employment?.pin ?? null,
    bookOn: a.bookOn
      ? {
          assignmentId: a.bookOn.assignmentId,
          at: isoRequired(a.bookOn.at),
          channel: a.bookOn.channel,
          locationVerified: a.bookOn.locationVerified,
        }
      : undefined,
    calls: a.checkCalls.map((c) => ({
      id: c.id,
      assignmentId: c.assignmentId,
      at: isoRequired(c.at),
      channel: c.channel,
      allWell: c.allWell,
      note: c.note,
    })),
    attempts: a.attempts.map((t) => ({
      id: t.id,
      assignmentId: t.assignmentId,
      at: isoRequired(t.at),
      by: t.byUserId ?? "Control",
      channel: t.channel,
      reached: t.reached,
      note: t.note,
    })),
  }));
}

export interface IncidentRow {
  id: string;
  at: string;
  severity: "log_only" | "notable" | "serious";
  summary: string;
  reportedBy: string;
  clientNotified: boolean;
  siteName: string | null;
}

export async function getOpenIncidents(sinceHours = 48): Promise<IncidentRow[]> {
  const rows = await db.incident.findMany({
    where: { at: { gte: new Date(Date.now() - sinceHours * 3_600_000) } },
    orderBy: { at: "desc" },
    include: {
      assignment: { include: { person: true, post: { include: { site: true } } } },
    },
  });
  return rows.map((i) => ({
    id: i.id,
    at: isoRequired(i.at),
    severity: i.severity,
    summary: i.summary,
    reportedBy: i.assignment?.person.fullName ?? "Control",
    clientNotified: i.clientNotified,
    siteName: i.assignment?.post.site.name ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export interface RotaRow {
  assignment: Assignment;
  post: Post;
  siteName: string;
  personName: string;
  pin: string | null;
}

export async function getRotaRows(days = 7, now = new Date()): Promise<RotaRow[]> {
  const rows = await db.assignment.findMany({
    where: {
      state: { not: "cancelled" },
      endsAt: { gt: now },
      startsAt: { lt: new Date(now.getTime() + days * 86_400_000) },
    },
    orderBy: { startsAt: "asc" },
    include: {
      post: { include: { site: true } },
      person: { include: { employment: true } },
      amendments: { orderBy: { at: "desc" } },
    },
  });

  return rows.map((a) => ({
    assignment: {
      id: a.id,
      personId: a.personId,
      postId: a.postId,
      startsAt: isoRequired(a.startsAt),
      endsAt: isoRequired(a.endsAt),
      state: a.state,
      publishedAt: iso(a.publishedAt),
      amendments: a.amendments.map((m) => ({
        at: isoRequired(m.at),
        by: m.byUserId ?? "Control",
        change: m.change,
        reason: m.reason,
        previousPersonId: m.previousPersonId,
      })),
    },
    post: {
      id: a.post.id,
      siteId: a.post.siteId,
      name: a.post.name,
      pattern: a.post.pattern ?? "",
      requiresSiaLicence: a.post.requiresSiaLicence,
      screeningPeriodYears: a.post.screeningPeriodYears as ScreeningPeriodYears,
      checkCallsRequired: a.post.checkCallsRequired,
      loneWorking: a.post.loneWorking,
      mobileSignal: a.post.mobileSignal,
    },
    siteName: a.post.site.name,
    personName: a.person.fullName,
    pin: a.person.employment?.pin ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Deployability — derived, never stored
// ---------------------------------------------------------------------------

/**
 * The inputs the deployability rule needs, per person.
 *
 * There is no `deployable` column to read, by design, so this assembles the
 * question from the screening file and the dated documents every time it is
 * asked. That is the whole reason it cannot be stale.
 */
export async function getDeployabilityInputs(): Promise<
  Map<string, { input: DeployabilityInput; personName: string }>
> {
  const people = await db.person.findMany({
    where: {
      OR: [{ employment: { isNot: null } }, { candidacies: { some: { stage: "deployed" } } }],
    },
    include: {
      employment: true,
      licences: { orderBy: { expiresAt: "asc" } },
      documents: { include: { type: true } },
      screeningFile: { include: { checks: true } },
      candidacies: { include: { interviews: true } },
    },
  });

  const out = new Map<string, { input: DeployabilityInput; personName: string }>();

  for (const p of people) {
    const file = p.screeningFile[0];
    const rtw = p.documents.find((d) => d.typeId === "right_to_work");
    const visa = p.documents.find((d) => d.typeId === "visa");
    // Whichever runs out first is the one that stops them working.
    const rtwExpiry =
      [rtw?.expiresAt, visa?.expiresAt].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ??
      null;

    let gateOpen = true;
    let clockExpired = false;
    if (file) {
      const core = toCoreScreeningFile(file, p.id);
      const interviewsHeld = p.candidacies.some((c) =>
        c.interviews.some((i) => i.stage === "second" && i.outcome === "progress"),
      );
      gateOpen = evaluateDeploymentGate(core, {
        riskEvaluationDocumented: true,
        finalInterviewHeld: interviewsHeld,
        signedDocumentsComplete: true,
      }).open;
      clockExpired = file.status === "time_expired";
    }

    out.set(p.id, {
      personName: p.fullName,
      input: {
        deploymentGatePassed: gateOpen,
        screeningClockExpired: clockExpired,
        suspended: p.employment?.state === "suspended",
        postRequiresSiaLicence: true,
        siaLicenceExpiry: iso(p.licences[0]?.expiresAt ?? null),
        rightToWorkExpiry: iso(rtwExpiry),
      },
    });
  }

  return out;
}

type DbFile = {
  id: string;
  screeningPeriodYears: number;
  status: string;
  conditionalEmploymentStart: Date | null;
  extensionWeeks: number;
  administratorUserId: string | null;
  controllerUserId: string | null;
  controllerReview1At: Date | null;
  controllerReview2At: Date | null;
  unverifiedDays: number;
  gapsOver31Days: number;
  checks: {
    id: string;
    group: string;
    label: string;
    clause: string;
    status: string;
    ownerUserId: string | null;
    firstRequestSentAt: Date | null;
    secondRequestSentAt: Date | null;
    confirmedAt: Date | null;
  }[];
};

/** Maps a database row onto the shape the BS 7858 rules already understand. */
function toCoreScreeningFile(f: DbFile, personId: string): ScreeningFile {
  return {
    id: f.id,
    candidateId: personId,
    screeningPeriodYears: f.screeningPeriodYears as ScreeningPeriodYears,
    status: f.status as ScreeningFile["status"],
    conditionalEmploymentStart: iso(f.conditionalEmploymentStart),
    extensionWeeks: f.extensionWeeks as 0 | 4,
    extensionApprovedBy: null,
    administrator: f.administratorUserId,
    controller: f.controllerUserId,
    controllerReview1At: iso(f.controllerReview1At),
    controllerReview2At: iso(f.controllerReview2At),
    checks: f.checks.map(
      (c): Check => ({
        id: c.id,
        group: c.group as Check["group"],
        label: c.label,
        clause: c.clause,
        status: c.status as Check["status"],
        owner: c.ownerUserId,
        firstRequestSentAt: iso(c.firstRequestSentAt),
        secondRequestSentAt: iso(c.secondRequestSentAt),
        confirmedAt: iso(c.confirmedAt),
      }),
    ),
    unverifiedDays: f.unverifiedDays,
    gapsOver31Days: f.gapsOver31Days,
    outstandingSummary: "",
  };
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

export interface ExpiringDocument extends DocumentRecord {
  typeLabel: string;
  clause: string | null;
  copyRetained: boolean;
}

export async function getExpiringDocuments(): Promise<ExpiringDocument[]> {
  const rows = await db.documentRecord.findMany({
    where: { expiresAt: { not: null } },
    orderBy: { expiresAt: "asc" },
    include: { type: true, person: true, site: true, client: true },
  });

  return rows.map((d) => ({
    id: d.id,
    typeId: d.typeId,
    ownerRef: d.personId ?? d.siteId ?? d.clientId ?? d.screeningFileId ?? "",
    ownerName: d.person?.fullName ?? d.site?.name ?? d.client?.name ?? "—",
    verification: d.verification,
    suppliedAt: iso(d.suppliedAt),
    verifiedAt: iso(d.verifiedAt),
    expiresAt: iso(d.expiresAt),
    typeLabel: d.type.label,
    clause: d.type.clause,
    copyRetained: d.type.copyRetained,
  }));
}

/** Licences are held separately from documents: the number is a duplicate key
 *  and the register sweep runs against it, not against a file with a date. */
export async function getLicences() {
  const rows = await db.licence.findMany({
    orderBy: { expiresAt: "asc" },
    include: { person: true },
  });
  return rows.map((l) => ({
    id: l.id,
    personId: l.personId,
    personName: l.person.fullName,
    nameOnBadge: l.nameOnBadge,
    number: l.number,
    expiresAt: isoRequired(l.expiresAt),
    lastVerifiedAt: iso(l.lastVerifiedAt),
    registerStatus: l.registerStatus,
  }));
}

export interface RetentionItemRow {
  id: string;
  description: string;
  rule: string;
  dueAt: string;
  itemsHeld: number;
}

/**
 * What is due for disposal.
 *
 * Derived from the retention rules rather than from a queue somebody maintains:
 * an unsuccessful applicant's file 12 months after it was closed, a leaver's
 * records 7 years after employment ceased.
 */
export async function getRetentionQueue(now = new Date()): Promise<RetentionItemRow[]> {
  const months = RETENTION.unsuccessfulApplicantMonths;
  const years = RETENTION.afterCessationYears;

  const [withdrawn, leavers] = await Promise.all([
    db.candidacy.findMany({ where: { stage: "withdrawn" }, orderBy: { stageSince: "asc" } }),
    db.employment.findMany({ where: { endedAt: { not: null } }, orderBy: { endedAt: "asc" } }),
  ]);

  const items: RetentionItemRow[] = [
    ...withdrawn.map((c) => {
      const due = new Date(c.stageSince);
      due.setMonth(due.getMonth() + months);
      return {
        id: `ret-${c.id}`,
        // No name: a disposal record that reproduces the data it destroyed has
        // not destroyed it, and the queue that feeds it follows the same rule.
        description: `Application withdrawn ${c.stageSince.toISOString().slice(0, 7)} — screening file and documents`,
        rule: "unsuccessful_applicant_12_months",
        dueAt: due.toISOString(),
        itemsHeld: 1,
      };
    }),
    ...leavers.map((e) => {
      const due = new Date(e.endedAt!);
      due.setFullYear(due.getFullYear() + years);
      return {
        id: `ret-${e.id}`,
        description: `Employment ceased ${e.endedAt!.toISOString().slice(0, 7)} — employment and screening records`,
        rule: "after_cessation_7_years",
        dueAt: due.toISOString(),
        itemsHeld: 1,
      };
    }),
  ];

  // Soonest first, and anything already past its date is at the top — holding
  // data longer than the policy allows is itself the compliance failure.
  return items.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export async function getDisposalLog(limit = 10) {
  const rows = await db.disposalRecord.findMany({ orderBy: { at: "desc" }, take: limit });
  return rows.map((d) => ({
    id: d.id,
    at: isoRequired(d.at),
    rule: d.rule,
    subjectDescription: d.subjectDescription,
    itemsDestroyed: d.itemsDestroyed,
    retainedInstead: d.retainedInstead,
    performedBy: d.performedBySystem ?? d.performedByUserId ?? "—",
    verified: d.verifiedByUserId !== null,
  }));
}

// ---------------------------------------------------------------------------
// Events, and the KPIs that are queries over them
// ---------------------------------------------------------------------------

export async function getRecentEvents(limit = 8): Promise<EventRecord[]> {
  const rows = await db.event.findMany({
    orderBy: { at: "desc" },
    take: limit,
    include: { actor: true },
  });

  // Event holds loose references rather than foreign keys, so that a subject
  // can be disposed of under the retention policy without taking its audit
  // trail with it. The cost is resolving the names in a second pass.
  const assignmentIds = rows.map((e) => e.assignmentId).filter((x): x is string => !!x);
  const personIds = rows.map((e) => e.personId).filter((x): x is string => !!x);

  const [assignments, people] = await Promise.all([
    assignmentIds.length
      ? db.assignment.findMany({
          where: { id: { in: assignmentIds } },
          include: { post: { include: { site: true } }, person: true },
        })
      : Promise.resolve([]),
    personIds.length
      ? db.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
  ]);

  const siteByAssignment = new Map(assignments.map((a) => [a.id, `${a.post.site.name} — ${a.post.name}`]));
  const personByAssignment = new Map(assignments.map((a) => [a.id, a.person.fullName]));
  const nameByPerson = new Map(people.map((p) => [p.id, p.fullName]));

  return rows.map((e) => ({
    id: e.id,
    at: isoRequired(e.at),
    type: e.type,
    actorName: e.actor?.displayName ?? e.actorSystem ?? "System",
    actorRole: e.actorRole ?? "Scheduler",
    subjectRef: e.assignmentId ?? e.personId ?? "",
    subjectName:
      (e.assignmentId
        ? (personByAssignment.get(e.assignmentId) ?? siteByAssignment.get(e.assignmentId))
        : undefined) ??
      (e.personId ? nameByPerson.get(e.personId) : undefined) ??
      "—",
    department: e.department,
    detail: e.detail ?? "",
  }));
}

export interface DashboardCounts {
  openRequirements: number;
  filesOnClock: number;
  overdueWork: number;
  expiringIn90: number;
  expiringIn30: number;
  expired: number;
  openIncidents: number;
  publishedNext7: number;
  draftNext7: number;
}

/** Counts for the dashboard. Every one is a query, not a stored total. */
export async function getDashboardCounts(now = new Date()): Promise<DashboardCounts> {
  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const in30 = new Date(now.getTime() + 30 * 86_400_000);

  const [
    openRequirements,
    filesOnClock,
    overdueWork,
    expiringIn90,
    expiringIn30,
    expired,
    openIncidents,
    publishedNext7,
    draftNext7,
  ] = await Promise.all([
    db.requirement.count({ where: { status: { in: ["received", "pool_check", "released_to_sourcing", "allocated"] } } }),
    db.screeningFile.count({ where: { conditionalEmploymentStart: { not: null }, completedAt: null } }),
    db.workItem.count({ where: { state: { in: ["open", "blocked"] }, dueAt: { lt: now } } }),
    db.documentRecord.count({ where: { expiresAt: { gte: now, lte: in90 } } }),
    db.documentRecord.count({ where: { expiresAt: { gte: now, lte: in30 } } }),
    db.documentRecord.count({ where: { expiresAt: { lt: now } } }),
    db.incident.count({ where: { clientNotified: false, severity: { not: "log_only" } } }),
    db.assignment.count({ where: { state: { in: ["published", "amended"] }, startsAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } }),
    db.assignment.count({ where: { state: "draft", startsAt: { gte: now, lte: new Date(now.getTime() + 7 * 86_400_000) } } }),
  ]);

  return {
    openRequirements,
    filesOnClock,
    overdueWork,
    expiringIn90,
    expiringIn30,
    expired,
    openIncidents,
    publishedNext7,
    draftNext7,
  };
}

// ---------------------------------------------------------------------------
// Publication checks — the choke point, run server-side
// ---------------------------------------------------------------------------

export interface PublicationCheck {
  assignmentId: string;
  personName: string;
  postName: string;
  siteName: string;
  startsAt: string;
  endsAt: string;
  allowed: boolean;
  deployability: Deployability;
}

/**
 * Whether each draft shift in the window may be published.
 *
 * Deliberately the same function the compliance register uses. A rota that
 * enforced something slightly different would be worse than one that enforced
 * nothing, because it would be trusted.
 */
export async function getPublicationChecks(days = 7, now = new Date()): Promise<PublicationCheck[]> {
  const [drafts, inputs] = await Promise.all([
    db.assignment.findMany({
      where: {
        state: "draft",
        endsAt: { gt: now },
        startsAt: { lt: new Date(now.getTime() + days * 86_400_000) },
      },
      orderBy: { startsAt: "asc" },
      include: { post: { include: { site: true } }, person: true },
    }),
    getDeployabilityInputs(),
  ]);

  return drafts.map((a) => {
    const known = inputs.get(a.personId);
    const deployability = evaluateDeployability(
      known
        ? { ...known.input, postRequiresSiaLicence: a.post.requiresSiaLicence }
        : {
            // Nobody on the books at all — a candidate who has not reached
            // conditional employment. That is a block, not a blank.
            deploymentGatePassed: false,
            screeningClockExpired: false,
            suspended: false,
            postRequiresSiaLicence: a.post.requiresSiaLicence,
            siaLicenceExpiry: null,
            rightToWorkExpiry: null,
          },
      now,
    );
    return {
      assignmentId: a.id,
      personName: a.person.fullName,
      postName: a.post.name,
      siteName: a.post.site.name,
      startsAt: isoRequired(a.startsAt),
      endsAt: isoRequired(a.endsAt),
      allowed: canPublishAssignment(deployability).allowed,
      deployability,
    };
  });
}

export interface WorkforceDeployability {
  personId: string;
  personName: string;
  deployability: Deployability;
}

/** The compliance view: who is blocked, and who is merely dated. */
export async function getWorkforceDeployability(now = new Date()): Promise<WorkforceDeployability[]> {
  const inputs = await getDeployabilityInputs();
  return Array.from(inputs.entries())
    .map(([personId, v]) => ({
      personId,
      personName: v.personName,
      deployability: evaluateDeployability(v.input, now),
    }))
    .sort((a, b) => a.personName.localeCompare(b.personName));
}

// ---------------------------------------------------------------------------
// Presence — who is signed in, and what they are working as
// ---------------------------------------------------------------------------

export interface PresenceRow {
  id: string;
  userId: string;
  name: string;
  activeRole: Role;
  signedInAt: string;
  lastSeenAt: string;
  openTasks: number;
}

/**
 * Open work sessions.
 *
 * A record rather than an inference: opened at sign-in, closed at sign-out,
 * moved when someone changes the role they are working as. Sessions stale for
 * more than twelve hours are treated as gone — a browser closed without signing
 * out should not haunt the board.
 */
export async function getPresence(now = new Date()): Promise<PresenceRow[]> {
  const rows = await db.workSession.findMany({
    where: { signedOutAt: null, lastSeenAt: { gte: new Date(now.getTime() - 12 * 3_600_000) } },
    orderBy: { lastSeenAt: "desc" },
    include: { user: true },
  });

  const counts = await db.workItem.groupBy({
    by: ["ownerUserId"],
    where: { state: { in: ["open", "blocked"] } },
    _count: { _all: true },
  });
  const byUser = new Map(counts.map((c) => [c.ownerUserId, c._count._all]));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    name: r.user.displayName,
    activeRole: r.activeRole as Role,
    signedInAt: isoRequired(r.signedInAt),
    lastSeenAt: isoRequired(r.lastSeenAt),
    openTasks: byUser.get(r.userId) ?? 0,
  }));
}
