import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pager, pageFrom } from "@/components/ui/Pager";
import { requireSession } from "@/lib/auth/server";
import { AUDIT_GROUPS, auditGroupOf, typeWords } from "@/lib/core/audit";
import { DEPARTMENT_LABELS_EVENT } from "@/lib/core/audit-labels";
import { AUDIT_PAGE, auditActors, searchAudit, type AuditFilter } from "@/lib/db/audit";

export const dynamic = "force-dynamic";

type SP = { from?: string; to?: string; who?: string; department?: string; group?: string; person?: string; text?: string; page?: string };

/**
 * The audit log (26 September 2026): everything anyone has done in the
 * portal, searchable by date, person, department and kind — for the Managing
 * Director and the auditor. The log cannot be changed by anyone; exporting it
 * is itself recorded.
 */
export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireSession();
  const sp = await searchParams;
  const f: AuditFilter = { from: sp.from ?? null, to: sp.to ?? null, who: sp.who ?? null, department: sp.department ?? null, group: sp.group ?? null, person: sp.person ?? null, text: sp.text ?? null };
  const page = pageFrom(sp.page);
  const [{ total, rows }, actors] = await Promise.all([searchAudit(f, page), auditActors()]);
  const params = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v && k !== "page") p.set(k, v);
    if (extra.page) p.set("page", extra.page);
    return p.toString();
  };
  const field = "h-9 rounded-md border px-2.5 text-[13px]";
  const style = { background: "var(--surface-1)", borderColor: "var(--hairline)" };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Everything done in the portal — who, what, when — read straight from the log, which nobody can edit or delete. Downloading a copy is itself recorded."
        action={
          <a href={`/system/audit/export?${params({})}`} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
            ⬇ Download these as CSV
          </a>
        }
      />
      <Card title="Search">
        <form action="/system/audit" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[12px] font-medium">
            From
            <input type="date" name="from" defaultValue={sp.from ?? ""} className={`${field} mt-1 w-full`} style={style} />
          </label>
          <label className="block text-[12px] font-medium">
            To
            <input type="date" name="to" defaultValue={sp.to ?? ""} className={`${field} mt-1 w-full`} style={style} />
          </label>
          <label className="block text-[12px] font-medium">
            Done by
            <select name="who" defaultValue={sp.who ?? ""} className={`${field} mt-1 w-full`} style={style}>
              <option value="">Anyone</option>
              <option value="system">The portal itself (automatic)</option>
              {actors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-medium">
            Department
            <select name="department" defaultValue={sp.department ?? ""} className={`${field} mt-1 w-full`} style={style}>
              <option value="">All</option>
              {Object.entries(DEPARTMENT_LABELS_EVENT).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-medium">
            Kind of action
            <select name="group" defaultValue={sp.group ?? ""} className={`${field} mt-1 w-full`} style={style}>
              <option value="">All</option>
              {AUDIT_GROUPS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[12px] font-medium">
            About a person
            <input name="person" defaultValue={sp.person ?? ""} placeholder="Name" className={`${field} mt-1 w-full`} style={style} />
          </label>
          <label className="block text-[12px] font-medium sm:col-span-2">
            Words in the entry
            <input name="text" defaultValue={sp.text ?? ""} placeholder="e.g. EM-1048, password, Depot 7" className={`${field} mt-1 w-full`} style={style} />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="h-9 rounded-md px-4 text-[13px] font-semibold text-white" style={{ background: "var(--series-1)" }}>
              Search
            </button>
            <Link href="/system/audit" className="text-[12px] underline underline-offset-2" style={{ color: "var(--text-secondary)" }}>
              Clear
            </Link>
          </div>
        </form>
      </Card>

      <Card title={`${total.toLocaleString("en-GB")} entr${total === 1 ? "y" : "ies"}`} subtitle="Newest first. Times are UK time.">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            Nothing matches.
          </p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-[12px]">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  {["When", "Who", "What", "Detail"].map((h) => (
                    <th key={h} className="border-b px-5 py-2 font-medium" style={{ borderColor: "var(--hairline)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="tnum border-b px-5 py-2 whitespace-nowrap" style={{ borderColor: "var(--hairline)" }}>
                      {new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      <span className="font-medium">{r.who}</span>
                      {r.role && <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>{r.role.replace(/_/g, " ")}</span>}
                    </td>
                    <td className="border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      <span className="font-medium">{typeWords(r.type)}</span>
                      <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {auditGroupOf(r.type)}
                      </span>
                    </td>
                    <td className="max-w-[40rem] border-b px-5 py-2" style={{ borderColor: "var(--hairline)" }}>
                      {r.detail}
                      <span className="mt-0.5 flex flex-wrap gap-2 text-[11px]">
                        {r.person?.name && (
                          <Link href={`/system/audit?${params({ person: r.person.name })}`} className="underline underline-offset-2" style={{ color: "var(--accent-text)" }}>
                            All about {r.person.name}
                          </Link>
                        )}
                        {r.hubTaskId && (
                          <Link href={`/hub/${r.hubTaskId}`} className="underline underline-offset-2" style={{ color: "var(--accent-text)" }}>
                            Open the task
                          </Link>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={AUDIT_PAGE} total={total} href={(p) => `/system/audit?${params({ page: String(p) })}`} />
      </Card>
    </div>
  );
}
