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
import {
  DEFAULT_THRESHOLDS,
  approvalChain,
  canApproveStep,
  canTransition,
  kpiVerdict,
  ADMIN_KPIS,
} from "../lib/core/admin";
import { MAX_DELEGATION_DAYS, effectiveRoles, actingNote, validateDelegation } from "../lib/auth/delegation";
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
const STAFF_BASELINE: ActionId[] = ["work_item.complete", "reminder.send", "admin_item.raise"];

const EXPECTED: Record<string, ActionId[]> = {
  control: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", ...STAFF_BASELINE],
  operations_manager: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", ...STAFF_BASELINE],
  recruitment: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "stock.move", ...STAFF_BASELINE],
  recruitment_manager: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "admin_item.approve", "admin_item.reject", "holiday.decide", "authority_matter.respond", ...STAFF_BASELINE],
  admin_officer: ["admin_item.start", "admin_item.review", "admin_item.complete", "payment.record", "asset.maintain", "stock.move", "accreditation.evidence", ...STAFF_BASELINE],
  admin_manager: ["admin_item.assign", "admin_item.start", "admin_item.review", "admin_item.approve", "admin_item.reject", "admin_item.complete", "admin_item.cancel", "payment.record", "asset.maintain", "holiday.decide", "stock.move", "accreditation.evidence", "authority_matter.respond", ...STAFF_BASELINE],
  // The Finance Officer approves money and records payments. Nothing else:
  // not holidays, not suspensions, not authority matters, not stock.
  finance_officer: ["admin_item.approve", "admin_item.reject", "payment.record", ...STAFF_BASELINE],
  vetting_admin: ["document.verify", "document.renew", ...STAFF_BASELINE],
  vetting_controller: ["document.verify", "document.renew", "disposal.run", "accreditation.evidence", ...STAFF_BASELINE],
  top_management: ["disposal.run", "admin_item.assign", "admin_item.start", "admin_item.review", "admin_item.approve", "admin_item.reject", "admin_item.complete", "admin_item.cancel", "holiday.decide", "accreditation.evidence", "authority_matter.respond", "threshold.change", "role.delegate", "role.revoke_delegation", ...STAFF_BASELINE],
  auditor: [],
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
  userId: "u-imran",
  personId: "p-imran",
  roles: ["finance_officer", "top_management"],
};

check("the requester cannot approve their own request",
  !canApproveStep({ requirement, approver: financeAlsoTopManagement, requestedByUserId: "u-imran" }).permitted);

check("the subject of a request cannot decide it",
  !canApproveStep({
    requirement,
    approver: financeAlsoTopManagement,
    requestedByUserId: "u-someone-else",
    aboutPersonId: "p-imran",
  }).permitted);

check("one person cannot satisfy two rungs of the same chain",
  !canApproveStep({
    requirement: high[1],
    approver: financeAlsoTopManagement,
    requestedByUserId: "u-someone-else",
    alreadyApprovedByUserIds: ["u-imran"],
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
      alreadyApprovedByUserIds: ["u-imran"],
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

const imran = person("u-imran", ["finance_officer", "top_management"]);
const shahzad = person("u-shahzad", ["top_management"]);
const day = 86_400_000;
const delegate = (over: Partial<Parameters<typeof validateDelegation>[0]> = {}) =>
  validateDelegation({
    role: "finance_officer",
    from: imran,
    to: shahzad,
    grantedBy: imran,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 14 * day),
    existingActive: [],
    ...over,
  });

check("a role can be lent for two weeks", delegate().permitted, delegate().reason ?? "");
const tanveer = person("u-tanveer", ["operations_manager"]);
const notTheirs = delegate({ from: tanveer, grantedBy: tanveer });
check("a role cannot be lent by somebody who does not hold it",
  !notTheirs.permitted && /does not hold it/.test(notTheirs.reason ?? ""),
  notTheirs.reason ?? "");
check("a role cannot be lent to somebody who already holds it",
  !delegate({ to: person("u-x", ["finance_officer"]) }).permitted);
const ownCover = delegate({ grantedBy: shahzad });
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
    existingActive: [{ role: "finance_officer", toUserId: "u-shahzad", endsAt: new Date(Date.now() + day) }],
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
  !delegate({ to: { ...shahzad, active: false } }).permitted);

const lent = [{ role: "finance_officer" as Role, fromUserId: "u-imran", fromName: "Imran", endsAt: "2026-10-31T00:00:00.000Z" }];
check("a lent role joins the roles a person may act as",
  effectiveRoles(["top_management"], lent).sort().join() === "finance_officer,top_management");
check("a lent role that duplicates a held one does not appear twice",
  effectiveRoles(["finance_officer"], lent).length === 1);
check("the audit trail says a role was borrowed, and whose it was",
  (actingNote("finance_officer", lent) ?? "").includes("Imran"),
  actingNote("finance_officer", lent) ?? "none");
check("a role held in its own right carries no borrowing note",
  actingNote("top_management", lent) === null);

// The point of the whole exercise: lending the role does NOT let one person
// sign both rungs of a large payment. The rung rule is on the approver.
check("a deputy holding finance by delegation still cannot sign both rungs",
  canApproveStep({
    requirement: high[0],
    approver: { userId: "u-shahzad", personId: "p-shahzad", roles: ["top_management", "finance_officer"] },
    requestedByUserId: "u-a",
  }).permitted &&
    !canApproveStep({
      requirement: high[1],
      approver: { userId: "u-shahzad", personId: "p-shahzad", roles: ["top_management", "finance_officer"] },
      requestedByUserId: "u-a",
      alreadyApprovedByUserIds: ["u-shahzad"],
    }).permitted);

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

// --- 2. every action guards ------------------------------------------------
let actionCount = 0;
for (const file of ["operations", "admin", "delegation"]) {
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
