/**
 * The permission matrix, asserted.
 *
 * Two things are checked, and the second matters more than the first:
 *
 *   1. Each role can take exactly the actions it should, and no others.
 *   2. Every exported server action calls the guard BEFORE it touches the
 *      database. A permission check that can be skipped by a new action is not
 *      a permission model, so this reads lib/actions/operations.ts and fails if
 *      an exported action does not guard.
 *
 * Run: npm run test:permissions
 */

import { readFileSync } from "node:fs";
import { ACTIONS, canDo, type ActionId } from "../lib/auth/permissions";
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
const EXPECTED: Record<string, ActionId[]> = {
  control: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", "work_item.complete", "reminder.send"],
  operations_manager: ["check_call.record", "contact_attempt.log", "book_on.record", "incident.notify_client", "assignment.publish", "work_item.complete", "reminder.send"],
  recruitment: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "work_item.complete", "reminder.send"],
  recruitment_manager: ["candidacy.advance", "candidacy.withdraw", "candidacy.create", "onboarding.step", "pin.allocate", "work_item.complete", "reminder.send"],
  vetting_admin: ["document.verify", "document.renew", "work_item.complete", "reminder.send"],
  vetting_controller: ["document.verify", "document.renew", "disposal.run", "work_item.complete", "reminder.send"],
  top_management: ["disposal.run", "work_item.complete", "reminder.send"],
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

// --- 2. every action guards ------------------------------------------------
const src = readFileSync(new URL("../lib/actions/operations.ts", import.meta.url), "utf8");
const exported = [...src.matchAll(/export async function (\w+)\(/g)].map((m) => m[1]);
check("there are server actions to check", exported.length > 0, `${exported.length} found`);

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

console.log(`\n${failures === 0 ? "All permission assertions passed." : failures + " FAILURES"}`);
process.exit(failures === 0 ? 0 : 1);
