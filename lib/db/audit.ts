/**
 * Searching the audit log (26 September 2026): for the Managing Director and
 * the auditor. Read-only — the log itself can never be changed — and an export
 * is itself written to the log, so who took a copy of what is on record.
 */

import type { Prisma } from "@prisma/client";
import { AUDIT_GROUPS } from "@/lib/core/audit";
import { ukInstant } from "@/lib/core/rota";
import { db } from "./client";

export interface AuditFilter {
  from: string | null;
  to: string | null;
  who: string | null;
  department: string | null;
  group: string | null;
  person: string | null;
  text: string | null;
}

const isDay = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function auditWhere(f: AuditFilter): Promise<Prisma.EventWhereInput> {
  const and: Prisma.EventWhereInput[] = [];
  if (isDay(f.from)) and.push({ at: { gte: ukInstant(f.from!, "00:00") } });
  if (isDay(f.to)) and.push({ at: { lt: new Date(ukInstant(f.to!, "00:00").getTime() + 86_400_000) } });
  if (f.who === "system") and.push({ actorUserId: null });
  else if (f.who) and.push({ actorUserId: f.who });
  if (f.department) and.push({ department: f.department as Prisma.EventWhereInput["department"] });
  const g = AUDIT_GROUPS.find((x) => x.id === f.group);
  if (g) and.push({ OR: g.prefixes.map((p) => ({ type: { startsWith: p } })) });
  if (f.person && f.person.trim().length >= 2) {
    const people = await db.person.findMany({ where: { fullName: { contains: f.person.trim(), mode: "insensitive" } }, select: { id: true }, take: 50 });
    and.push({ OR: [{ personId: { in: people.map((p) => p.id) } }, { detail: { contains: f.person.trim(), mode: "insensitive" } }] });
  }
  if (f.text && f.text.trim()) and.push({ OR: [{ detail: { contains: f.text.trim(), mode: "insensitive" } }, { type: { contains: f.text.trim(), mode: "insensitive" } }] });
  return and.length ? { AND: and } : {};
}

export const AUDIT_PAGE = 100;

export async function searchAudit(f: AuditFilter, page: number) {
  const where = await auditWhere(f);
  const [total, rows] = await Promise.all([
    db.event.count({ where }),
    db.event.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * AUDIT_PAGE,
      take: AUDIT_PAGE,
      select: { id: true, at: true, type: true, detail: true, department: true, actorRole: true, actorSystem: true, personId: true, hubTaskId: true, assignmentId: true, screeningFileId: true, actor: { select: { displayName: true } } },
    }),
  ]);
  const names = new Map((await db.person.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.personId).filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } })).map((p) => [p.id, p.fullName]));
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      type: r.type,
      detail: r.detail,
      department: r.department,
      who: r.actor?.displayName ?? r.actorSystem ?? "Portal",
      role: r.actorRole,
      person: r.personId ? { id: r.personId, name: names.get(r.personId) ?? null } : null,
      hubTaskId: r.hubTaskId,
      screeningFileId: r.screeningFileId,
    })),
  };
}

export async function auditActors() {
  return db.user.findMany({ where: { events: { some: {} } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } });
}
