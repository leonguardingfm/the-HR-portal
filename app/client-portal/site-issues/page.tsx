import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Empty, Muted, NotInService, NotLinked, Pill, ukDay, ukTime } from "@/components/client-portal/Bits";
import { FixedButton } from "@/components/client-portal/FixedButton";
import { clientScope } from "@/lib/auth/client-scope";
import { CLIENT_STAGE, kindIcon, kindLabel, urgencyLabel } from "@/lib/core/site-issues";
import { clientSiteIssues } from "@/lib/db/site-issues";

export const dynamic = "force-dynamic";

/**
 * Needs attention (26 September 2026): what our officers found at the client's
 * sites that needs putting right — shared once the Control Room has reviewed
 * it. The client says when it is fixed; our next officer on site checks.
 */
export default async function ClientSiteIssuesPage() {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  if (!scope.siteIssues) return <NotInService title="Needs attention" what="Site issue reports — photos and details of damage, leaks and other problems our officers find at your sites —" />;
  const rows = await clientSiteIssues(scope);
  const open = rows.filter((r) => r.status === "open");
  const waiting = rows.filter((r) => r.status === "client_fixed");
  const fixed = rows.filter((r) => r.status === "resolved");
  const Item = ({ r }: { r: (typeof rows)[number] }) => (
    <li className="space-y-2 py-3.5" style={{ borderColor: "var(--hairline)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={CLIENT_STAGE[r.status].tone}>{CLIENT_STAGE[r.status].label}</Pill>
        {r.status === "open" && r.urgency === "urgent" && <Pill tone="bad">Urgent</Pill>}
        {r.reopened && <Pill tone="warn">Still not fixed when our officer checked</Pill>}
      </div>
      <p className="text-[14px] font-semibold">
        {kindIcon(r.kind)} {kindLabel(r.kind)} · {r.site}
        {r.location ? ` — ${r.location}` : ""}
      </p>
      <p className="text-[14px] whitespace-pre-line">{r.text}</p>
      {r.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {r.photos.map((id) => (
            <a key={id} href={`/api/site-issues/photo/${id}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/site-issues/photo/${id}`} alt={`${kindLabel(r.kind)} at ${r.site}`} className="h-28 w-28 rounded-md object-cover" />
            </a>
          ))}
        </div>
      )}
      <Muted>
        {r.ref} · found by {r.foundBy} on {ukDay(r.reportedAt)} at {ukTime(r.reportedAt)} · {urgencyLabel(r.urgency)}
        {r.clientFixedAt ? ` · you said fixed ${ukDay(r.clientFixedAt)}${r.clientFixedBy ? ` (${r.clientFixedBy})` : ""}` : ""}
        {r.resolvedAt ? ` · checked and closed ${ukDay(r.resolvedAt)}` : ""}
      </Muted>
      {r.status === "open" && <FixedButton issueId={r.id} />}
    </li>
  );
  return (
    <div className="space-y-5">
      <PageHeader title="Needs attention" description="Things our officers have found at your sites that need putting right. When one is fixed, tell us here — our next officer on site will check it." />
      <Card title={`To put right · ${open.length}`}>
        {open.length === 0 ? <Empty>Nothing needs attention at your sites.</Empty> : <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>{open.map((r) => <Item key={r.id} r={r} />)}</ul>}
      </Card>
      {waiting.length > 0 && (
        <Card title={`Waiting for our officer to check · ${waiting.length}`}>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {waiting.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </Card>
      )}
      {fixed.length > 0 && (
        <Card title={`Fixed in the last ninety days · ${fixed.length}`}>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {fixed.map((r) => (
              <Item key={r.id} r={r} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
