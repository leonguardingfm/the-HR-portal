/**
 * Employees — the record HR and Admin keep for everyone employed (HR, 25
 * September 2026): contact details, next of kin, the contract, payroll, the
 * training they have done, their leave and their documents; and, when they
 * go, the leaver record.
 *
 * Screening documents stay on the screening file, which only the vetting team
 * opens [6.1]; the employee record holds everything else.
 */

import { END_STAGES } from "@/lib/core/recruitment";
import { ukDate } from "@/lib/core/rota";
import { db } from "./client";

export async function getEmployees(opts: { leavers?: boolean; q?: string } = {}) {
  const q = (opts.q ?? "").trim();
  const rows = await db.employment.findMany({
    where: {
      state: opts.leavers ? "ended" : { not: "ended" },
      ...(q ? { OR: [{ person: { fullName: { contains: q, mode: "insensitive" } } }, { pin: { contains: q } }, { jobTitle: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { person: { fullName: "asc" } },
    include: {
      person: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          holidayRequests: { where: { decision: "pending" }, select: { id: true } },
          training: { select: { expiresOn: true } },
          documents: { where: { disposedAt: null, expiresAt: { not: null } }, select: { expiresAt: true } },
        },
      },
    },
    take: 500,
  });
  const soon = new Date(Date.now() + 60 * 86_400_000);
  return rows.map((e) => ({
    personId: e.person.id,
    name: e.person.fullName,
    phone: e.person.phone,
    pin: e.pin,
    jobTitle: e.jobTitle,
    contractType: e.contractType,
    state: e.state,
    startedAt: e.startedAt.toISOString(),
    lastWorkingDay: e.lastWorkingDay?.toISOString() ?? null,
    controlTeam: e.controlTeam,
    leavePending: e.person.holidayRequests.length,
    expiringSoon: [...e.person.training.map((t) => t.expiresOn), ...e.person.documents.map((d) => d.expiresAt)].filter((d): d is Date => !!d && d <= soon).length,
  }));
}

export async function getEmployee(personId: string) {
  const p = await db.person.findUnique({
    where: { id: personId },
    include: {
      employment: true,
      user: { select: { id: true, active: true, username: true } },
      training: { orderBy: { completedOn: "desc" }, include: { document: { select: { id: true } } } },
      documents: { where: { disposedAt: null }, include: { type: true }, orderBy: { suppliedAt: "desc" } },
      holidayEntitlements: { orderBy: { leaveYearStart: "desc" }, take: 1 },
      holidayRequests: { orderBy: { startsOn: "desc" }, take: 20 },
      equipment: { where: { returnedAt: null, writtenOffAt: null }, include: { item: true } },
      emails: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });
  if (!p || !p.employment) return null;
  const e = p.employment;
  const recorder = e.leaverRecordedById ? await db.user.findUnique({ where: { id: e.leaverRecordedById }, select: { displayName: true } }) : null;
  const ent = p.holidayEntitlements[0];
  const inYear = ent ? p.holidayRequests.filter((r) => r.startsOn >= ent.leaveYearStart && r.startsOn < ent.leaveYearEnd) : [];
  const taken = inYear.filter((r) => r.decision === "approved").reduce((n, r) => n + r.hoursRequested, 0);
  const pending = inYear.filter((r) => r.decision === "pending").reduce((n, r) => n + r.hoursRequested, 0);
  return {
    person: {
      id: p.id,
      fullName: p.fullName,
      previousName: p.previousName,
      dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      email: p.email,
      phone: p.phone,
      address: p.address,
      postcode: p.postcode,
      nationalInsurance: p.nationalInsurance,
      nextOfKinName: p.nextOfKinName,
      nextOfKinRelation: p.nextOfKinRelation,
      nextOfKinPhone: p.nextOfKinPhone,
      payrollRef: p.payrollRef,
      lifecycle: p.lifecycle,
      portal: p.user ? { active: p.user.active, username: p.user.username } : null,
    },
    employment: {
      pin: e.pin,
      state: e.state,
      startedAt: e.startedAt.toISOString().slice(0, 10),
      confirmedAt: e.confirmedAt?.toISOString() ?? null,
      controlTeam: e.controlTeam,
      weeklyHours: e.weeklyHours,
      contractType: e.contractType,
      jobTitle: e.jobTitle,
      payRatePence: e.payRatePence,
      noticeWeeks: e.noticeWeeks,
      contractSignedAt: e.contractSignedAt?.toISOString().slice(0, 10) ?? null,
      lastWorkingDay: e.lastWorkingDay?.toISOString().slice(0, 10) ?? null,
      leaverReason: e.leaverReason,
      leaverNote: e.leaverNote,
      leaverRecordedBy: recorder?.displayName ?? null,
      endedAt: e.endedAt?.toISOString() ?? null,
    },
    training: p.training.map((t) => ({ id: t.id, course: t.course, provider: t.provider, completedOn: t.completedOn.toISOString().slice(0, 10), expiresOn: t.expiresOn?.toISOString().slice(0, 10) ?? null, documentId: t.document?.id ?? null })),
    documents: p.documents.map((d) => ({ id: d.id, label: d.type.label, typeId: d.typeId, fileName: d.fileName, verification: d.verification, expiresAt: d.expiresAt?.toISOString().slice(0, 10) ?? null, suppliedAt: d.suppliedAt?.toISOString() ?? null, hasCopy: !!d.storageKey })),
    leave: {
      entitlement: ent ? { hours: ent.entitlementHours + ent.carriedOverHours, from: ent.leaveYearStart.toISOString().slice(0, 10), to: ent.leaveYearEnd.toISOString().slice(0, 10) } : null,
      taken,
      pending,
      // Leave runs to the start of the day after its last day.
      requests: p.holidayRequests.map((r) => ({ id: r.id, from: ukDate(r.startsOn), to: ukDate(new Date(r.endsOn.getTime() - 1)), hours: r.hoursRequested, decision: r.decision, note: r.note, shiftsAffected: r.shiftsAffected })),
    },
    equipment: p.equipment.map((x) => ({ id: x.id, item: x.item.label, size: x.size, quantity: x.quantity, issuedAt: x.issuedAt.toISOString() })),
    emails: p.emails.map((m) => ({ id: m.id, subject: m.subject, status: m.status, createdAt: m.createdAt.toISOString() })),
  };
}

export type Employee = NonNullable<Awaited<ReturnType<typeof getEmployee>>>;

/**
 * Where a task about a person opens (HR, 25 September 2026): a leave request
 * at Administration's decision list; a candidate still in recruitment at
 * their candidate record; anyone employed at their employee record; Control's
 * own at the officer profile. Looked up once for a whole task list.
 */
export async function personTaskLinks(items: { personId: string | null; title: string; ownerRole: string | null }[]) {
  const ids = [...new Set(items.map((i) => i.personId).filter((x): x is string => !!x))];
  if (!ids.length) return (_: unknown) => null as string | null;
  const [employed, candidacies] = await Promise.all([
    db.employment.findMany({ where: { personId: { in: ids } }, select: { personId: true } }),
    db.candidacy.findMany({ where: { personId: { in: ids } }, orderBy: { stageSince: "desc" }, select: { id: true, personId: true, stage: true } }),
  ]);
  const isEmployee = new Set(employed.map((e) => e.personId));
  const candidacyOf = new Map<string, { id: string; open: boolean }>();
  for (const c of candidacies) if (!candidacyOf.has(c.personId)) candidacyOf.set(c.personId, { id: c.id, open: !END_STAGES.includes(c.stage) });
  return (i: { personId: string | null; title: string; ownerRole: string | null }): string | null => {
    if (!i.personId) return null;
    if (i.title.startsWith("Leave request:")) return "/admin/people";
    if (i.ownerRole === "control" || i.ownerRole === "operations_manager") return `/officers/${i.personId}`;
    const c = candidacyOf.get(i.personId);
    if (c?.open && (i.ownerRole === "recruitment" || i.ownerRole === "recruitment_manager")) return `/candidates/${c.id}`;
    if (isEmployee.has(i.personId)) return `/people/${i.personId}`;
    return c ? `/candidates/${c.id}` : null;
  };
}
