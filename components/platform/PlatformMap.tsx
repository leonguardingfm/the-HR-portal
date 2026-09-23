import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, Tag } from "@/components/ui/StatusPill";
import {
  COLLAPSED_FEATURES,
  DOMAINS,
  ENGINES,
  OWNERSHIP_REGISTER,
  engineById,
} from "@/lib/core/domains";
import { FORM_DEFINITIONS } from "@/lib/core/forms";
import { DOCUMENT_TYPES } from "@/lib/core/documents";
import { NAV_GROUPS } from "@/components/layout/nav";
import Link from "next/link";

/**
 * The platform map.
 *
 * This page exists so the anti-duplication contract can be checked rather than
 * trusted. It is rendered from lib/core/domains.ts, which is the same data the
 * rest of the build reads — so if a module starts owning something it should
 * not, this page is where it shows.
 */
export function PlatformMap() {
  const built = DOMAINS.filter((d) => d.status === "built").length;
  const designed = DOMAINS.filter((d) => d.status === "designed").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Platform map"
        description="Twelve domains, nine shared engines, and one owner for every fact. Rendered from the same definitions the application reads, so it cannot quietly go out of date."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Domains" value={DOMAINS.length} detail={`${built} built, ${designed} designed, ${DOMAINS.length - built - designed} outlined`} />
        <StatTile label="Shared engines" value={ENGINES.length} detail="Built once, used by every domain" />
        <StatTile label="Features collapsed" value={COLLAPSED_FEATURES.length} detail="Things in the brief that are configuration, not code" />
        <StatTile label="Facts with a single owner" value={OWNERSHIP_REGISTER.length} detail="Nothing else may write them" />
      </div>

      <Card
        title="What would have been built twice"
        subtitle="Left: the brief read literally. Right: what it actually is. This is the argument for the architecture, on screen so it can be argued with."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Asked for</th>
                <th className="px-1 pb-2 font-medium">Is really</th>
                <th className="px-1 pb-2 font-medium">Engines</th>
              </tr>
            </thead>
            <tbody>
              {COLLAPSED_FEATURES.map((f) => (
                <tr key={f.asked} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2 font-medium">{f.asked}</td>
                  <td className="px-1 py-2" style={{ color: "var(--text-secondary)" }}>
                    {f.actually}
                  </td>
                  <td className="px-1 py-2">
                    <div className="flex flex-wrap gap-1">
                      {f.engines.map((e) => (
                        <Tag key={e}>{engineById(e).name}</Tag>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {FORM_DEFINITIONS.length} form definitions and {DOCUMENT_TYPES.length}{" "}
          document types cover all of it. Adding a client&rsquo;s bespoke
          inspection sheet is a row of configuration, not a release — which is
          what lets the platform keep fitting Leon when the process changes.
        </p>
      </Card>

      <Card title="The engines" subtitle="Built once, at the start. Each one names what would otherwise have been built repeatedly.">
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {ENGINES.map((e) => (
            <li key={e.id} className="py-3">
              <p className="text-[13px] font-medium">{e.name}</p>
              <p className="mt-0.5 text-[12px] leading-snug">{e.purpose}</p>
              <p className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-muted)" }}>Instead of: </span>
                {e.replaces}
              </p>
              <p className="tnum mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {e.module}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="The domains" subtitle="Each one is a view plus its own rules. None of them owns a database.">
        <div className="space-y-5">
          {NAV_GROUPS.map((group) => {
            const items = DOMAINS.filter((d) => d.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                  {group}
                </p>
                <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                  {items.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">
                          {d.href ? (
                            <Link href={d.href} className="hover:underline">
                              {d.name}
                            </Link>
                          ) : (
                            d.name
                          )}
                        </p>
                        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                          {d.owns.length > 0 ? `Owns: ${d.owns.join(" · ")}` : "Owns nothing — every number is derived"}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.reuses.map((e) => (
                            <Tag key={e}>{engineById(e).name}</Tag>
                          ))}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Tag>{d.release}</Tag>
                        <StatusPill
                          severity={d.status === "built" ? "good" : d.status === "designed" ? "warning" : "neutral"}
                          label={d.status === "built" ? "Built" : d.status === "designed" ? "Designed" : "Outlined"}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title="The single-source-of-truth register"
        subtitle="Every fact has exactly one owner. A second place to record an officer's licence expiry is a second place for it to be wrong."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Fact</th>
                <th className="px-1 pb-2 font-medium">Owned by</th>
                <th className="px-1 pb-2 font-medium">Read by</th>
                <th className="px-1 pb-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {OWNERSHIP_REGISTER.map((r) => (
                <tr key={r.fact} className="border-t align-top" style={{ borderColor: "var(--hairline)" }}>
                  <td className="px-1 py-2 font-medium">{r.fact}</td>
                  <td className="px-1 py-2">{r.owner}</td>
                  <td className="px-1 py-2" style={{ color: "var(--text-secondary)" }}>
                    {r.readBy}
                  </td>
                  <td className="px-1 py-2" style={{ color: "var(--text-muted)" }}>
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="The two rules">
        <ol className="space-y-2 text-[13px] leading-relaxed">
          <li>
            <span className="font-medium">A domain may not write a fact it does not own.</span>{" "}
            It reads it.
          </li>
          <li>
            <span className="font-medium">
              If you are about to build a second form renderer, a second reminder, a second task
              list or a second place to count something — stop.
            </span>{" "}
            It already exists. That is the whole point.
          </li>
        </ol>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          The full reasoning is in docs/platform/02. This page is the same
          content, generated from the definitions the code uses, so the two
          cannot drift apart.
        </p>
      </Card>
    </div>
  );
}
