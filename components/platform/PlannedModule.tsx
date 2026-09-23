import { Card } from "@/components/ui/Card";
import { ModuleOutline, type OutlineItem } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tag } from "@/components/ui/StatusPill";
import { DOMAINS, engineById } from "@/lib/core/domains";

/**
 * A module that is planned rather than built.
 *
 * Shared by every such page rather than repeated on each, which is the same
 * rule the platform applies to itself: one implementation, many uses. It reads
 * the domain's ownership and engine list from lib/core/domains.ts, so a page
 * cannot claim to own something the register does not give it.
 */
export function PlannedModule({
  domainId,
  description,
  items,
  note,
}: {
  domainId: string;
  description: string;
  items: OutlineItem[];
  note?: string;
}) {
  const domain = DOMAINS.find((d) => d.id === domainId);

  return (
    <div className="space-y-5">
      <PageHeader title={domain?.name ?? domainId} description={description} />

      <Card
        title="Not built yet — and what it will sit on"
        subtitle={`Planned for release ${domain?.release ?? "a later release"}. Nothing here needs new plumbing: it is the shared engines with new configuration.`}
      >
        <dl className="space-y-3 text-[13px]">
          <div>
            <dt className="font-medium">What this module will own</dt>
            <dd className="mt-0.5" style={{ color: "var(--text-secondary)" }}>
              {domain && domain.owns.length > 0
                ? domain.owns.join(" · ")
                : "Nothing of its own — every figure is derived from the event log."}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Engines it reuses</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {(domain?.reuses ?? []).map((e) => (
                <Tag key={e}>{engineById(e).name}</Tag>
              ))}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          This page is deliberately an outline rather than a mock-up. A screen
          full of invented detail looks like progress and is not — the
          navigation is honest about what exists so the plan can be reviewed on
          its merits. See the{" "}
          <a href="/platform" className="underline">
            platform map
          </a>{" "}
          for where it fits.
        </p>
      </Card>

      <ModuleOutline
        items={items}
        note={note}
        subtitle="From the plan in docs/platform. The release column is the order in docs/platform/03."
      />
    </div>
  );
}
