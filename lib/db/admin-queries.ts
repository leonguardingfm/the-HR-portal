/**
 * The Admin read layer.
 *
 * Nothing here stores a total. Stock on hand is the sum of its movements;
 * every KPI is a count over the items and the event log. That is the same rule
 * the rest of the platform follows, and it is why two Admin screens cannot
 * disagree about the same number.
 */

import {
  ADMIN_KPIS,
  PRIORITIES,
  escalationState,
  kpiVerdict,
  type AdminCategoryId,
  type AdminKpi,
  type AdminPriority,
  type KpiVerdict,
} from "@/lib/core/admin";
import { db } from "./client";
import type { Role } from "@/lib/types";

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------------------------------------------------------------------------
// Items and approvals
// ---------------------------------------------------------------------------

export interface AdminApprovalRow {
  step: number;
  requiredRoles: Role[];
  reason: string;
  decision: string | null;
  decidedByName: string | null;
  decidedByRole: Role | null;
  decidedAt: string | null;
  grounds: string | null;
}

export interface AdminItemRow {
  id: string;
  reference: string;
  track: "task" | "request";
  category: AdminCategoryId;
  kind: string | null;
  title: string;
  detail: string | null;
  priority: AdminPriority;
  state: string;
  amountPence: number | null;
  aboutPersonName: string | null;
  subject: string | null;
  requestedByName: string;
  requestedByUserId: string;
  assignedToName: string | null;
  raisedAt: string;
  dueAt: string;
  completedAt: string | null;
  approvals: AdminApprovalRow[];
  /** Derived, not stored: where the escalation ladder has got to right now. */
  escalation: ReturnType<typeof escalationState>;
  /** The rung waiting to be signed, if any. */
  awaiting: AdminApprovalRow | null;
}

/** What the item is about, in words, from whichever subject is set. */
function describeSubject(item: {
  supplier: { name: string } | null;
  recurringPayment: { label: string } | null;
  asset: { tag: string; label: string } | null;
  holidayRequest: { person: { fullName: string } } | null;
  penalty: { reference: string } | null;
  voucher: { reference: string } | null;
  accreditation: { name: string } | null;
  authorityMatter: { reference: string; body: string } | null;
  stockItem: { equipmentItem: { label: string }; size: string | null } | null;
}): string | null {
  if (item.supplier) return item.supplier.name;
  if (item.recurringPayment) return item.recurringPayment.label;
  if (item.asset) return `${item.asset.tag} ${item.asset.label}`;
  if (item.holidayRequest) return item.holidayRequest.person.fullName;
  if (item.penalty) return item.penalty.reference;
  if (item.voucher) return item.voucher.reference;
  if (item.accreditation) return item.accreditation.name;
  if (item.authorityMatter) return `${item.authorityMatter.body.toUpperCase()} ${item.authorityMatter.reference}`;
  if (item.stockItem) {
    return `${item.stockItem.equipmentItem.label}${item.stockItem.size ? ` (${item.stockItem.size})` : ""}`;
  }
  return null;
}

const ITEM_INCLUDE = {
  approvals: { orderBy: { step: "asc" as const } },
  supplier: true,
  recurringPayment: true,
  asset: true,
  holidayRequest: { include: { person: true } },
  penalty: true,
  voucher: true,
  accreditation: true,
  authorityMatter: true,
  stockItem: { include: { equipmentItem: true } },
};

export async function getAdminItems(
  opts: { category?: AdminCategoryId; openOnly?: boolean; limit?: number } = {},
  now = new Date(),
): Promise<AdminItemRow[]> {
  const items = await db.adminItem.findMany({
    where: {
      ...(opts.category ? { category: opts.category } : {}),
      ...(opts.openOnly
        ? { state: { notIn: ["completed", "cancelled", "rejected"] } }
        : {}),
    },
    include: ITEM_INCLUDE,
    orderBy: [{ dueAt: "asc" }],
    take: opts.limit ?? 200,
  });

  // Names are looked up in one go rather than per row.
  const userIds = new Set<string>();
  items.forEach((i) => {
    userIds.add(i.requestedByUserId);
    if (i.assignedToUserId) userIds.add(i.assignedToUserId);
    i.approvals.forEach((a) => a.decidedByUserId && userIds.add(a.decidedByUserId));
  });
  const personIds = items.map((i) => i.aboutPersonId).filter((x): x is string => !!x);

  const [users, people] = await Promise.all([
    db.user.findMany({ where: { id: { in: [...userIds] } } }),
    personIds.length
      ? db.person.findMany({ where: { id: { in: personIds } } })
      : Promise.resolve([]),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.displayName]));
  const personName = new Map(people.map((p) => [p.id, p.fullName]));

  return items.map((i) => {
    const approvals: AdminApprovalRow[] = i.approvals.map((a) => ({
      step: a.step,
      requiredRoles: a.requiredRoles as Role[],
      reason: a.reason,
      decision: a.decision,
      decidedByName: a.decidedByUserId ? userName.get(a.decidedByUserId) ?? null : null,
      decidedByRole: (a.decidedByRole as Role | null) ?? null,
      decidedAt: iso(a.decidedAt),
      grounds: a.grounds,
    }));

    return {
      id: i.id,
      reference: i.reference,
      track: i.track as "task" | "request",
      category: i.category as AdminCategoryId,
      kind: i.kind,
      title: i.title,
      detail: i.detail,
      priority: i.priority as AdminPriority,
      state: i.state,
      amountPence: i.amountPence,
      aboutPersonName: i.aboutPersonId ? personName.get(i.aboutPersonId) ?? null : null,
      subject: describeSubject(i),
      requestedByName: userName.get(i.requestedByUserId) ?? "Unknown",
      requestedByUserId: i.requestedByUserId,
      assignedToName: i.assignedToUserId ? userName.get(i.assignedToUserId) ?? null : null,
      raisedAt: i.raisedAt.toISOString(),
      dueAt: i.dueAt.toISOString(),
      completedAt: iso(i.completedAt),
      approvals,
      escalation: escalationState({
        raisedAt: i.raisedAt.toISOString(),
        priority: i.priority as AdminPriority,
        now,
      }),
      awaiting: approvals.find((a) => a.decision === null) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export interface PaymentRow {
  instanceId: string | null;
  label: string;
  supplierName: string;
  agreedPence: number;
  duePence: number;
  dueOn: string;
  paidOn: string | null;
  paidPence: number | null;
  /** Paid minus agreed. Zero is the normal case and the one that needs no one. */
  variancePence: number | null;
  frequency: string;
}

export async function getPaymentSchedule(now = new Date()): Promise<PaymentRow[]> {
  const payments = await db.recurringPayment.findMany({
    where: { active: true },
    include: { supplier: true, instances: { orderBy: { dueOn: "asc" } } },
    orderBy: { label: "asc" },
  });

  const rows: PaymentRow[] = [];
  for (const p of payments) {
    for (const i of p.instances) {
      // Only what is near enough to matter: anything unpaid, plus the last
      // three months of history.
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
      if (i.paidOn && i.dueOn < ninetyDaysAgo) continue;
      rows.push({
        instanceId: i.id,
        label: p.label,
        supplierName: p.supplier.name,
        agreedPence: p.agreedAmountPence,
        duePence: i.amountDuePence,
        dueOn: i.dueOn.toISOString(),
        paidOn: iso(i.paidOn),
        paidPence: i.amountPaidPence,
        variancePence:
          i.amountPaidPence === null ? null : i.amountPaidPence - p.agreedAmountPence,
        frequency: p.frequency,
      });
    }
  }
  return rows.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

export async function getSupplierContracts(now = new Date()) {
  const contracts = await db.supplierContract.findMany({
    include: { supplier: true },
    orderBy: { endsOn: "asc" },
  });
  return contracts.map((c) => ({
    id: c.id,
    supplierName: c.supplier.name,
    reference: c.reference,
    startsOn: c.startsOn.toISOString(),
    endsOn: iso(c.endsOn),
    noticePeriodDays: c.noticePeriodDays,
    agreedAmountPence: c.agreedAmountPence,
    daysToEnd: c.endsOn
      ? Math.round((c.endsOn.getTime() - now.getTime()) / 86_400_000)
      : null,
    /** Notice has to be given before this date, or the contract rolls on. */
    noticeByDays: c.endsOn
      ? Math.round(
          (c.endsOn.getTime() - c.noticePeriodDays * 86_400_000 - now.getTime()) / 86_400_000,
        )
      : null,
  }));
}

// ---------------------------------------------------------------------------
// Premises
// ---------------------------------------------------------------------------

export async function getAssets(now = new Date()) {
  const assets = await db.asset.findMany({
    include: {
      supplier: true,
      jobs: { orderBy: { reportedAt: "desc" }, take: 3 },
    },
    orderBy: [{ nextServiceOn: "asc" }, { label: "asc" }],
  });
  return assets.map((a) => ({
    id: a.id,
    tag: a.tag,
    label: a.label,
    category: a.category,
    location: a.location,
    condition: a.condition,
    supplierName: a.supplier?.name ?? null,
    purchaseCostPence: a.purchaseCostPence,
    warrantyEndsOn: iso(a.warrantyEndsOn),
    nextServiceOn: iso(a.nextServiceOn),
    daysToService: a.nextServiceOn
      ? Math.round((a.nextServiceOn.getTime() - now.getTime()) / 86_400_000)
      : null,
    openFaults: a.jobs.filter((j) => !j.completedAt).length,
    lastJob: a.jobs[0]
      ? {
          kind: a.jobs[0].kind,
          description: a.jobs[0].description,
          at: a.jobs[0].reportedAt.toISOString(),
          done: a.jobs[0].completedAt !== null,
        }
      : null,
  }));
}

// ---------------------------------------------------------------------------
// People admin
// ---------------------------------------------------------------------------

export async function getHolidayRequests(now = new Date()) {
  const requests = await db.holidayRequest.findMany({
    include: { person: true, entitlement: true },
    orderBy: [{ decision: "asc" }, { startsOn: "asc" }],
    take: 100,
  });

  // Hours taken per entitlement, so the balance is derived rather than kept.
  const approvedByEntitlement = new Map<string, number>();
  requests
    .filter((r) => r.decision === "approved" && r.entitlementId)
    .forEach((r) =>
      approvedByEntitlement.set(
        r.entitlementId!,
        (approvedByEntitlement.get(r.entitlementId!) ?? 0) + r.hoursRequested,
      ),
    );

  return requests.map((r) => ({
    id: r.id,
    personName: r.person.fullName,
    personId: r.personId,
    startsOn: r.startsOn.toISOString(),
    endsOn: r.endsOn.toISOString(),
    // Leave runs to the start of the day after the last one.
    lastDay: new Date(r.endsOn.getTime() - 1).toISOString(),
    hoursRequested: r.hoursRequested,
    decision: r.decision,
    raisedAt: r.raisedAt.toISOString(),
    daysWaiting: Math.floor((now.getTime() - r.raisedAt.getTime()) / 86_400_000),
    shiftsAffected: r.shiftsAffected,
    note: r.note,
    entitlementHours: r.entitlement
      ? r.entitlement.entitlementHours + r.entitlement.carriedOverHours
      : null,
    takenHours: r.entitlementId ? approvedByEntitlement.get(r.entitlementId) ?? 0 : null,
  }));
}

export async function getAuthorityMatters(now = new Date()) {
  const matters = await db.authorityMatter.findMany({
    include: { person: true },
    orderBy: [{ state: "asc" }, { dueOn: "asc" }],
    take: 100,
  });
  return matters.map((m) => ({
    id: m.id,
    reference: m.reference,
    body: m.body,
    matterType: m.matterType,
    personName: m.person?.fullName ?? null,
    receivedOn: m.receivedOn.toISOString(),
    dueOn: iso(m.dueOn),
    daysToDue: m.dueOn
      ? Math.round((m.dueOn.getTime() - now.getTime()) / 86_400_000)
      : null,
    state: m.state,
    summary: m.summary,
  }));
}

export async function getSuspensions() {
  const rows = await db.suspension.findMany({
    include: { person: true },
    orderBy: { startsOn: "desc" },
    take: 50,
  });
  return rows.map((s) => ({
    id: s.id,
    personName: s.person.fullName,
    startsOn: s.startsOn.toISOString(),
    endsOn: iso(s.endsOn),
    liftedOn: iso(s.liftedOn),
    reason: s.reason,
    paid: s.paid,
    /** Open-ended and not lifted is the one that gets forgotten. */
    openEnded: s.endsOn === null && s.liftedOn === null,
  }));
}

// ---------------------------------------------------------------------------
// Penalties, vouchers
// ---------------------------------------------------------------------------

export async function getPenalties() {
  const rows = await db.penalty.findMany({
    include: { person: true },
    orderBy: { raisedAt: "desc" },
    take: 100,
  });
  return rows.map((p) => ({
    id: p.id,
    reference: p.reference,
    personName: p.person.fullName,
    kind: p.kind,
    amountPence: p.amountPence,
    grounds: p.grounds,
    state: p.state,
    raisedAt: p.raisedAt.toISOString(),
    writtenOffReason: p.writtenOffReason,
  }));
}

export async function getVouchers(now = new Date()) {
  const rows = await db.voucher.findMany({
    include: { person: true },
    orderBy: { issuedOn: "desc" },
    take: 100,
  });
  return rows.map((v) => ({
    id: v.id,
    reference: v.reference,
    personName: v.person?.fullName ?? null,
    valuePence: v.valuePence,
    purpose: v.purpose,
    issuedOn: v.issuedOn.toISOString(),
    expiresOn: v.expiresOn.toISOString(),
    daysToExpiry: Math.round((v.expiresOn.getTime() - now.getTime()) / 86_400_000),
    state: v.state,
  }));
}

// ---------------------------------------------------------------------------
// Uniform stock
// ---------------------------------------------------------------------------

export interface StockRow {
  id: string;
  label: string;
  size: string | null;
  location: string | null;
  reorderLevel: number;
  /** Derived from the movements. There is no stored total to drift. */
  onHand: number;
  lastMovementAt: string | null;
  belowReorder: boolean;
}

export async function getStock(): Promise<StockRow[]> {
  const items = await db.stockItem.findMany({
    include: {
      equipmentItem: true,
      movements: { orderBy: { at: "desc" } },
    },
  });
  return items
    .map((s) => {
      const onHand = s.movements.reduce((sum, m) => sum + m.quantity, 0);
      return {
        id: s.id,
        label: s.equipmentItem.label,
        size: s.size,
        location: s.location,
        reorderLevel: s.reorderLevel,
        onHand,
        lastMovementAt: s.movements[0] ? s.movements[0].at.toISOString() : null,
        belowReorder: onHand <= s.reorderLevel,
      };
    })
    .sort((a, b) =>
      a.label === b.label ? (a.size ?? "").localeCompare(b.size ?? "") : a.label.localeCompare(b.label),
    );
}

/**
 * Returnable kit still out with someone who has left.
 *
 * Read from the existing equipment records and the leaver date on the person,
 * not from a list Admin keeps. The whole point is that this cannot be out of
 * date.
 */
export async function getOutstandingReturns(now = new Date()) {
  const issues = await db.equipmentIssue.findMany({
    where: { returnedAt: null, writtenOffAt: null, item: { returnable: true } },
    include: {
      item: true,
      // Employment is one-to-one with a person, so the leaver date is read from
      // there rather than being copied onto the issue.
      person: { include: { employment: true } },
    },
  });

  return issues
    .map((i) => {
      const leftOn = i.person.employment?.endedAt ?? null;
      return {
        id: i.id,
        personName: i.person.fullName,
        itemLabel: i.item.label,
        size: i.size,
        quantity: i.quantity,
        issuedAt: i.issuedAt.toISOString(),
        leftOn: iso(leftOn),
        daysSinceLeaving: leftOn
          ? Math.floor((now.getTime() - leftOn.getTime()) / 86_400_000)
          : null,
      };
    })
    .filter((r) => r.leftOn !== null)
    .sort((a, b) => (b.daysSinceLeaving ?? 0) - (a.daysSinceLeaving ?? 0));
}

// ---------------------------------------------------------------------------
// Accreditations
// ---------------------------------------------------------------------------

export async function getAccreditations(now = new Date()) {
  const rows = await db.accreditation.findMany({
    include: {
      requirements: { orderBy: [{ clause: "asc" }, { label: "asc" }] },
      submissions: { orderBy: { submittedOn: "desc" }, take: 3 },
    },
    orderBy: { expiresOn: "asc" },
  });

  return rows.map((a) => {
    const total = a.requirements.length;
    const satisfied = a.requirements.filter((r) => r.satisfiedAt !== null).length;
    // A derived requirement counts as gathered: it is answered by records the
    // platform already holds, which is the point of marking it derived.
    const derived = a.requirements.filter((r) => r.source.startsWith("derived_")).length;
    const gathered = a.requirements.filter(
      (r) => r.satisfiedAt !== null || r.source.startsWith("derived_"),
    ).length;
    const daysToExpiry = Math.round((a.expiresOn.getTime() - now.getTime()) / 86_400_000);
    const lastSubmission = a.submissions[0] ?? null;

    return {
      id: a.id,
      name: a.name,
      body: a.body,
      scope: a.scope,
      certificateNumber: a.certificateNumber,
      state: a.state,
      ownerRole: a.ownerRole as Role | null,
      expiresOn: a.expiresOn.toISOString(),
      nextAuditOn: iso(a.nextAuditOn),
      daysToExpiry,
      total,
      satisfied,
      derived,
      gathered,
      evidenceComplete: total > 0 && gathered === total,
      /** Inside 30 days with nothing submitted is the figure with no tolerance. */
      atRisk:
        daysToExpiry <= 30 &&
        !a.submissions.some((s) => s.submittedOn > new Date(a.expiresOn.getTime() - 180 * 86_400_000)),
      lastSubmittedOn: lastSubmission ? lastSubmission.submittedOn.toISOString() : null,
      requirements: a.requirements.map((r) => ({
        id: r.id,
        clause: r.clause,
        label: r.label,
        source: r.source,
        derivedFrom: r.derivedFrom,
        satisfiedAt: iso(r.satisfiedAt),
      })),
    };
  });
}

// ---------------------------------------------------------------------------
// The department board
// ---------------------------------------------------------------------------

export interface AdminKpiValue {
  kpi: AdminKpi;
  value: number | null;
  verdict: KpiVerdict;
  /** How the number was arrived at, in words, for the people who ask. */
  basis: string;
}

/**
 * The eleven approved KPIs plus the cost run-rate, each computed here and
 * nowhere else.
 *
 * Where there is no data to compute one honestly, the value is null and the
 * screen says so. A figure whose provenance is unclear is worse than no figure.
 */
export async function getAdminKpis(now = new Date()): Promise<AdminKpiValue[]> {
  const periodStart = new Date(now.getTime() - 90 * 86_400_000);
  const leaveYearEnd = new Date(now.getFullYear(), 11, 31);

  const [
    completed,
    open,
    payments,
    holidays,
    outstandingReturns,
    penalties,
    vouchers,
    accreditations,
    contracts,
    assignedCounts,
  ] = await Promise.all([
    db.adminItem.findMany({
      where: { state: "completed", completedAt: { gte: periodStart } },
      select: { completedAt: true, dueAt: true, raisedAt: true, priority: true },
    }),
    db.adminItem.findMany({
      where: { state: { notIn: ["completed", "cancelled", "rejected"] } },
      select: { dueAt: true, assignedToUserId: true },
    }),
    db.paymentInstance.findMany({
      where: { dueOn: { gte: periodStart, lte: now } },
      include: { recurringPayment: true },
    }),
    db.holidayRequest.findMany({ where: { decision: "pending" } }),
    getOutstandingReturns(now),
    db.penalty.findMany({ where: { state: { in: ["raised", "approved"] } } }),
    db.voucher.findMany({ where: { state: "issued" } }),
    getAccreditations(now),
    db.supplierContract.findMany({ where: { endsOn: { not: null } } }),
    db.adminItem.groupBy({
      by: ["assignedToUserId"],
      where: { state: { notIn: ["completed", "cancelled", "rejected"] } },
      _count: { _all: true },
    }),
  ]);

  const value = (id: string): { v: number | null; basis: string } => {
    switch (id) {
      case "on_time_completion": {
        if (completed.length === 0) return { v: null, basis: "Nothing completed in the last 90 days." };
        const onTime = completed.filter((c) => c.completedAt! <= c.dueAt).length;
        return {
          v: Math.round((onTime / completed.length) * 100),
          basis: `${onTime} of ${completed.length} completed inside their priority target, last 90 days.`,
        };
      }
      case "overdue_tasks": {
        const late = open.filter((o) => o.dueAt < now).length;
        return { v: late, basis: `${late} of ${open.length} open items are past target.` };
      }
      case "average_completion": {
        if (completed.length === 0) return { v: null, basis: "Nothing completed in the last 90 days." };
        const ratios = completed.map((c) => {
          const hours = (c.completedAt!.getTime() - c.raisedAt.getTime()) / 3_600_000;
          return hours / PRIORITIES[c.priority as AdminPriority].targetHours;
        });
        const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
        return {
          v: Math.round(mean * 100),
          basis: `Mean time to completion across ${completed.length} items, as a share of each item's own target.`,
        };
      }
      case "renewals_missed": {
        const missedAcc = accreditations.filter(
          (a) => a.daysToExpiry < 0 && a.state !== "lapsed",
        ).length;
        const missedContracts = contracts.filter(
          (c) => c.endsOn! < now,
        ).length;
        return {
          v: missedAcc + missedContracts,
          basis: `${missedAcc} accreditation${missedAcc === 1 ? "" : "s"} and ${missedContracts} contract${missedContracts === 1 ? "" : "s"} past their date.`,
        };
      }
      case "renewals_upcoming_ready": {
        const due = accreditations.filter((a) => a.daysToExpiry >= 0 && a.daysToExpiry <= 90);
        if (due.length === 0) return { v: null, basis: "No accreditation renewal falls inside 90 days." };
        const ready = due.filter((a) => a.evidenceComplete).length;
        return {
          v: Math.round((ready / due.length) * 100),
          basis: `${ready} of ${due.length} renewals due inside 90 days have their evidence gathered.`,
        };
      }
      case "payments_on_time": {
        if (payments.length === 0) return { v: null, basis: "No payments fell due in the last 90 days." };
        const onTime = payments.filter((p) => p.paidOn && p.paidOn <= p.dueOn).length;
        return {
          v: Math.round((onTime / payments.length) * 100),
          basis: `${onTime} of ${payments.length} settled on or before the due date.`,
        };
      }
      case "holiday_pending": {
        const stale = holidays.filter(
          (h) => (now.getTime() - h.raisedAt.getTime()) / 86_400_000 > 5,
        ).length;
        return {
          v: stale,
          basis: `${stale} of ${holidays.length} pending request${holidays.length === 1 ? "" : "s"} raised more than five days ago.`,
        };
      }
      case "uniform_outstanding": {
        return {
          v: outstandingReturns.length,
          basis: `Returnable items still out with people who have left.`,
        };
      }
      case "penalties_outstanding": {
        const total =
          penalties.reduce((s, p) => s + p.amountPence, 0) +
          vouchers.reduce((s, v) => s + v.valuePence, 0);
        return {
          v: total,
          basis: `${penalties.length} penalt${penalties.length === 1 ? "y" : "ies"} and ${vouchers.length} unredeemed voucher${vouchers.length === 1 ? "" : "s"}.`,
        };
      }
      case "accreditation_at_risk": {
        const at = accreditations.filter((a) => a.atRisk).length;
        return {
          v: at,
          basis: `Held accreditations inside 30 days of expiry with no submission recorded.`,
        };
      }
      case "workload_spread": {
        const counts = assignedCounts
          .filter((c) => c.assignedToUserId !== null)
          .map((c) => c._count._all)
          .sort((a, b) => a - b);
        if (counts.length < 2) return { v: null, basis: "Not enough people with work assigned to compare." };
        const median = counts[Math.floor(counts.length / 2)];
        const max = counts[counts.length - 1];
        return {
          v: median === 0 ? null : Math.round((max / median) * 100) / 100,
          basis: `Busiest person holds ${max} open items; the median is ${median}.`,
        };
      }
      case "recurring_cost_run_rate": {
        const thisMonth = payments.filter(
          (p) => p.dueOn.getMonth() === now.getMonth() && p.dueOn.getFullYear() === now.getFullYear(),
        );
        if (thisMonth.length === 0) return { v: null, basis: "Nothing due this month." };
        const agreed = thisMonth.reduce((s, p) => s + p.recurringPayment.agreedAmountPence, 0);
        const actual = thisMonth.reduce(
          (s, p) => s + (p.amountPaidPence ?? p.amountDuePence),
          0,
        );
        return {
          v: agreed === 0 ? null : Math.round((actual / agreed) * 100),
          basis: `This month: ${(actual / 100).toFixed(2)} against agreed ${(agreed / 100).toFixed(2)}.`,
        };
      }
      default:
        return { v: null, basis: "Not computed." };
    }
  };

  void leaveYearEnd;

  return ADMIN_KPIS.map((kpi) => {
    const { v, basis } = value(kpi.id);
    return { kpi, value: v, verdict: kpiVerdict(kpi, v), basis };
  });
}

/** The numbers the Admin dashboard leads with. */
export async function getAdminDashboard(now = new Date()) {
  const soon = new Date(now.getTime() + 14 * 86_400_000);

  const [urgent, overdue, awaitingApproval, paymentsDue, servicesDue, lowStock, expiring] =
    await Promise.all([
      db.adminItem.count({
        where: { state: { notIn: ["completed", "cancelled", "rejected"] }, priority: { in: ["P1", "P2"] } },
      }),
      db.adminItem.count({
        where: { state: { notIn: ["completed", "cancelled", "rejected"] }, dueAt: { lt: now } },
      }),
      db.adminItem.count({
        where: {
          track: "request",
          state: { notIn: ["completed", "cancelled", "rejected", "approved"] },
          approvals: { some: { decision: null } },
        },
      }),
      db.paymentInstance.findMany({
        where: { paidOn: null, dueOn: { lte: soon } },
        include: { recurringPayment: true },
      }),
      db.asset.count({ where: { nextServiceOn: { lte: soon } } }),
      getStock(),
      db.accreditation.count({
        where: { state: "held", expiresOn: { lte: new Date(now.getTime() + 90 * 86_400_000) } },
      }),
    ]);

  return {
    urgent,
    overdue,
    awaitingApproval,
    paymentsDueCount: paymentsDue.length,
    paymentsDuePence: paymentsDue.reduce((s, p) => s + p.amountDuePence, 0),
    servicesDue,
    lowStockCount: lowStock.filter((s) => s.belowReorder).length,
    accreditationsExpiring: expiring,
  };
}
