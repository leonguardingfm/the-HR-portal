/**
 * The permission matrix and the approval ladder, asserted.
 *
 * Three things are checked, and the last two matter more than the first:
 *
 *   1. Each role can take exactly the actions it should, and no others.
 *   2. Every exported server action calls the guard BEFORE it touches the
 *      database. A permission check that can be skipped by a new action is not
 *      a permission model, so this reads every action module in lib/actions and
 *      fails if an exported action does not guard.
 *   3. The approval ladder puts the right roles on the right rungs, and refuses
 *      the four cases that would make a chain meaningless: the requester
 *      signing, the subject signing, one person signing two rungs, and a role
 *      that does not hold the rung. The third is what makes it safe to place
 *      the Finance Officer inside higher management.
 *
 * Run: npm run test:permissions
 */

import { readFileSync } from "node:fs";
import { ACTIONS, canDo, type ActionId } from "../lib/auth/permissions";
import { checkCallStatus } from "../lib/core/ops";
import {
  DEFAULT_THRESHOLDS,
  approvalChain,
  canApproveStep,
  canTransition,
  kpiVerdict,
  ADMIN_KPIS,
} from "../lib/core/admin";
import { MAX_DELEGATION_DAYS, effectiveRoles, actingNote, validateDelegation } from "../lib/auth/delegation";
import { canAdvance, canRecordInterview, deploymentContext } from "../lib/core/recruitment";
import { evaluateDeployability } from "../lib/core/deployability";
import { normalisePhone } from "../lib/core/identity";
import { ONBOARDING_STEPS, doneSteps, normaliseSiaNumber, outstandingFor, signatureChase, waitingOn } from "../lib/core/onboarding";
import { STANDARD_CHECKS, deriveStatus, fullScreeningBlockers, limitedScreeningBlockers, offerBlockers, onlineChecksOnFile } from "../lib/core/screening";
import { canSignOff } from "../lib/bs7858";
import { atRisk, fillProblem, headcount, nextReference, releaseProblem, statusAfterAllocation } from "../lib/core/requirements";
import { isDue, retentionDue } from "../lib/core/retention";
import { callsRequiredFor, chaseUpStatus, checkCallSchedule, dutyStatus, type DutyInput } from "../lib/core/duty";
import { askProblem, busiestWeek, candidateOrder, clashWith, createProblem, datesBetween, fromNow, hoursProblem, leavePending, leaveProblem, planBatch, restProblem, slotsFor, suggestOfficers, hoursWithin, mondayOf, newHoursProblem, offWindow, parsePattern, rosterState, shiftWindow, shortestRest, ukDate, ukInstant, ukTime, weeksOf } from "../lib/core/rota";
import { isProofCode, judgeLocation, newProofCode, parseLatLng, proofVerdict } from "../lib/core/proof";
import { alertKind, isAlarm, pushDue, uncoveredSeverity } from "../lib/core/alerts";
import { clientProblem, postProblem, siteProblem } from "../lib/core/places";
import { sniffMime, uploadProblem, uploadWarning } from "../lib/core/screening-documents";
import { analyseHistory, chaseState, dateOf, merge, requestProblem, screeningWindow, verifyProblem, workingDaysBetween, type Period } from "../lib/core/history";
import { declarationProblem, decisionProblem, extensionProblem, fileStatus, isExpiredOnClock, riskFindingProblem } from "../lib/core/screening-exceptions";
import type { ScreeningFile } from "../lib/types";
import type { Role } from "../lib/types";

let failures = 0;
const check = (name: string, pass: boolean, detail = "") => {
  if (pass) console.log(`PASS  ${name}${detail ? "  <- " + detail : ""}`);
  else {
    failures++;
    console.log(`FAIL  ${name}${detail ? "  <- " + detail : ""}`);
  }
};

// --- 1. the matrix ---------------------------------------------------------
const STAFF_BASELINE: ActionId[] = ["work_item.complete", "work_item.take", "alerts.subscribe", "reminder.send", "admin_item.raise"];

const EXPECTED: Record<string, ActionId[]> = {
  control: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", "no_signal.notify_client", "no_signal.report_loss", "requirement.raise", "requirement.manage", "chase_up.record", "rota.build", "rota.change", "officer.hours", "place.manage", "officer.exclude", "welfare.visit", ...STAFF_BASELINE],
  operations_manager: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", "no_signal.notify_client", "no_signal.report_loss", "requirement.raise", "requirement.manage", "chase_up.record", "rota.build", "rota.change", "officer.hours", "place.manage", "officer.exclude", "welfare.visit", ...STAFF_BASELINE],
  recruitment: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "stock.move", ...STAFF_BASELINE],
  recruitment_manager: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "admin_item.approve", "admin_item.reject", "holiday.decide", "authority_matter.respond", ...STAFF_BASELINE],
  admin_officer: ["admin_item.start", "admin_item.review", "admin_item.complete", "payment.record", "asset.maintain", "stock.move", "accreditation.evidence", ...STAFF_BASELINE],
  admin_manager: ["admin_item.assign", "admin_item.start", "admin_item.review", "admin_item.approve", "admin_item.reject", "admin_item.complete", "admin_item.cancel", "payment.record", "asset.maintain", "holiday.decide", "stock.move", "accreditation.evidence", "authority_matter.respond", "account.review", ...STAFF_BASELINE],
  // The Finance Officer approves money and records payments. Nothing else:
  // not holidays, not suspensions, not authority matters, not stock.
  finance_officer: ["admin_item.approve", "admin_item.reject", "payment.record", ...STAFF_BASELINE],
  vetting_admin: ["document.verify", "document.renew", "screening.open", "screening.assign", "screening.check", "screening.exception.raise", ...STAFF_BASELINE],
  vetting_controller: ["document.verify", "document.renew", "disposal.run", "accreditation.evidence", "screening.assign", "screening.review", "screening.sweep", ...STAFF_BASELINE],
  top_management: ["disposal.run", "admin_item.assign", "admin_item.start", "admin_item.review", "admin_item.approve", "admin_item.reject", "admin_item.complete", "admin_item.cancel", "holiday.decide", "accreditation.evidence", "authority_matter.respond", "threshold.change", "role.delegate", "role.revoke_delegation", "account.review", "screening.open", "screening.assign", "screening.check", "screening.exception.raise", "screening.exception.decide", "screening.sweep", ...STAFF_BASELINE],
  auditor: [],
  // Sales and Client hold nothing: they read, and the route guard keeps the
  // client out of every internal screen.
  sales: [],
  client: [],
  officer: ["duty.self", "alerts.subscribe"],
};

const allActions = Object.keys(ACTIONS) as ActionId[];
for (const [role, allowed] of Object.entries(EXPECTED)) {
  const actual = allActions.filter((a) => canDo(role as Role, a)).sort();
  const expected = [...allowed].sort();
  check(
    `${role} can take exactly ${expected.length} action(s)`,
    JSON.stringify(actual) === JSON.stringify(expected),
    actual.length === expected.length ? "" : `got ${actual.join(", ") || "none"}`,
  );
}

// The two that are easiest to get wrong, so they are asserted by name.
check("Higher management cannot record a check call", !canDo("top_management", "check_call.record"));
check("Higher management cannot publish a shift", !canDo("top_management", "assignment.publish"));
check("Higher management CAN countersign a disposal", canDo("top_management", "disposal.run"));
check("Control cannot verify a screening document", !canDo("control", "document.verify"));
check("Recruitment cannot publish a shift", !canDo("recruitment", "assignment.publish"));
check("The auditor can take nothing at all", allActions.every((a) => !canDo("auditor", a)));

// The separations the approval ladder depends on. If any of these four break,
// the Finance Officer sitting inside higher management stops being safe.
check("The Finance Officer cannot decide a holiday request", !canDo("finance_officer", "holiday.decide"));
check("The Finance Officer cannot respond to an external authority", !canDo("finance_officer", "authority_matter.respond"));
check("The Finance Officer cannot move uniform stock", !canDo("finance_officer", "stock.move"));
check("The HR Manager cannot record a payment", !canDo("recruitment_manager", "payment.record"));
check("Only higher management may change an approval threshold",
  canDo("top_management", "threshold.change") &&
    !canDo("admin_manager", "threshold.change") &&
    !canDo("finance_officer", "threshold.change"));

// --- 1b. the approval ladder ----------------------------------------------
const chainFor = (kind: Parameters<typeof approvalChain>[0]["kind"], pounds: number | null, about: string | null = null) =>
  approvalChain(
    { kind, amountPence: pounds === null ? null : pounds * 100, aboutPersonId: about },
    DEFAULT_THRESHOLDS,
  );

const low = chainFor("payment", 200);
check("at or under the low threshold: one rung, the Admin Manager",
  low.length === 1 && low[0].anyOf.join() === "admin_manager", low.map((s) => s.anyOf.join("/")).join(" then "));

const mid = chainFor("payment", 1500);
check("between the thresholds: one rung, the Finance Officer",
  mid.length === 1 && mid[0].anyOf.join() === "finance_officer", mid.map((s) => s.anyOf.join("/")).join(" then "));

const high = chainFor("payment", 5000);
check("over the high threshold: two rungs, Finance then higher management",
  high.length === 2 &&
    high[0].anyOf.join() === "finance_officer" &&
    high[1].anyOf.join() === "top_management",
  high.map((s) => s.anyOf.join("/")).join(" then "));

const penalty = chainFor("penalty", 120, "person-x");
check("a penalty against staff gathers the money rung AND both people rungs",
  penalty.length === 3 &&
    penalty[0].anyOf.join() === "admin_manager" &&
    penalty[1].anyOf.join() === "recruitment_manager" &&
    penalty[2].anyOf.join() === "top_management",
  penalty.map((s) => s.anyOf.join("/")).join(" then "));

const suspension = chainFor("suspension", null, "person-x");
check("a suspension takes HR and higher management, with no money rung",
  suspension.length === 2 &&
    suspension[0].anyOf.join() === "recruitment_manager" &&
    suspension[1].anyOf.join() === "top_management",
  suspension.map((s) => s.anyOf.join("/")).join(" then "));

check("no request ever ends up with an empty chain",
  (["payment", "purchase", "voucher", "penalty", "suspension", "holiday", "authority_response", "write_off"] as const)
    .every((k) => chainFor(k, 0, "person-x").length > 0));

// The four refusals that make a chain mean something.
const requirement = high[0];
const financeAlsoTopManagement: Parameters<typeof canApproveStep>[0]["approver"] = {
  userId: "u-finance",
  personId: "p-finance",
  roles: ["finance_officer", "top_management"],
};

check("the requester cannot approve their own request",
  !canApproveStep({ requirement, approver: financeAlsoTopManagement, requestedByUserId: "u-finance" }).permitted);

check("the subject of a request cannot decide it",
  !canApproveStep({
    requirement,
    approver: financeAlsoTopManagement,
    requestedByUserId: "u-someone-else",
    aboutPersonId: "p-finance",
  }).permitted);

check("one person cannot satisfy two rungs of the same chain",
  !canApproveStep({
    requirement: high[1],
    approver: financeAlsoTopManagement,
    requestedByUserId: "u-someone-else",
    alreadyApprovedByUserIds: ["u-finance"],
  }).permitted);

check("a role that does not hold the rung is refused",
  !canApproveStep({
    requirement,
    approver: { userId: "u-sana", personId: "p-sana", roles: ["admin_officer"] },
    requestedByUserId: "u-someone-else",
  }).permitted);

check("the right person on the right rung is permitted",
  canApproveStep({
    requirement,
    approver: financeAlsoTopManagement,
    requestedByUserId: "u-someone-else",
  }).permitted);

// This is the whole point of finance_officer being a role rather than a rank:
// the second rung of a large payment has to fall to somebody else.
check("a large payment cannot be signed twice by the same person wearing two hats",
  canApproveStep({ requirement: high[0], approver: financeAlsoTopManagement, requestedByUserId: "u-a" }).permitted &&
    !canApproveStep({
      requirement: high[1],
      approver: financeAlsoTopManagement,
      requestedByUserId: "u-a",
      alreadyApprovedByUserIds: ["u-finance"],
    }).permitted);

// --- 1b2. delegation ------------------------------------------------------
// Cover for an absence. Each of these is a delegation that would look fine and
// quietly would not be.
const person = (userId: string, roles: Role[], ok = true) => ({
  userId,
  personId: `p-${userId}`,
  roles,
  ownScreeningComplete: ok,
  confidentialityAgreementOnFile: ok,
  trainingReviewedAt: ok ? new Date().toISOString() : null,
  active: true,
});

const financeHolder = person("u-finance", ["finance_officer", "top_management"]);
const deputy = person("u-deputy", ["top_management"]);
const day = 86_400_000;
const delegate = (over: Partial<Parameters<typeof validateDelegation>[0]> = {}) =>
  validateDelegation({
    role: "finance_officer",
    from: financeHolder,
    to: deputy,
    grantedBy: financeHolder,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 14 * day),
    existingActive: [],
    ...over,
  });

check("a role can be lent for two weeks", delegate().permitted, delegate().reason ?? "");
const unrelated = person("u-ops", ["operations_manager"]);
const notTheirs = delegate({ from: unrelated, grantedBy: unrelated });
check("a role cannot be lent by somebody who does not hold it",
  !notTheirs.permitted && /does not hold it/.test(notTheirs.reason ?? ""),
  notTheirs.reason ?? "");
check("a role cannot be lent to somebody who already holds it",
  !delegate({ to: person("u-x", ["finance_officer"]) }).permitted);
const ownCover = delegate({ grantedBy: deputy });
check("nobody may arrange their own cover",
  !ownCover.permitted && /own cover/.test(ownCover.reason ?? ""), ownCover.reason ?? "");
check("a delegation cannot run longer than the maximum",
  !delegate({ endsAt: new Date(Date.now() + (MAX_DELEGATION_DAYS + 1) * day) }).permitted);
check(`${MAX_DELEGATION_DAYS} days exactly is allowed`,
  delegate({ endsAt: new Date(Date.now() + MAX_DELEGATION_DAYS * day) }).permitted);
check("a delegation cannot end before it starts",
  !delegate({ endsAt: new Date(Date.now() - day) }).permitted);
check("a second live delegation of the same role to the same person is refused",
  !delegate({
    existingActive: [{ role: "finance_officer", toUserId: "u-deputy", endsAt: new Date(Date.now() + day) }],
  }).permitted);
// A lent screening role carries the same 6.1/6.2 obligations as a granted one.
check("a screening role cannot be lent to somebody who is not screened themselves",
  !delegate({
    role: "vetting_controller",
    from: person("u-anas", ["vetting_controller"]),
    to: person("u-untrained", [], false),
    grantedBy: person("u-anas", ["vetting_controller"]),
  }).permitted);
check("an inactive user cannot be lent anything",
  !delegate({ to: { ...deputy, active: false } }).permitted);

const lent = [{ role: "finance_officer" as Role, fromUserId: "u-finance", fromName: "the Finance Officer", endsAt: "2026-10-31T00:00:00.000Z" }];
check("a lent role joins the roles a person may act as",
  effectiveRoles(["top_management"], lent).sort().join() === "finance_officer,top_management");
check("a lent role that duplicates a held one does not appear twice",
  effectiveRoles(["finance_officer"], lent).length === 1);
check("the audit trail says a role was borrowed, and whose it was",
  (actingNote("finance_officer", lent) ?? "").includes("Finance Officer"),
  actingNote("finance_officer", lent) ?? "none");
check("a role held in its own right carries no borrowing note",
  actingNote("top_management", lent) === null);

// The point of the whole exercise: lending the role does NOT let one person
// sign both rungs of a large payment. The rung rule is on the approver.
check("a deputy holding finance by delegation still cannot sign both rungs",
  canApproveStep({
    requirement: high[0],
    approver: { userId: "u-deputy", personId: "p-deputy", roles: ["top_management", "finance_officer"] },
    requestedByUserId: "u-a",
  }).permitted &&
    !canApproveStep({
      requirement: high[1],
      approver: { userId: "u-deputy", personId: "p-deputy", roles: ["top_management", "finance_officer"] },
      requestedByUserId: "u-a",
      alreadyApprovedByUserIds: ["u-deputy"],
    }).permitted);

// --- 1b3. posts with no mobile signal -------------------------------------
//
// The confirmed process: the officer books on before going in, the helpdesk
// tells the client, the client holds contact on the site phone, and if they
// cannot reach the officer somebody attends. The bug this fixes is that
// without it the board shows a missed check call every hour, all night, on a
// post where the officer physically cannot make one.
const noSignalPost = {
  id: "post-ns",
  siteId: "s1",
  name: "Far perimeter",
  pattern: "",
  requiresSiaLicence: true,
  screeningPeriodYears: 5 as const,
  checkCallsRequired: true,
  loneWorking: true,
  mobileSignal: false,
};
const signalPost = { ...noSignalPost, id: "post-s", mobileSignal: true };
const shift = {
  id: "a-ns",
  personId: "p1",
  postId: "post-ns",
  startsAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  endsAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
  state: "published" as const,
  publishedAt: null,
  amendments: [],
};
const bookedOn = {
  assignmentId: "a-ns",
  at: new Date(Date.now() - 4.2 * 3_600_000).toISOString(),
  channel: "app" as const,
  locationVerified: true,
};

// Four hours on post with no check call. On a normal post that is three hours
// overdue and at the top of the ladder.
const onSignalPost = checkCallStatus(
  { ...shift, postId: "post-s" },
  signalPost,
  [],
  bookedOn,
  [],
);
check("on a post WITH signal, four hours without a call is escalated",
  onSignalPost.state === "triggered" && onSignalPost.escalation >= 1,
  `${onSignalPost.state}, escalation ${onSignalPost.escalation}`);

// The same shift on a no-signal post, with the client told, is fine.
const handedOver = checkCallStatus(shift, noSignalPost, [], bookedOn, [], new Date(), {
  assignmentId: "a-ns",
  notifiedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  lossReportedAt: null,
});
check("on a no-signal post with the client told, nothing is overdue",
  handedOver.state === "client_held" && handedOver.severity === "good" && handedOver.escalation === 0,
  `${handedOver.state}, ${handedOver.severity}`);

// Not told yet: that IS the work, because nobody is holding contact at all.
const notToldYet = checkCallStatus(shift, noSignalPost, [], bookedOn, [], new Date(), {
  assignmentId: "a-ns",
  notifiedAt: null,
  lossReportedAt: null,
});
check("on a no-signal post with the client NOT told, it is actionable",
  notToldYet.state === "client_held" && notToldYet.severity === "serious",
  `${notToldYet.state}, ${notToldYet.severity}`);
check("but it is never shown as a missed check call, because there was none to miss",
  notToldYet.state !== "triggered" && notToldYet.escalation === 0);

// The client reporting lost contact goes straight to attend site: there is no
// mobile to try, so their report is the failed contact.
const lost = checkCallStatus(shift, noSignalPost, [], bookedOn, [], new Date(), {
  assignmentId: "a-ns",
  notifiedAt: new Date(Date.now() - 4 * 3_600_000).toISOString(),
  lossReportedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
});
check("the client losing contact goes straight to attend site",
  lost.state === "triggered" && lost.escalation === 3 && lost.severity === "critical",
  `${lost.label}`);

// And with no handover record at all, it still must not read as a missed call.
const noRecord = checkCallStatus(shift, noSignalPost, [], bookedOn, []);
check("a no-signal post with no handover record still never reads as overdue",
  noRecord.state === "client_held", noRecord.state);

// --- 1c. the workflow -----------------------------------------------------
check("a task cannot jump from raised to completed", !canTransition("task", "raised", "completed"));
check("a request cannot jump from reviewed to completed", !canTransition("request", "reviewed", "completed"));
check("a request must be approved before it is completed", canTransition("request", "approved", "completed"));
check("a rejected request is final", !canTransition("request", "rejected", "approved"));
check("a completed item cannot be reopened",
  !canTransition("task", "completed", "in_progress") && !canTransition("request", "completed", "approved"));

// --- 1d. KPI banding ------------------------------------------------------
const noTolerance = ADMIN_KPIS.filter((k) => k.tolerance === 0).map((k) => k.id);
check("exactly two Admin measures have no watch band",
  noTolerance.length === 2, noTolerance.join(", "));
check("a missed renewal is critical immediately, with no amber",
  kpiVerdict(ADMIN_KPIS.find((k) => k.id === "renewals_missed")!, 1) === "critical");
check("on target reads good",
  kpiVerdict(ADMIN_KPIS.find((k) => k.id === "on_time_completion")!, 95) === "good");
check("a missing figure reads neutral, never good",
  kpiVerdict(ADMIN_KPIS.find((k) => k.id === "on_time_completion")!, null) === "neutral");

// --- recruitment pipeline ---------------------------------------------------
{
  const P = (stage: "first" | "second" | "additional") => ({ stage, outcome: "progress" as const });
  check("sourcing moves to shortlisted",
    canAdvance({ stage: "sourcing", interviews: [], requiresAdditional: false }).to === "shortlisted");
  check("first interview stage cannot be left without a passed first interview",
    !canAdvance({ stage: "first_interview", interviews: [], requiresAdditional: false }).permitted);
  check("a held-but-on-hold interview does not open the gate",
    !canAdvance({ stage: "first_interview", interviews: [{ stage: "first", outcome: "hold" }], requiresAdditional: false }).permitted);
  check("second interview skips the client interview when the client does not ask for one",
    canAdvance({ stage: "second_interview", interviews: [P("first"), P("second")], requiresAdditional: false }).to === "conditional_offer");
  check("second interview goes to the client interview when the client asks for one",
    canAdvance({ stage: "second_interview", interviews: [P("first"), P("second")], requiresAdditional: true }).to === "additional_interview");
  check("no offer without every required interview (7.3.4)",
    !canAdvance({ stage: "second_interview", interviews: [P("second")], requiresAdditional: false }).permitted);
  check("offer permitted once every required interview is passed",
    canAdvance({ stage: "additional_interview", interviews: [P("first"), P("second"), P("additional")], requiresAdditional: true, screeningBlockers: [] }).permitted);
  check("recruitment stops at onboarding complete; deployment is the gate's",
    canAdvance({ stage: "onboarding_complete", interviews: [], requiresAdditional: false }).to === null);
  check("a withdrawn candidate does not move",
    !canAdvance({ stage: "withdrawn", interviews: [], requiresAdditional: false }).permitted);
  check("recruitment may record the first interview", canRecordInterview("recruitment", "first"));
  check("only the HR Manager records the second interview",
    !canRecordInterview("recruitment", "second") && canRecordInterview("recruitment_manager", "second"));
  check("phone numbers normalise across +44 and spacing",
    normalisePhone("+44 7700 900123") === normalisePhone("07700 900 123"));
}

// --- onboarding checklist ---------------------------------------------------
{
  const P = (stage: "first" | "second" | "additional") => ({ stage, outcome: "progress" as const });
  const iv = [P("first"), P("second")];
  const all = (stage: string) =>
    new Set(ONBOARDING_STEPS.filter((s) => s.stage === stage).map((s) => s.key));
  check("an offer cannot move to the welcome pack with the checklist open",
    !canAdvance({ stage: "conditional_offer", interviews: iv, requiresAdditional: false, onboardingDone: new Set() }).permitted);
  check("the refusal names what is missing",
    (canAdvance({ stage: "conditional_offer", interviews: iv, requiresAdditional: false, onboardingDone: new Set(["offer_issued", "pack_issued"]) }).reason ?? "").includes("risk in the intended role"));
  check("offer moves on once its three steps are done",
    canAdvance({ stage: "conditional_offer", interviews: iv, requiresAdditional: false, onboardingDone: all("conditional_offer") }).to === "welcome_pack");
  check("signed documents need every signature",
    !canAdvance({ stage: "welcome_pack", interviews: iv, requiresAdditional: false, onboardingDone: new Set(["contract_signed"]) }).permitted);
  check("the automatic Control notification never blocks a move",
    !outstandingFor("signed_docs_complete", all("signed_docs_complete")).some((s) => s.kind === "automatic"));
  check("online checks are read from a screening file past preliminary checks",
    doneSteps([], true).has("online_checks_confirmed"));
  check("online checks are not assumed from a file that has not started",
    !doneSteps([], false).has("online_checks_confirmed"));
  check("online checks belong to Vetting, not Recruitment",
    !ONBOARDING_STEPS.find((s) => s.key === "online_checks_confirmed")!.roles.includes("recruitment"));
  check("signature chase: first at 2 days, second at 5, escalate at 10",
    signatureChase(new Date(Date.now() - 1 * 86_400_000)).severity === "good" &&
    signatureChase(new Date(Date.now() - 2 * 86_400_000)).severity === "warning" &&
    signatureChase(new Date(Date.now() - 5 * 86_400_000)).severity === "serious" &&
    signatureChase(new Date(Date.now() - 10 * 86_400_000)).severity === "critical");
  check("SIA numbers normalise to four groups of four",
    normaliseSiaNumber("1010-2233 44556677") === "1010 2233 4455 6677" && normaliseSiaNumber("123") === null);
}

// --- screening files -------------------------------------------------------
{
  const file = (status: string, set: (label: string, group: string) => string, extra: Partial<ScreeningFile> = {}): ScreeningFile => ({
    id: "t", candidateId: "p", screeningPeriodYears: 5, status: "not_started", conditionalEmploymentStart: null,
    extensionWeeks: 0, extensionApprovedBy: null, administrator: "a", controller: "c",
    controllerReview1At: null, controllerReview2At: null, unverifiedDays: 0, gapsOver31Days: 0, outstandingSummary: "",
    checks: STANDARD_CHECKS.map((k, i) => ({ id: String(i), group: k.group, label: k.label, clause: k.clause, status: set(k.label, k.group) as never, owner: null, firstRequestSentAt: null, secondRequestSentAt: null, confirmedAt: null })),
    ...extra,
  } as ScreeningFile);
  const fresh = file("not_started", () => "not_started");
  const limitedReady = file("x", (l, g) => (g === "consent" || g === "preliminary" || l.includes("3 years") ? "verified" : "not_started"));
  const allDone = file("x", (_l, g) => (g === "signoff" ? "not_started" : "verified"), { controllerReview1At: "2026-09-01" });

  check("a new file opens with the standard 17 checks", STANDARD_CHECKS.length === 17);
  check("a fresh file is not ready for the limited review", limitedScreeningBlockers(fresh).length > 0);
  check("consent, preliminary checks and 3 years' history make it ready (7.5.2a)", limitedScreeningBlockers(limitedReady).length === 0);
  check("a ready file derives to limited screening complete", deriveStatus(limitedReady) === "limited_screening_complete");
  check("a failed check blocks the review", limitedScreeningBlockers(file("x", (l, g) => (g === "preliminary" && l.includes("OFAC") ? "failed" : g === "consent" || g === "preliminary" || l.includes("3 years") ? "verified" : "not_started"))).length > 0);
  check("no offer without a screening file (7.4a)", offerBlockers(null).length === 1);
  check("no offer before the controller reviews limited screening (7.5.2b)",
    offerBlockers(limitedReady).some((b) => b.includes("7.5.2b")));
  check("offer clears once preliminary checks are done and reviewed",
    offerBlockers({ ...limitedReady, controllerReview1At: "2026-09-01" }).length === 0);
  check("unverified days block the completed-file review (7.7)",
    fullScreeningBlockers({ ...allDone, unverifiedDays: 12 }).length > 0 && fullScreeningBlockers(allDone).length === 0);
  check("a submitted review holds its status until the controller acts",
    deriveStatus({ ...limitedReady, status: "controller_review_1" }) === "controller_review_1");
  check("an exception status is never overwritten by routine progress",
    deriveStatus({ ...allDone, status: "risk_acceptance_required" }) === "risk_acceptance_required");
  check("online checks are read from preliminary checks plus right to work",
    onlineChecksOnFile(allDone) && !onlineChecksOnFile(limitedReady));
  check("recruitment refuses an offer the screening file blocks",
    !canAdvance({ stage: "second_interview", interviews: [{ stage: "first", outcome: "progress" }, { stage: "second", outcome: "progress" }], requiresAdditional: false, screeningBlockers: offerBlockers(null) }).permitted);
  check("an offer check that forgets the file is refused, not waved through",
    !canAdvance({ stage: "second_interview", interviews: [{ stage: "first", outcome: "progress" }, { stage: "second", outcome: "progress" }], requiresAdditional: false }).permitted);
  check("the controller who built a file cannot review it (7.5.2b)",
    !canSignOff({ reviewerUserId: "u3", reviewerPersonId: "p3", subjectPersonId: "p9", administratorUserId: "u3" }).permitted);
  check("nobody reviews their own file (6.1)",
    !canSignOff({ reviewerUserId: "u3", reviewerPersonId: "p9", subjectPersonId: "p9", administratorUserId: "u4" }).permitted);
  check("the offer is not issued before the risk evaluation (7.5.1a)",
    waitingOn(ONBOARDING_STEPS.find((x) => x.key === "offer_issued")!, new Set()).length === 1);
}

// --- screening exceptions ---------------------------------------------------
{
  const mk = (extra: Partial<ScreeningFile>, set: (g: string) => string = () => "not_started"): ScreeningFile => ({
    id: "t", candidateId: "p", screeningPeriodYears: 5, status: "full_screening_in_progress",
    conditionalEmploymentStart: null, extensionWeeks: 0, extensionApprovedBy: null, administrator: "a", controller: "c",
    controllerReview1At: "2026-06-01", controllerReview2At: null, unverifiedDays: 0, gapsOver31Days: 0, outstandingSummary: "",
    checks: STANDARD_CHECKS.map((k, i) => ({ id: String(i), group: k.group, label: k.label, clause: k.clause, status: set(k.group) as never, owner: null,
      firstRequestSentAt: k.group === "history" ? "2026-08-01" : null, secondRequestSentAt: null, confirmedAt: null })),
    ...extra,
  } as ScreeningFile);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const onClock = mk({ conditionalEmploymentStart: daysAgo(60) }, (g) => (g === "history" ? "requested" : "verified"));
  const expired = mk({ conditionalEmploymentStart: daysAgo(100) }, (g) => (g === "history" ? "requested" : "verified"));

  check("a CCJ of £10,000 or less is not a case (Form 5)", riskFindingProblem({ trigger: "ccj", amountGbp: 10000 }) !== null);
  check("a CCJ over £10,000 is", riskFindingProblem({ trigger: "ccj", amountGbp: 14200 }) === null);
  check("bankruptcy and directorship need no amount",
    riskFindingProblem({ trigger: "bankruptcy", amountGbp: null }) === null && riskFindingProblem({ trigger: "directorship", amountGbp: null }) === null);
  check("an extension can be asked for on a running clock with written requests out", extensionProblem({ file: onClock, openKinds: [] }) === null);
  check("not before the clock has started", extensionProblem({ file: mk({}), openKinds: [] }) !== null);
  check("not twice (7.6)", extensionProblem({ file: { ...onClock, extensionWeeks: 4 }, openKinds: [] }) !== null);
  check("not while one is already waiting", extensionProblem({ file: onClock, openKinds: ["extension"] }) !== null);
  check("not after the period has run out", extensionProblem({ file: expired, openKinds: [] }) !== null);
  check("not without evidence of written requests",
    extensionProblem({ file: { ...onClock, checks: onClock.checks.map((c) => ({ ...c, firstRequestSentAt: null })) }, openKinds: [] }) !== null);
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  check("a statutory declaration for five months is allowed", declarationProblem({ from: d("2025-01-01"), to: d("2025-06-01"), openKinds: [], alreadyApproved: false }) === null);
  check("over six months is not (7.7i)", declarationProblem({ from: d("2025-01-01"), to: d("2025-08-01"), openKinds: [], alreadyApproved: false }) !== null);
  check("more than five years back is not", declarationProblem({ from: d("2019-01-01"), to: d("2019-03-01"), openKinds: [], alreadyApproved: false }) !== null);
  check("a second approved period is not", declarationProblem({ from: d("2025-01-01"), to: d("2025-02-01"), openKinds: [], alreadyApproved: true }) !== null);
  check("no decision before the representation (7.4f)",
    decisionProblem({ state: "awaiting_representation", deciderUserId: "u5", deciderPersonId: "p5", subjectPersonId: "p9", raisedById: "u3" }) !== null);
  check("whoever raised a case does not decide it",
    decisionProblem({ state: "awaiting_decision", deciderUserId: "u3", deciderPersonId: "p3", subjectPersonId: "p9", raisedById: "u3" }) !== null);
  check("nobody decides on their own screening (6.1)",
    decisionProblem({ state: "awaiting_decision", deciderUserId: "u5", deciderPersonId: "p9", subjectPersonId: "p9", raisedById: "u3" }) !== null);
  check("higher management decides a case someone else raised",
    decisionProblem({ state: "awaiting_decision", deciderUserId: "u5", deciderPersonId: "p5", subjectPersonId: "p9", raisedById: "u3" }) === null);
  check("an open finding pauses the file", fileStatus(onClock, ["risk_finding"]) === "risk_acceptance_required" && fileStatus(onClock, ["adverse_finding"]) === "adverse_finding");
  check("an open extension request does not pause it", fileStatus(onClock, ["extension"]) === "full_screening_in_progress");
  check("a decided finding returns the file to where its checks say", fileStatus({ ...onClock, status: "risk_acceptance_required" }, []) === "full_screening_in_progress");
  check("an ordinary edit never expires a file — only the sweep does", fileStatus(expired, []) !== "time_expired");
  check("the sweep finds the expired file", isExpiredOnClock(expired) && !isExpiredOnClock(onClock));
  check("once expired it stays expired while out of time", fileStatus({ ...expired, status: "time_expired" }, []) === "time_expired");
  check("an approved extension lifts an expiry that is back inside the period",
    fileStatus({ ...mk({ conditionalEmploymentStart: daysAgo(90), extensionWeeks: 4 }, (g) => (g === "history" ? "requested" : "verified")), status: "time_expired" }, []) !== "time_expired");
  check("an unsuccessful file stays unsuccessful", fileStatus({ ...onClock, status: "unsuccessful" }, []) === "unsuccessful");
  check("a finding blocks the offer", offerBlockers({ ...onClock, status: "risk_acceptance_required" }).some((b) => b.includes("7.4f")));
}

// --- the officer pool -------------------------------------------------------
{
  const P = (stage: "first" | "second" | "additional") => ({ stage, outcome: "progress" as const });
  check("no candidacy, no context: nothing is assumed",
    Object.values(deploymentContext(null)).every((v) => v === false));
  check("an officer deployed before the checklist existed is not read as blocked",
    Object.values(deploymentContext({ stage: "deployed", interviews: [], onboardingSteps: [], requiresAdditional: false })).every(Boolean));
  check("at the offer: interviews held, risk evaluated once recorded, documents not yet signed", (() => {
    const c = deploymentContext({ stage: "conditional_offer", interviews: [P("first"), P("second")], onboardingSteps: [{ step: "risk_evaluated" }], requiresAdditional: false });
    return c.finalInterviewHeld && c.riskEvaluationDocumented && !c.signedDocumentsComplete;
  })());
  check("a client's additional interview counts before the offer",
    !deploymentContext({ stage: "second_interview", interviews: [P("first"), P("second")], onboardingSteps: [], requiresAdditional: true }).finalInterviewHeld);
  const base = { deploymentGatePassed: true, screeningClockExpired: false, suspended: false, postRequiresSiaLicence: false, siaLicenceExpiry: null, rightToWorkExpiry: null };
  check("the gate's own reason is the blocker's wording",
    evaluateDeployability({ ...base, deploymentGatePassed: false, gateBlockedBy: ["No screening file has been opened (7.4a)"] })
      .blockers[0]!.label.includes("No screening file"));
  check("unsuccessful screening blocks deployment", !evaluateDeployability({ ...base, screeningUnsuccessful: true }).deployable);
}

// --- career and history ----------------------------------------------------
{
  const d = (x: string) => new Date(`${x}T00:00:00Z`);
  const ref = d("2026-09-01");
  const w = screeningWindow({ reference: ref, dateOfBirth: null, years: 5 });
  const period = (from: string, to: string | null, verified: boolean, extra: Partial<Period> = {}): Period => ({
    id: from, kind: "employment", statedFrom: d(from), statedTo: to ? d(to) : null, isCurrent: to === null,
    permissionToContact: null, firstRequestAt: null, secondRequestAt: null, verifiedAt: verified ? ref : null, ...extra,
  });

  check("the window is the five years before screening began (3.13)",
    dateOf(w.from).toISOString().slice(0, 10) === "2021-09-01" && dateOf(w.to).toISOString().slice(0, 10) === "2026-09-01");
  check("or back only to the 16th birthday, if that is later (3.13)",
    dateOf(screeningWindow({ reference: ref, dateOfBirth: d("2008-03-15"), years: 5 }).from).toISOString().slice(0, 10) === "2024-03-15");
  check("overlapping and touching periods merge",
    JSON.stringify(merge([{ from: 1, to: 5 }, { from: 6, to: 8 }, { from: 3, to: 4 }, { from: 20, to: 22 }])) === JSON.stringify([{ from: 1, to: 8 }, { from: 20, to: 22 }]));

  const whole = [period("2021-01-01", "2023-12-31", true), period("2024-01-01", null, true)];
  const all = analyseHistory({ periods: whole, window: w, reference: ref });
  check("a fully verified continuous history is done", all.fullDone && all.limitedDone && all.unverifiedDays === 0 && all.holes.length === 0);

  const shortGap = [period("2021-01-01", "2023-12-31", true), period("2024-01-20", null, true)];
  const sg = analyseHistory({ periods: shortGap, window: w, reference: ref });
  check("a gap of 31 days or less is allowed unverified (7.7)", sg.fullDone && sg.unverified.length === 1 && sg.unverifiedDays === 0);
  check("but it shows as a hole in the stated timeline", sg.holes.length === 1);

  const longGap = [period("2021-01-01", "2023-12-31", true), period("2024-03-01", null, true)];
  const lg = analyseHistory({ periods: longGap, window: w, reference: ref });
  check("a gap over 31 days blocks full screening", !lg.fullDone && lg.overLimit.length === 1 && lg.unverifiedDays === 60);
  check("…and limited screening, when it falls in the last three years (7.5.2a)", !lg.limitedDone);

  const oldGap = [period("2021-01-01", "2021-12-31", true), period("2022-06-01", null, true)];
  const og = analyseHistory({ periods: oldGap, window: w, reference: ref });
  check("a gap older than three years blocks full screening but not limited", !og.fullDone && og.limitedDone);

  const unverifiedJob = [period("2021-01-01", "2023-12-31", false), period("2024-01-01", null, true)];
  check("a stated but unverified period counts as unverified", !analyseHistory({ periods: unverifiedJob, window: w, reference: ref }).fullDone);
  check("an approved statutory declaration covers its period (7.7i)",
    analyseHistory({ periods: longGap, window: w, reference: ref, declarations: [{ from: d("2024-01-01"), to: d("2024-02-29") }] }).fullDone);
  check("confirmed dates win over stated ones",
    !analyseHistory({ periods: [period("2021-01-01", null, true, { confirmedFrom: d("2023-01-01") })], window: w, reference: ref }).fullDone);

  check("working days skip weekends", workingDaysBetween(d("2026-09-04"), d("2026-09-11")) === 5);
  const asked = (days: number, second = false) => period("2022-01-01", "2023-01-01", false, {
    firstRequestAt: new Date(ref.getTime() - days * 86_400_000), secondRequestAt: second ? ref : null,
  });
  check("2nd request due at 10 working days", chaseState(asked(15), ref)!.next === "Send the 2nd request");
  check("documentary route at 20 working days", chaseState(asked(29, true), ref)!.next.startsWith("Switch to the documentary route"));
  check("escalate at 30 working days", chaseState(asked(43, true), ref)!.severity === "critical");

  check("a current employer is not approached without permission (7.7b)",
    requestProblem(period("2024-01-01", null, false), "Switchboard from the company website") !== null);
  check("…and with permission, it can be",
    requestProblem(period("2024-01-01", null, false, { permissionToContact: true }), "Switchboard from the company website") === null);
  check("no request without recording how the contact was found (7.5.2a)",
    requestProblem(period("2022-01-01", "2023-01-01", false), "") !== null);
  check("a career break is verified from documents, not a reference",
    requestProblem(period("2022-01-01", "2023-01-01", false, { kind: "career_break" }), "Switchboard from the company website") !== null);
  check("two documents of the same type are refused",
    verifyProblem({ period: period("2022-01-01", "2023-01-01", false), method: "documentary", contactVerifiedHow: null, documentStart: "Payslip", documentEnd: "payslip", confirmedFrom: null, confirmedTo: null }) !== null);
  check("a payslip and a P60 are accepted",
    verifyProblem({ period: period("2022-01-01", "2023-01-01", false), method: "documentary", contactVerifiedHow: null, documentStart: "Payslip", documentEnd: "P60", confirmedFrom: null, confirmedTo: null }) === null);
  check("a reference only counts with the contact established",
    verifyProblem({ period: period("2022-01-01", "2023-01-01", false), method: "reference", contactVerifiedHow: "", documentStart: "", documentEnd: "", confirmedFrom: null, confirmedTo: null }) !== null);
}

// --- documents on a screening file --------------------------------------------
{
  const bytes = (...b: number[]) => new Uint8Array(b);
  const pdf = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
  const jpg = bytes(0xff, 0xd8, 0xff, 0xe0);
  const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const exe = bytes(0x4d, 0x5a, 0x90, 0x00);
  check("PDF, JPEG and PNG are recognised from their bytes",
    sniffMime(pdf) === "application/pdf" && sniffMime(jpg) === "image/jpeg" && sniffMime(png) === "image/png");
  check("anything else is not, whatever it is called", sniffMime(exe) === null);

  const base = { typeId: "sia_licence", hasFile: true, sizeBytes: 50_000, mime: "application/pdf" as const, outcome: "", documentDate: null, expiresAt: new Date(Date.now() + 400 * 86_400_000), originalSeen: false };
  check("an SIA licence scan with its expiry is accepted", uploadProblem(base) === null);
  check("an expiring document needs its expiry", uploadProblem({ ...base, expiresAt: null }) !== null);
  check("an expired document is refused", uploadProblem({ ...base, expiresAt: new Date(Date.now() - 5 * 86_400_000) }) !== null);
  check("over 10 MB is refused", uploadProblem({ ...base, sizeBytes: 11 * 1024 * 1024 }) !== null);
  check("a file that is not really a PDF, JPEG or PNG is refused", uploadProblem({ ...base, mime: null }) !== null);
  check("photographic identity needs the original examined (7.4c)",
    uploadProblem({ ...base, typeId: "photo_id" }) !== null && uploadProblem({ ...base, typeId: "photo_id", originalSeen: true }) === null);
  check("a criminality certificate is never uploaded (7.7j)",
    uploadProblem({ ...base, typeId: "criminal_record_outcome", outcome: "No convictions shown" }) !== null);
  check("its outcome is recorded instead",
    uploadProblem({ ...base, typeId: "criminal_record_outcome", hasFile: false, outcome: "No convictions shown" }) === null);
  const addr = { ...base, typeId: "address_proof", expiresAt: null };
  check("proof of address needs its date", uploadProblem({ ...addr, documentDate: null }) !== null);
  check("proof of address over 12 months old is refused", uploadProblem({ ...addr, documentDate: new Date(Date.now() - 400 * 86_400_000) }) !== null);
  check("over three months is accepted with a warning about which kinds",
    uploadProblem({ ...addr, documentDate: new Date(Date.now() - 120 * 86_400_000) }) === null &&
    uploadWarning("address_proof", new Date(Date.now() - 120 * 86_400_000)) !== null);
  check("a type that is not a screening document is refused", uploadProblem({ ...base, typeId: "client_contract" }) !== null);
}

// --- retention -------------------------------------------------------------
{
  const d = (x: string) => new Date(`${x}T00:00:00Z`);
  check("an unsuccessful applicant's records are due 12 months after withdrawal (11.1, C14)",
    retentionDue("candidacy", d("2025-09-23")).toISOString().slice(0, 10) === "2026-09-23");
  check("a leaver's records are due seven years after employment ceased (11.3)",
    retentionDue("employment", d("2019-08-31")).toISOString().slice(0, 10) === "2026-08-31");
  check("due on the day itself", isDue(d("2026-09-23"), d("2026-09-23")));
  check("not a day early", !isDue(d("2026-09-24"), d("2026-09-23")));
}

// --- client requirements (Track A) ------------------------------------------
{
  const pool = { source: "pool" as const };
  const rec = { source: "recruited" as const };
  const h3 = (live: { source: "pool" | "recruited" }[]) => headcount(3, live);
  check("headcount counts allocations: two of three", h3([pool, rec]).allocated === 2 && h3([pool, rec]).remaining === 1);
  check("fully covered from the pool closes as covered internally (A3a)",
    statusAfterAllocation({ current: "pool_check", hc: h3([pool, pool, pool]), released: false }) === "covered_internally");
  check("fully covered once HR was involved is allocated, waiting to be filled (A4)",
    statusAfterAllocation({ current: "released_to_sourcing", hc: h3([pool, rec, rec]), released: true }) === "allocated");
  check("part covered from the pool stays at the pool check",
    statusAfterAllocation({ current: "received", hc: h3([pool]), released: false }) === "pool_check");
  check("part covered after release stays with HR",
    statusAfterAllocation({ current: "allocated", hc: h3([rec]), released: true }) === "released_to_sourcing");
  check("filled is never set by an allocation",
    statusAfterAllocation({ current: "filled", hc: h3([]), released: true }) === "filled");
  check("release needs the reason the pool cannot cover it",
    releaseProblem({ status: "pool_check", hc: h3([pool]), note: "none" }) !== null &&
    releaseProblem({ status: "pool_check", hc: h3([pool]), note: "Nobody in the pool holds a door supervisor licence" }) === null);
  check("nothing to release once every place is covered", releaseProblem({ status: "pool_check", hc: h3([pool, pool, pool]), note: "x".repeat(20) }) !== null);
  check("not filled while places remain", fillProblem({ status: "allocated", hc: h3([pool, rec]) }) !== null);
  check("filled once every place is allocated", fillProblem({ status: "allocated", hc: h3([pool, rec, rec]) }) === null);
  check("references run on and are never reused", nextReference(["REQ-1047", "REQ-1049", "REQ-1042"]) === "REQ-1050" && nextReference([]) === "REQ-1001");
  const soon = new Date(Date.now() + 3 * 86_400_000);
  check("starting within a week with places open is at risk", atRisk({ status: "released_to_sourcing", startDate: soon, hc: h3([pool]) }));
  check("…but not once covered", !atRisk({ status: "allocated", startDate: soon, hc: h3([pool, pool, pool]) }));
}

// --- building the rota -------------------------------------------------------
{
  // UK time, whatever the machine running this is set to.
  check("a summer 19:00 in the UK is 18:00 UTC", ukInstant("2026-09-29", "19:00").toISOString() === "2026-09-29T18:00:00.000Z");
  check("a winter 19:00 in the UK is 19:00 UTC", ukInstant("2026-12-01", "19:00").toISOString() === "2026-12-01T19:00:00.000Z");
  check("an instant reads back as the same UK date and time",
    ukDate(ukInstant("2026-10-24", "23:30")) === "2026-10-24" && ukTime(ukInstant("2026-10-24", "23:30")) === "23:30");
  const night = shiftWindow("2026-10-24", "19:00", "07:00");
  check("an end before the start is the next morning", ukDate(night.endsAt) === "2026-10-25" && ukTime(night.endsAt) === "07:00");
  check("the night the clocks go back is thirteen hours long", (night.endsAt.getTime() - night.startsAt.getTime()) / 3_600_000 === 13);
  check("a rota week starts on the Monday", mondayOf("2026-09-24") === "2026-09-21" && mondayOf("2026-09-27") === "2026-09-21" && mondayOf("2026-09-28") === "2026-09-28");

  const nights = parsePattern("Mon–Sun 1900–0700");
  check("a post's pattern gives its days and hours", !!nights && nights.days.length === 7 && nights.start === "19:00" && nights.end === "07:00");
  check("weekend patterns are the weekend", JSON.stringify(parsePattern("Sat–Sun 0600–1800")?.days) === "[5,6]");
  check("ranges wrap round the week", JSON.stringify(parsePattern("Fri-Mon 07:00-19:00")?.days) === "[0,4,5,6]");
  check("lists of days read", JSON.stringify(parsePattern("Mon, Wed, Fri 0700–1900")?.days) === "[0,2,4]");
  check("a pattern it cannot read draws no gaps rather than wrong ones",
    parsePattern("As agreed with the client") === null && parsePattern("Mon–Sun") === null && parsePattern(null) === null);

  const t = (iso: string) => new Date(iso);
  const wesley = [{ startsAt: t("2026-09-29T18:00Z"), endsAt: t("2026-09-30T06:00Z"), label: "Night gatehouse" }];
  check("an overlapping shift is a clash", clashWith(wesley, { startsAt: t("2026-09-30T05:00Z"), endsAt: t("2026-09-30T17:00Z") })?.label === "Night gatehouse");
  check("back to back is not a clash", clashWith(wesley, { startsAt: t("2026-09-30T06:00Z"), endsAt: t("2026-09-30T18:00Z") }) === null);
  check("rest is the gap to the nearest shift", shortestRest(wesley, { startsAt: t("2026-09-30T14:00Z"), endsAt: t("2026-09-30T22:00Z") }) === 8);
  check("hours count only the part inside the week", hoursWithin(wesley, t("2026-09-29T23:00Z"), t("2026-10-05T23:00Z")) === 7);

  const later = { startsAt: t("2026-10-01T18:00Z"), endsAt: t("2026-10-02T06:00Z") };
  const now = t("2026-09-24T10:00Z");
  check("a yes about a future shift is recorded", askProblem({ channel: "phone", answer: "yes", windows: [later], now }) === null);
  check("an ask needs at least one shift", askProblem({ channel: "phone", answer: "yes", windows: [], now }) !== null);
  check("a shift under way can still be filled", askProblem({ channel: "phone", answer: "yes", windows: [later], now: t("2026-10-01T19:00Z") }) === null);
  check("…but not one that has finished", askProblem({ channel: "phone", answer: "yes", windows: [later], now: t("2026-10-02T06:00Z") }) !== null);
  check("asked in person, there is no 'no answer'", askProblem({ channel: "in_person", answer: "no_answer", windows: [later], now }) !== null);
  check("an unknown channel or answer is refused",
    askProblem({ channel: "pigeon", answer: "yes", windows: [later], now }) !== null && askProblem({ channel: "sms", answer: "maybe", windows: [later], now }) !== null);
  check("a 20-hour shift is a typo", askProblem({ channel: "phone", answer: "yes", windows: [{ startsAt: later.startsAt, endsAt: t("2026-10-02T14:00Z") }], now }) !== null);

  const f = (name: string, o: Partial<{ regular: boolean; allocatedHere: boolean; shiftsHere: number; saidNo: boolean }> = {}) =>
    ({ name, regular: false, allocatedHere: false, shiftsHere: 0, saidNo: false, ...o });
  const order = [f("Amy"), f("Zoe", { regular: true }), f("Bea", { shiftsHere: 4 }), f("Cal", { allocatedHere: true }), f("Dee", { regular: true, saidNo: true })]
    .sort(candidateOrder)
    .map((c) => c.name);
  check("ask the regular officer first, then allocated, then who knows the post; a no drops to the bottom",
    order.join(",") === "Zoe,Cal,Bea,Amy,Dee", order.join(","));
}

// --- changing the rota on the night, and weekly hours -----------------------
{
  const t = (iso: string) => new Date(iso);
  // Weekly hours, per rota week (UK Monday to Sunday).
  const nights = ["2026-09-28", "2026-09-29", "2026-09-30"].map((d) => shiftWindow(d, "19:00", "07:00"));
  check("three 12-hour nights are 36 hours", hoursProblem([], nights, 36) === null && hoursProblem([], nights, 35) !== null);
  const over = hoursProblem(nights, [shiftWindow("2026-10-01", "19:00", "07:00")], 40);
  check("a fourth night over a 40-hour week is refused, and says by how much", !!over && /48h/.test(over) && /40h week/.test(over), over ?? "");
  const sunday = shiftWindow("2026-10-04", "19:00", "07:00");
  check("a Sunday night is in two rota weeks", weeksOf(sunday).join(",") === "2026-09-28,2026-10-05");
  check("…and counts in each only the hours inside it (5h, then 7h)", hoursProblem([], [sunday], 7) === null && hoursProblem([], [sunday], 6) !== null);

  // Taking an officer off.
  const shift = { startsAt: t("2026-09-29T18:00Z"), endsAt: t("2026-09-30T06:00Z") };
  const before = offWindow(shift, t("2026-09-29T16:02Z"));
  check("off before the shift: the whole shift needs cover",
    before.ok && !before.started && before.cover.startsAt.getTime() === shift.startsAt.getTime());
  const during = offWindow(shift, t("2026-09-29T22:00:30Z"));
  check("off part-way: the rest of the shift needs cover, from the minute",
    during.ok && during.started && during.cover.startsAt.toISOString() === "2026-09-29T22:00:00.000Z" && during.cover.endsAt.getTime() === shift.endsAt.getTime());
  check("a finished shift cannot be come off", !offWindow(shift, t("2026-09-30T06:00Z")).ok);

  // New hours.
  const now = t("2026-09-29T12:00Z");
  check("new hours before the shift", newHoursProblem(shift, { startsAt: t("2026-09-29T17:00Z"), endsAt: t("2026-09-30T05:00Z") }, now) === null);
  check("the same hours are not a change", newHoursProblem(shift, shift, now) !== null);
  const started = t("2026-09-29T20:00Z");
  check("once started only the end moves",
    newHoursProblem(shift, { startsAt: shift.startsAt, endsAt: t("2026-09-30T08:00Z") }, started) === null &&
    newHoursProblem(shift, { startsAt: t("2026-09-29T19:00Z"), endsAt: shift.endsAt }, started) !== null);

  // A shift already under way is offered from now, to the minute.
  const offered = fromNow(shift, t("2026-09-29T20:40:30Z"));
  check("a shift under way is offered from now", offered.startsAt.toISOString() === "2026-09-29T20:40:00.000Z" && offered.endsAt.getTime() === shift.endsAt.getTime());
  check("a shift ahead is offered whole", fromNow(shift, now).startsAt.getTime() === shift.startsAt.getTime());

  // What the roster shows.
  const base = { state: "published", ...shift };
  check("published, ahead", rosterState(base, now) === "published");
  check("happening now", rosterState(base, started) === "on_shift");
  check("finished", rosterState(base, t("2026-09-30T07:00Z")) === "done");
  check("a draft, and a blocked draft", rosterState({ ...base, state: "draft" }, now) === "draft" && rosterState({ ...base, state: "draft", blocked: true }, now) === "blocked");
  check("cover and changed hours are their own colours",
    rosterState({ ...base, isCover: true }, now) === "cover" && rosterState({ ...base, amended: true }, now) === "changed");
  check("an officer who came off shows as off, whatever else is true", rosterState({ ...base, cameOff: true, isCover: true }, now) === "off");
}

// --- planning in bulk ----------------------------------------------------------
{
  // Creating the rota: posts × chosen days in the range × times.
  const now0 = new Date("2026-09-24T10:00Z");
  check("the range includes both ends", datesBetween("2026-09-28", "2026-10-04").length === 7);
  const weekdaysOnly = slotsFor({ from: "2026-09-28", to: "2026-10-11", weekdays: [0, 1, 2, 3, 4], times: [{ start: "09:00", end: "17:00" }] });
  check("two weeks of weekdays at 9 to 5 is ten shifts", weekdaysOnly.length === 10 && weekdaysOnly.every((w) => ukTime(w.startsAt) === "09:00"));
  const dayNight = slotsFor({ from: "2026-09-28", to: "2026-09-30", weekdays: [0, 1, 2, 3, 4, 5, 6], times: [{ start: "07:00", end: "19:00" }, { start: "19:00", end: "07:00" }] });
  check("day and night over three days is six shifts, nights ending next morning",
    dayNight.length === 6 && ukDate(dayNight[1].endsAt) === "2026-09-29" && ukTime(dayNight[1].endsAt) === "07:00");
  const good = { postIds: ["p"], from: "2026-09-28", to: "2026-10-25", weekdays: [0, 1, 2, 3, 4, 5, 6], times: [{ start: "09:00", end: "17:00" }], now: now0 };
  check("a month of shifts on a post can be created", createProblem(good) === null);
  check("no post, no shifts", createProblem({ ...good, postIds: [] }) !== null);
  check("the last day before the first is refused", createProblem({ ...good, from: "2026-10-25", to: "2026-09-28" }) !== null);
  check("more than three months at once is refused", createProblem({ ...good, to: "2027-01-30" }) !== null);
  check("days already passed are refused", createProblem({ ...good, from: "2026-09-01", to: "2026-09-10" }) !== null);
  check("day and night together are fine", createProblem({ ...good, times: [{ start: "07:00", end: "19:00" }, { start: "19:00", end: "07:00" }] }) === null);
  check("two times that overlap on one post are refused",
    /overlap/.test(createProblem({ ...good, times: [{ start: "07:00", end: "19:00" }, { start: "09:00", end: "17:00" }] }) ?? ""));
  check("a night that runs into the next morning's day shift is refused",
    /overlap/.test(createProblem({ ...good, times: [{ start: "08:00", end: "18:00" }, { start: "20:00", end: "09:00" }] }) ?? ""));
  check("a 20-hour shift is refused", createProblem({ ...good, times: [{ start: "06:00", end: "02:00" }] }) !== null);

  // Leave: approved is unavailable, pending is a warning.
  const leave = [
    { startsAt: new Date("2026-10-05T00:00Z"), endsAt: new Date("2026-10-10T00:00Z"), approved: true },
    { startsAt: new Date("2026-10-20T00:00Z"), endsAt: new Date("2026-10-22T00:00Z"), approved: false },
  ];
  check("a shift on approved leave is refused", /approved leave/.test(leaveProblem(leave, shiftWindow("2026-10-06", "09:00", "17:00")) ?? ""));
  check("a shift during a leave request still waiting is not refused, only flagged",
    leaveProblem(leave, shiftWindow("2026-10-20", "09:00", "17:00")) === null && leavePending(leave, shiftWindow("2026-10-20", "09:00", "17:00")));

  // A batch is checked against the rota and against itself.
  const now = new Date("2026-09-24T10:00Z");
  const night = (date: string) => shiftWindow(date, "19:00", "07:00");
  const item = (key: string, personId: string, postId: string, date: string) => ({ key, personId, postId, ...night(date), label: postId });
  const ctx = (overrides: Partial<Parameters<typeof planBatch>[1]> = {}) => ({
    busyByPerson: new Map(),
    busyByPost: new Map(),
    weeklyHoursOf: () => 48,
    blockerFor: () => null,
    now,
    ...overrides,
  });
  const month = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"].map((d, i) => item(`k${i}`, "wes", "gate", d));
  check("four nights for one officer on one post are accepted", planBatch(month, ctx()).accepted.length === 4);
  const twice = planBatch([item("a", "wes", "gate", "2026-09-28"), item("b", "wes", "depot", "2026-09-28")], ctx());
  check("the same officer twice on one night: the second is refused", twice.accepted.length === 1 && twice.refused[0]?.item.key === "b" && /Already on gate/.test(twice.refused[0].reason));
  const both = planBatch([item("a", "wes", "gate", "2026-09-28"), item("b", "liam", "gate", "2026-09-28")], ctx());
  check("two officers for one post on one night: the second is refused", both.refused.length === 1 && /already on this post/.test(both.refused[0].reason));
  const five = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((d, i) => item(`n${i}`, "wes", "gate", d));
  const capped = planBatch(five, ctx({ weeklyHoursOf: () => 48 }));
  check("a fifth 12-hour night in the week goes over 48h, and only it is refused",
    capped.accepted.length === 4 && capped.refused.length === 1 && capped.refused[0].item.key === "n4" && /60h/.test(capped.refused[0].reason));
  const held = planBatch([item("a", "wes", "gate", "2026-09-28")], ctx({ busyByPerson: new Map([["wes", [{ ...night("2026-09-28"), label: "Depot 7" }]]]) }));
  check("a clash with the rota as it stands is refused", held.refused.length === 1 && /Depot 7/.test(held.refused[0].reason));
  const blocked = planBatch(month, ctx({ blockerFor: (i) => (i.key === "k2" ? "SIA licence expired 1 days ago" : null) }));
  check("a blocked shift is refused with its reason, and the rest go ahead",
    blocked.accepted.length === 3 && blocked.refused[0].reason.startsWith("SIA licence expired"));
  // Suggestions: the regular officer first, then whoever has the fewest hours; nobody over their week.
  const slots = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"].map((d, i) => ({ key: `s${i}`, postId: "gate", ...night(d) }));
  const picks = suggestOfficers(slots, {
    officerIds: ["wes", "liam", "amy"],
    busyByPerson: new Map(),
    busyByPost: new Map(),
    weeklyHoursOf: () => 48,
    blockerFor: (i) => (i.personId === "amy" ? "SIA licence expired 3 days ago" : null),
    preference: (id) => (id === "wes" ? 100 : 0),
    now,
  });
  const byWho = [...picks.values()];
  check("the regular officer gets the first four nights, up to 48 hours", byWho.filter((w) => w === "wes").length === 4 && picks.get("s0") === "wes");
  check("the fifth goes to the next free officer, not over anyone's hours", picks.get("s4") === "liam");
  check("a blocked officer is never suggested", !byWho.includes("amy"));
  check("the busiest week of a span is what is measured against the limit",
    busiestWeek([night("2026-09-28"), night("2026-09-29"), night("2026-10-06")], "2026-09-28", 2) === 24);
}

// --- duty checks: chase-up, book-on, check calls ------------------------------
{
  const t = (iso: string) => new Date(iso);
  const start = t("2026-09-24T18:00Z"); // 19:00 UK
  const chase = (nowIso: string, attempts: { at: string; outcome: "confirmed" | "no_answer" | "cannot_attend" }[] = []) =>
    chaseUpStatus(start, attempts.map((a) => ({ at: t(a.at), outcome: a.outcome })), t(nowIso));
  check("more than two hours out, the chase-up is not due", chase("2026-09-24T15:30Z").state === "not_due");
  check("inside two hours, it is due", chase("2026-09-24T16:30Z").state === "due");
  check("tried with no answer, it says so", chase("2026-09-24T16:40Z", [{ at: "2026-09-24T16:35Z", outcome: "no_answer" }]).state === "no_answer");
  check("under an hour to go and not confirmed, it is urgent", chase("2026-09-24T17:10Z", [{ at: "2026-09-24T16:35Z", outcome: "no_answer" }]).severity === "critical");
  check("confirmed is confirmed, whatever was tried before",
    chase("2026-09-24T17:30Z", [{ at: "2026-09-24T16:35Z", outcome: "no_answer" }, { at: "2026-09-24T16:50Z", outcome: "confirmed" }]).state === "confirmed");
  check("started without a confirmation is the book-on's problem now", chase("2026-09-24T18:05Z").state === "missed");
  check("the chase-up opens two hours before", chase("2026-09-24T15:00Z").dueAt.toISOString() === "2026-09-24T16:00:00.000Z");

  // The hourly calls, as a timeline.
  const bookOn = t("2026-09-24T18:00Z");
  const end = t("2026-09-25T06:00Z");
  const sched = checkCallSchedule(bookOn, end, [t("2026-09-24T18:55Z"), t("2026-09-24T20:10Z")], t("2026-09-24T20:30Z"));
  check("a call inside the hour is done", sched.slots[0].kind === "done");
  check("a call after the hour is late, and by how much", sched.slots[1].kind === "late" && sched.slots[1].minutesLate === 15);
  check("the next is due an hour after the last contact", sched.nextDue?.toISOString() === "2026-09-24T21:10:00.000Z");
  check("the rest are projected hourly to the end of the shift", sched.upcoming === 9 && sched.slots.at(-1)!.dueAt.toISOString() === "2026-09-25T05:10:00.000Z");
  const lapsed = checkCallSchedule(bookOn, end, [t("2026-09-24T18:55Z")], t("2026-09-24T20:10Z"));
  check("an hour gone with no call is missed — no grace", lapsed.missed === 1 && lapsed.slots.at(-1)!.kind === "missed" && lapsed.slots.at(-1)!.minutesLate === 15);
  check("while a call is missed, nothing is projected past it", lapsed.upcoming === 0);

  // Nights and weekends: Day patrol and Concierge desk (Control, 24 September 2026).
  const tue = (a: string, b: string) => callsRequiredFor("nights_and_weekends", t(a), t(b));
  check("a weekday day shift on a nights-and-weekends post makes no calls", !tue("2026-09-29T06:00Z", "2026-09-29T18:00Z").required);
  check("a weekday night shift makes them", tue("2026-09-29T18:00Z", "2026-09-30T06:00Z").required && tue("2026-09-29T18:00Z", "2026-09-30T06:00Z").why === "Night duty");
  check("a day shift running past 22:00 is night duty", tue("2026-09-29T11:00Z", "2026-09-29T22:00Z").required);
  check("a Saturday day shift makes them", callsRequiredFor("nights_and_weekends", t("2026-10-03T06:00Z"), t("2026-10-03T18:00Z")).why === "Weekend");
  check("always and never mean what they say",
    callsRequiredFor("always", t("2026-09-29T06:00Z"), t("2026-09-29T18:00Z")).required && !callsRequiredFor("never", t("2026-10-03T21:00Z"), t("2026-10-04T05:00Z")).required);

  // Where a duty sits in the flow.
  const post = { id: "p", siteId: "s", name: "Gate", pattern: "", requiresSiaLicence: true, screeningPeriodYears: 5 as const, checkCallsRequired: true, loneWorking: false, mobileSignal: true };
  const duty = (over: Partial<DutyInput>, nowIso: string) =>
    dutyStatus(
      {
        assignment: { id: "a", personId: "x", postId: "p", startsAt: "2026-09-24T18:00:00Z", endsAt: "2026-09-25T06:00:00Z", state: "published", publishedAt: null, amendments: [] },
        post,
        bookOn: undefined,
        calls: [],
        attempts: [],
        chaseUps: [],
        ...over,
      },
      t(nowIso),
    );
  check("hours ahead, the duty is just confirmed", duty({}, "2026-09-24T12:00Z").stage === "scheduled");
  check("inside two hours, it is at the chase-up", duty({}, "2026-09-24T16:30Z").stage === "chase_up");
  check("confirmed, and nearly time, it waits for the book-on",
    duty({ chaseUps: [{ at: "2026-09-24T16:30Z", outcome: "confirmed" }] }, "2026-09-24T17:30Z").stage === "awaiting_book_on");
  check("half an hour past the start with no book-on is a no-show", duty({}, "2026-09-24T18:31Z").stage === "no_show");
  const on = { bookOn: { assignmentId: "a", at: "2026-09-24T17:58:00Z", channel: "site_phone" as const, locationVerified: false } };
  check("booked on and calling, on duty", duty({ ...on, calls: [{ id: "c", assignmentId: "a", at: "2026-09-24T18:50:00Z", channel: "phone", allWell: true, note: null }] }, "2026-09-24T19:30Z").stage === "on_duty");
  check("booked on and an hour silent, the alert", duty(on, "2026-09-24T19:05Z").stage === "alert");
}

// --- 1z. the Control Room, live (25 September 2026) ---------------------
{
  const t = (iso: string) => new Date(iso);
  // Eleven hours' rest, enforced.
  const early = { startsAt: t("2026-09-29T06:00:00Z"), endsAt: t("2026-09-29T14:00:00Z"), label: "Day gate" };
  const late = { startsAt: t("2026-09-29T20:00:00Z"), endsAt: t("2026-09-30T04:00:00Z") };
  check("six hours between shifts is refused", restProblem([early], [late])?.includes("Only 6h rest after Day gate") === true, String(restProblem([early], [late])));
  check("eleven hours is enough", restProblem([early], [{ startsAt: t("2026-09-30T01:00:00Z"), endsAt: t("2026-09-30T09:00:00Z") }]) === null);
  check("a relief that hands straight over is one stretch, not a gap", restProblem([early], [{ startsAt: t("2026-09-29T14:00:00Z"), endsAt: t("2026-09-29T18:00:00Z") }]) === null);
  check("two shifts in one plan are checked against each other", restProblem([], [early, late]) !== null);
  const nights = [0, 1, 2, 3].map((i) => ({ key: `n${i}`, postId: "gate", personId: "wes", startsAt: t(`2026-10-0${i + 1}T18:00:00Z`), endsAt: t(`2026-10-0${i + 2}T06:00:00Z`) }));
  check("four back-to-back 12-hour nights still pass (12h rest each)", planBatch(nights, { busyByPerson: new Map(), busyByPost: new Map(), weeklyHoursOf: () => 60, blockerFor: () => null, now: t("2026-09-30T00:00:00Z") }).accepted.length === 4);
  const tight = planBatch([nights[0], { key: "d", postId: "depot", personId: "wes", startsAt: t("2026-10-02T12:00:00Z"), endsAt: t("2026-10-02T17:00:00Z") }], { busyByPerson: new Map(), busyByPost: new Map(), weeklyHoursOf: () => 60, blockerFor: () => null, now: t("2026-09-30T00:00:00Z") });
  check("a bulk plan refuses a shift six hours after a night", tight.refused.length === 1 && /rest/.test(tight.refused[0].reason), tight.refused.map((r) => r.reason).join());

  // Who is asked first, with what officers said in their portal.
  const base = { regular: false, allocatedHere: false, shiftsHere: 0, saidNo: false };
  const order = [
    { ...base, name: "Cara", said: "unavailable" as const },
    { ...base, name: "Amir", said: null },
    { ...base, name: "Bea", said: "available" as const },
    { ...base, name: "Reg", regular: true, said: null },
  ].sort(candidateOrder).map((c) => c.name);
  check("the regular officer first, then who said they are free, then the rest; not free last", order.join() === "Reg,Bea,Amir,Cara", order.join());

  // Selfie location.
  const site = { lat: 51.5155, lng: -0.0922, radiusMetres: 200 };
  check("a selfie 50 m away is at the site", judgeLocation({ lat: 51.5159, lng: -0.0922, accuracy: 15 }, site).atSite === true);
  const home = judgeLocation({ lat: 51.55, lng: -0.1, accuracy: 15 }, site);
  check("a selfie 3.9 km away is not", home.atSite === false && home.distance! > 3500 && home.distance! < 4200, String(home.distance));
  check("a fix too vague to mean anything is not judged", judgeLocation({ lat: 51.52, lng: -0.09, accuracy: 900 }, site).atSite === null);
  check("a site with no location is not judged", judgeLocation({ lat: 51.52, lng: -0.09, accuracy: 10 }, null).atSite === null);
  check("away from the site is critical, in words", proofVerdict({ atSite: false, distanceMetres: 3900, accuracyMetres: 15, liveCamera: true, hasLocation: true, siteHasLocation: true }).label === "Selfie 3.9 km from the site");
  check("a gallery photo is weaker whatever it shows", proofVerdict({ atSite: true, distanceMetres: 40, accuracyMetres: 15, liveCamera: false, hasLocation: true, siteHasLocation: true }).severity === "warning");
  const code = newProofCode((n) => Uint8Array.from({ length: n }, (_, i) => i * 7));
  check("a proof code reads cleanly and is recognised", isProofCode(code) && !/[01OIL]/.test(code), code);
  check("a location is read from a Google Maps link", JSON.stringify(parseLatLng("https://www.google.com/maps/place/x/@51.5155,-0.0922,17z")) === JSON.stringify({ lat: 51.5155, lng: -0.0922 }));
  check("…and from plain coordinates", parseLatLng("51.5074, -0.1278")?.lng === -0.1278);
  check("…and nonsense is not a place", parseLatLng("the gatehouse") === null && parseLatLng("95, 10") === null);

  // Alerts and the queue.
  check("a missed check call is an alarm", isAlarm({ title: "Check call missed: Kieran Doyle, …", slaDays: 0 }));
  check("an offer to work is not", !isAlarm({ title: "Offered to work: Wesley Anand — …", slaDays: 1 }));
  check("an uncovered shift is recognised", alertKind("Uncovered shift: Night gatehouse at Meridian — Depot 4, …") === "uncovered");
  check("an officer is reminded three times, five minutes apart", pushDue({ sent: [], now: t("2026-09-29T10:00:00Z"), officer: true }) &&
    !pushDue({ sent: [t("2026-09-29T09:57:00Z")], now: t("2026-09-29T10:00:00Z"), officer: true }) &&
    pushDue({ sent: [t("2026-09-29T09:54:00Z")], now: t("2026-09-29T10:00:00Z"), officer: true }) &&
    !pushDue({ sent: [t("2026-09-29T09:40:00Z"), t("2026-09-29T09:45:00Z"), t("2026-09-29T09:50:00Z")], now: t("2026-09-29T10:00:00Z"), officer: true }));
  check("a Control desk is pushed each alert once", !pushDue({ sent: [t("2026-09-29T09:40:00Z")], now: t("2026-09-29T10:00:00Z"), officer: false }));
  check("an uncovered shift within two hours is critical", uncoveredSeverity(t("2026-09-29T11:30:00Z"), t("2026-09-29T10:00:00Z")) === "critical" && uncoveredSeverity(t("2026-09-30T08:00:00Z"), t("2026-09-29T10:00:00Z")) === "warning");

  // Clients, sites and posts.
  check("a client needs a name and a 5- or 10-year period", clientProblem({ name: "A", screeningPeriodYears: 5, contractStart: null, contractEnd: null }) !== null && clientProblem({ name: "Acme", screeningPeriodYears: 7, contractStart: null, contractEnd: null }) !== null && clientProblem({ name: "Acme", screeningPeriodYears: 10, contractStart: null, contractEnd: null }) === null);
  check("a site's location must be readable", siteProblem({ name: "HQ", address: null, contactPhone: null, radiusMetres: 200, locationText: "near the station", location: null }) !== null);
  check("a post's rule is one of the three", postProblem({ name: "Gate", pattern: null, screeningPeriodYears: 5, checkCalls: "sometimes", phone: null, instructions: null }) !== null);
}

// --- 2. every action guards ------------------------------------------------
let actionCount = 0;
for (const file of ["operations", "admin", "delegation", "accounts", "recruitment", "onboarding", "screening", "screening-exceptions", "history", "screening-documents", "requirements", "rota", "duty", "me", "alerts", "work", "places", "officers", "welfare"]) {
  const src = readFileSync(new URL(`../lib/actions/${file}.ts`, import.meta.url), "utf8");
  const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
  check(`${file}.ts has server actions to check`, exported.length > 0, `${exported.length} found`);
  actionCount += exported.length;

  for (const name of exported) {
    const start = src.indexOf(`export async function ${name}(`);
    const next = exported
      .map((n) => src.indexOf(`export async function ${n}(`))
      .filter((i) => i > start)
      .sort((a, b) => a - b)[0];
    const body = src.slice(start, next === undefined ? src.length : next);
    const guardAt = body.indexOf("await guard(");
    const dbAt = body.search(/\bdb\.\w+\./);
    check(
      `${name} guards before it touches the database`,
      guardAt !== -1 && (dbAt === -1 || guardAt < dbAt),
      guardAt === -1 ? "no guard call found" : "",
    );
  }
}
check("every action in the platform is guarded", actionCount > 0, `${actionCount} actions`);

console.log(`\n${failures === 0 ? "All permission assertions passed." : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
