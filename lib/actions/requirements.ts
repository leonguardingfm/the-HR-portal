"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { getSession } from "@/lib/auth/server";
import { canDo, ACTIONS, type ActionId } from "@/lib/auth/permissions";
import { evaluateDeployability } from "@/lib/core/deployability";
import {
  CLOSED_STATUSES,
  fillProblem,
  headcount,
  nextReference,
  releaseProblem,
  statusAfterAllocation,
} from "@/lib/core/requirements";
import { getDeployabilityInputs } from "@/lib/db/queries";
import type { RequirementStatus, Role } from "@/lib/types";
import { refused, ok, type ActionResult } from "./types";

/**
 * Client requirements — Track A: raising one, the pool check, allocation from
 * the pool or from HR, the timestamped release to sourcing, and closing it.
 *
 * Same shape as every other write: guard, re-read, then write with the event
 * in the same transaction. The rules are lib/core/requirements.ts, and
 * prisma/constraints.sql §16 refuses what slips past them.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { session: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) {
    const spec = ACTIONS[action];
    return {
      session,
      error: refused(
        `${spec.what} belongs to ${spec.owner}. You are working as ${session.activeRole.replace(/_/g, " ")}, so the platform refuses it.`,
      ),
    };
  }
  return { session, error: null };
}

type Tx = Prisma.TransactionClient;

function event(tx: Tx, session: { userId: string; activeRole: Role }, r: { id: string }, type: string, detail: string, personId?: string) {
  return tx.event.create({
    data: {
      type,
      actorUserId: session.userId,
      actorRole: session.activeRole,
      department: "control",
      requirementId: r.id,
      personId: personId ?? null,
      detail,
    },
  });
}

const refresh = (id?: string) => {
  revalidatePath("/requirements");
  if (id) revalidatePath(`/requirements/${id}`);
  revalidatePath("/tasks");
};

const loadRequirement = (id: string) =>
  db.requirement.findUnique({
    where: { id },
    include: { client: true, site: true, allocations: { where: { releasedAt: null } } },
  });

/** Close the tasks this requirement raised for one role, once they are done. */
function closeTasks(tx: Tx, requirementId: string, role: Role, state: "done" | "cancelled" = "done") {
  return tx.workItem.updateMany({
    where: { requirementId, ownerRole: role, state: { in: ["open", "blocked"] } },
    data: { state, doneAt: new Date() },
  });
}

/** Settle status and closing after allocations change. */
async function settle(tx: Tx, requirementId: string) {
  const r = await tx.requirement.findUniqueOrThrow({
    where: { id: requirementId },
    include: { allocations: { where: { releasedAt: null }, select: { source: true } } },
  });
  const hc = headcount(r.headcountRequired, r.allocations);
  const status = statusAfterAllocation({ current: r.status as RequirementStatus, hc, released: Boolean(r.releasedToSourcingAt) });
  const closed = CLOSED_STATUSES.includes(status);
  if (status !== r.status || Boolean(r.closedAt) !== closed) {
    await tx.requirement.update({ where: { id: r.id }, data: { status, closedAt: closed ? (r.closedAt ?? new Date()) : null } });
  }
  if (status === "covered_internally") await closeTasks(tx, r.id, "control");
  return { status, hc };
}

/** Somebody who can be put on site today, by the same check the rota uses. */
async function deployableProblem(personId: string): Promise<string | null> {
  const known = (await getDeployabilityInputs()).get(personId);
  if (!known) return "They are not in the officer pool.";
  const d = evaluateDeployability(known.input);
  return d.deployable ? null : `They cannot be deployed: ${d.blockers[0]?.label ?? "blocked"}.`;
}

// ---------------------------------------------------------------------------
// A1 Raise
// ---------------------------------------------------------------------------

export interface RaiseState {
  error: string | null;
  createdId: string | null;
  reference: string | null;
}

export async function raiseRequirement(_prev: RaiseState, formData: FormData): Promise<RaiseState> {
  const { session, error } = await guard("requirement.raise");
  if (error || !session) return { error: error!.message, createdId: null, reference: null };

  const clientId = String(formData.get("clientId") ?? "");
  const siteId = String(formData.get("siteId") ?? "");
  const post = String(formData.get("post") ?? "").trim();
  const count = Number(formData.get("headcount"));
  const shiftPattern = String(formData.get("shiftPattern") ?? "").trim() || null;
  const startRaw = String(formData.get("startDate") ?? "");
  const controlTeam = String(formData.get("controlTeam") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const fail = (e: string) => ({ error: e, createdId: null, reference: null });

  const site = await db.site.findFirst({ where: { id: siteId, clientId }, include: { client: true } });
  if (!site) return fail("Choose the client and one of its sites.");
  if (post.length < 2) return fail("Say which post — the gatehouse, the concourse, the reception desk.");
  if (!Number.isInteger(count) || count < 1 || count > 50) return fail("Headcount is a whole number, at least one.");
  const startDate = new Date(`${startRaw}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime())) return fail("Give the date the client needs cover from.");
  if (startDate.getTime() < Date.now() - 86_400_000) return fail("The start date is in the past. Give the date cover is actually needed from.");
  if (controlTeam !== "alpha" && controlTeam !== "bravo") return fail("Choose which Control team owns it.");

  for (let attempt = 0; attempt < 3; attempt++) {
    const refs = (await db.requirement.findMany({ select: { reference: true } })).map((r) => r.reference);
    const reference = nextReference(refs);
    try {
      const created = await db.$transaction(async (tx) => {
        const r = await tx.requirement.create({
          data: {
            reference,
            clientId,
            siteId,
            post,
            headcountRequired: count,
            shiftPattern,
            startDate,
            controlTeam,
            ownerUserId: session.userId,
            status: "received",
          },
        });
        // A2 is due within one working day (docs/proposal/03 §3).
        await tx.workItem.create({
          data: {
            title: `Pool check: ${reference} — ${site.client.name}, ${site.name} (${count} × ${post})`,
            requirementId: r.id,
            ownerRole: "control",
            dueAt: new Date(Date.now() + 86_400_000),
            slaDays: 1,
          },
        });
        await event(
          tx,
          session,
          r,
          "requirement.received",
          `${reference} received: ${count} × ${post} at ${site.name}, from ${startRaw}. Screening period ${site.client.screeningPeriodYears} years.${note ? ` ${note}` : ""}`,
        );
        return r;
      });
      refresh(created.id);
      return { error: null, createdId: created.id, reference };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  return fail("Could not issue a reference just now. Try again.");
}

// ---------------------------------------------------------------------------
// A2 Pool check, A3a covered internally
// ---------------------------------------------------------------------------

export async function recordPoolCheck(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  if (CLOSED_STATUSES.includes(r.status as RequirementStatus)) return refused("This requirement is closed.");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length < 5) return refused("Say what the pool check found — who you tried, who was free.");

  await db.$transaction(async (tx) => {
    await tx.requirement.update({
      where: { id: r.id },
      data: { poolCheckedAt: new Date(), poolCheckNote: note, status: r.status === "received" ? "pool_check" : r.status },
    });
    await event(tx, session, r, "requirement.pool_checked", `Pool check: ${note}`);
  });
  refresh(r.id);
  return ok("Pool check recorded.");
}

export async function allocateFromPool(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  const personId = String(formData.get("personId") ?? "");
  const status = r.status as RequirementStatus;
  if (status === "filled" || status === "cancelled") return refused("This requirement is closed.");
  const hc = headcount(r.headcountRequired, r.allocations);
  if (hc.remaining === 0) return refused("Every place is already allocated.");
  if (r.allocations.some((a) => a.personId === personId)) return refused("They are already allocated to this requirement.");
  const blocked = await deployableProblem(personId);
  if (blocked) return refused(blocked);

  const person = await db.person.findUnique({ where: { id: personId }, select: { fullName: true } });
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.requirementAllocation.create({
        data: { requirementId: r.id, personId, source: "pool", allocatedById: session.userId },
      });
      if (!r.poolCheckedAt) await tx.requirement.update({ where: { id: r.id }, data: { poolCheckedAt: new Date() } });
      await event(tx, session, r, "requirement.allocated", `${person?.fullName ?? "An officer"} allocated from the pool.`, personId);
      return settle(tx, r.id);
    });
    refresh(r.id);
    return ok(
      result.status === "covered_internally"
        ? "Allocated. Every place is covered from the pool, so the requirement is closed — no recruitment needed."
        : `Allocated. ${result.hc.allocated} of ${result.hc.required}.`,
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return refused("They were allocated a moment ago.");
    throw err;
  }
}

// ---------------------------------------------------------------------------
// A3b Release to sourcing — the timestamped Control → HR handover
// ---------------------------------------------------------------------------

export async function releaseToSourcing(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  const note = String(formData.get("note") ?? "").trim();
  const hc = headcount(r.headcountRequired, r.allocations);
  const problem = releaseProblem({ status: r.status as RequirementStatus, hc, note });
  if (problem) return refused(problem);

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.requirement.update({
      where: { id: r.id },
      data: {
        status: "released_to_sourcing",
        releasedToSourcingAt: now,
        releaseNote: note,
        poolCheckedAt: r.poolCheckedAt ?? now,
        poolCheckNote: r.poolCheckNote ?? note,
      },
    });
    await closeTasks(tx, r.id, "control");
    await tx.workItem.create({
      data: {
        title: `Source ${hc.remaining} officer${hc.remaining === 1 ? "" : "s"}: ${r.reference} — ${r.client.name}, ${r.site.name}, ${r.post}, from ${r.startDate.toISOString().slice(0, 10)}`,
        requirementId: r.id,
        ownerRole: "recruitment",
        dueAt: new Date(now.getTime() + 86_400_000),
        slaDays: 1,
      },
    });
    await event(tx, session, r, "requirement.released", `Released to sourcing for ${hc.remaining} of ${hc.required}: ${note}`);
  });
  refresh(r.id);
  return ok(`Released to HR for ${hc.remaining} place${hc.remaining === 1 ? "" : "s"}. Recruitment has a sourcing task.`);
}

// ---------------------------------------------------------------------------
// A4 Allocate a recruited officer
// ---------------------------------------------------------------------------

export async function allocateRecruited(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  const c = await db.candidacy.findUnique({
    where: { id: String(formData.get("candidacyId") ?? "") },
    include: { person: true },
  });
  if (!c || c.requirementId !== r.id) return refused("That candidate is not being recruited for this requirement.");
  if (c.stage !== "onboarding_complete" && c.stage !== "deployed") {
    return refused("A candidate is allocated once onboarding is complete — until then they are still HR's.");
  }
  const status = r.status as RequirementStatus;
  if (status === "filled" || status === "cancelled") return refused("This requirement is closed.");
  if (headcount(r.headcountRequired, r.allocations).remaining === 0) return refused("Every place is already allocated.");
  if (r.allocations.some((a) => a.personId === c.personId)) return refused("They are already allocated to this requirement.");
  const blocked = await deployableProblem(c.personId);
  if (blocked) return refused(blocked);

  try {
    const result = await db.$transaction(async (tx) => {
      await tx.requirementAllocation.create({
        data: { requirementId: r.id, personId: c.personId, source: "recruited", candidacyId: c.id, allocatedById: session.userId },
      });
      await event(tx, session, r, "requirement.allocated", `${c.person.fullName} allocated, recruited for this requirement.`, c.personId);
      const s = await settle(tx, r.id);
      if (s.hc.remaining === 0) await closeTasks(tx, r.id, "recruitment");
      return s;
    });
    refresh(r.id);
    return ok(`Allocated. ${result.hc.allocated} of ${result.hc.required}.`);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return refused("They were allocated a moment ago.");
    throw err;
  }
}

export async function removeAllocation(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const a = await db.requirementAllocation.findUnique({
    where: { id: String(formData.get("allocationId") ?? "") },
    include: { person: true, requirement: true },
  });
  if (!a || a.releasedAt) return refused("That allocation no longer stands.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return refused("Say why they are coming off.");
  if (a.requirement.status === "filled" || a.requirement.status === "cancelled") return refused("This requirement is closed.");

  await db.$transaction(async (tx) => {
    await tx.requirementAllocation.update({ where: { id: a.id }, data: { releasedAt: new Date(), releasedReason: reason } });
    await event(tx, session, a.requirement, "requirement.allocation_removed", `${a.person.fullName} taken off: ${reason}`, a.personId);
    await settle(tx, a.requirementId);
  });
  refresh(a.requirementId);
  return ok("Taken off. The place is open again.");
}

// ---------------------------------------------------------------------------
// A5 Filled, or cancelled
// ---------------------------------------------------------------------------

export async function markFilled(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  const problem = fillProblem({ status: r.status as RequirementStatus, hc: headcount(r.headcountRequired, r.allocations) });
  if (problem) return refused(problem);

  await db.$transaction(async (tx) => {
    await tx.requirement.update({ where: { id: r.id }, data: { status: "filled", closedAt: new Date() } });
    await closeTasks(tx, r.id, "control");
    await closeTasks(tx, r.id, "recruitment");
    await event(tx, session, r, "requirement.filled", `${r.reference} filled: every officer on site.`);
  });
  refresh(r.id);
  return ok("Filled and closed.");
}

export async function cancelRequirement(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { session, error } = await guard("requirement.manage");
  if (error || !session) return error!;

  const r = await loadRequirement(String(formData.get("requirementId") ?? ""));
  if (!r) return refused("That requirement no longer exists.");
  if (r.status === "filled" || r.status === "cancelled") return refused("This requirement is already closed.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 5) return refused("Say why — the client withdrew it, it was raised in error.");

  await db.$transaction(async (tx) => {
    await tx.requirement.update({ where: { id: r.id }, data: { status: "cancelled", cancelledReason: reason, closedAt: new Date() } });
    await closeTasks(tx, r.id, "control", "cancelled");
    await closeTasks(tx, r.id, "recruitment", "cancelled");
    await event(tx, session, r, "requirement.cancelled", `${r.reference} cancelled: ${reason}`);
  });
  refresh(r.id);
  return ok("Cancelled. Any sourcing task for it has been cancelled too.");
}
