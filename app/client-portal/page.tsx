import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Muted, NotLinked, Pill, Stat, ukDay, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { portalIncidents, portalLive, portalRequests, portalRota } from "@/lib/db/client-portal";
import { getControlPhone } from "@/lib/db/me";
import { clientSiteIssues } from "@/lib/db/site-issues";

export const dynamic = "force-dynamic";

/**
 * The client portal's front page (26 September 2026): their sites right now,
 * their requests, the latest incidents, and the Control Room's number. Only
 * their own organisation's — see lib/db/client-portal.ts.
 */
export default async function ClientOverviewPage() {
  const scope = await clientScope();
  if (!scope) {
    return (
      <div className="space-y-5">
        <PageHeader title="Client portal" description="Leon Guarding's view of the cover at your sites." />
        <NotLinked />
      </div>
    );
  }
  const now = new Date();
  // Live view and site issue reports are paid extras: without them, the next shift from the rota instead.
  const [live, rota, requests, incidents, phone, issues] = await Promise.all([
    scope.live ? portalLive(scope, now) : Promise.resolve([]),
    scope.live ? Promise.resolve([]) : portalRota(scope, 14, now),
    portalRequests(scope),
    portalIncidents(scope, new Date(now.getTime() - 30 * 86_400_000)),
    getControlPhone(),
    clientSiteIssues(scope, now),
  ]);
  const toFix = issues.filter((i) => i.status === "open");
  const onDuty = live.filter((s) => s.state.startsWith("On duty"));
  const attention = live.filter((s) => s.tone === "bad" || s.tone === "warn");
  const open = requests.filter((r) => r.open);
  const week = rota.filter((r) => new Date(r.startsAt).getTime() < now.getTime() + 7 * 86_400_000);
  const hour = Number(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }));

  return (
    <div className="space-y-5">
      <PageHeader title={`${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${scope.name.split(" ")[0]}`} description={`${scope.clientName} · ${scope.sites.length} site${scope.sites.length === 1 ? "" : "s"}${scope.allSites ? "" : " shared with you"}`} />

      <section aria-label="Right now" className={`grid grid-cols-2 gap-3 ${scope.siteIssues ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {scope.live ? (
          <>
            <Stat label="On duty now" value={onDuty.length} detail={`${live.length - onDuty.length} more due in the next three hours`} href="/client-portal/live" />
            <Stat label="Needs attention" value={attention.length} detail={attention.length ? "Control is dealing with it" : "Everything on time"} tone={attention.length ? "warn" : "good"} href="/client-portal/live" />
          </>
        ) : (
          <>
            <Stat label="Shifts in the next 7 days" value={week.length} href="/client-portal/rota" />
            <Stat label="Still being covered" value={week.filter((r) => !r.covered).length} detail="Control is finding officers" tone={week.some((r) => !r.covered) ? "warn" : "good"} href="/client-portal/rota" />
          </>
        )}
        {scope.siteIssues && <Stat label="Needs attention at your sites" value={toFix.length} detail={toFix.length ? `${toFix.filter((i) => i.urgency === "urgent").length ? `${toFix.filter((i) => i.urgency === "urgent").length} urgent · ` : ""}found by our officers` : "Nothing to put right"} tone={toFix.some((i) => i.urgency === "urgent") ? "bad" : toFix.length ? "warn" : "good"} href="/client-portal/site-issues" />}
        <Stat label="Open requests" value={open.length} detail={open.length ? `Latest: ${open[0].ref}` : "Nothing outstanding"} href="/client-portal/requests" />
        <Stat label="Incidents, last 30 days" value={incidents.length} detail={incidents.filter((i) => i.severity === "serious").length ? `${incidents.filter((i) => i.severity === "serious").length} serious` : "None serious"} href="/client-portal/incidents" tone={incidents.some((i) => i.severity === "serious") ? "bad" : undefined} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card title={scope.live ? "Your sites right now" : "Your sites"} action={<Link href={scope.live ? "/client-portal/live" : "/client-portal/rota"} className="text-[12px] font-semibold" style={{ color: "var(--accent-text)" }}>{scope.live ? "On duty now →" : "Coming up →"}</Link>}>
          <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
            {scope.sites.map((site) => {
              const next = rota.find((r) => r.siteId === site.id);
              if (!scope.live)
                return (
                  <li key={site.id} className="flex flex-wrap items-center justify-between gap-2 py-3" style={{ borderColor: "var(--hairline)" }}>
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium">{site.name}</p>
                      <Muted>{site.address ?? ""}</Muted>
                    </div>
                    {next ? <Pill tone={next.covered ? "info" : "warn"}>Next: {ukDay(next.startsAt)} {ukTime(next.startsAt)} · {next.post}{next.covered ? "" : " — being covered"}</Pill> : <Pill tone="info">Nothing booked in the next two weeks</Pill>}
                  </li>
                );
              const here = live.filter((s) => s.siteId === site.id);
              const worst = here.find((s) => s.tone === "bad") ?? here.find((s) => s.tone === "warn");
              const on = here.filter((s) => s.state.startsWith("On duty")).length;
              return (
                <li key={site.id} className="flex flex-wrap items-center justify-between gap-2 py-3" style={{ borderColor: "var(--hairline)" }}>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium">{site.name}</p>
                    <Muted>{site.address ?? ""}</Muted>
                  </div>
                  {worst ? <Pill tone={worst.tone}>{worst.post}: {worst.state}</Pill> : here.length ? <Pill tone="good">{on} on duty{here.length > on ? ` · ${here.length - on} due soon` : ""}</Pill> : <Pill tone="info">No shift now or in the next three hours</Pill>}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card title="Need us now?">
            <p className="text-[13px]">The Control Room is staffed around the clock.</p>
            {phone && (
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="mt-3 inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white" style={{ background: "var(--button-good)" }}>
                📞 {phone}
              </a>
            )}
            <p className="mt-3 text-[13px]">
              Or{" "}
              <Link href="/client-portal/requests" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-text)" }}>
                send a request
              </Link>{" "}
              and follow it here.
            </p>
          </Card>

          <Card title="Your latest requests">
            {requests.length === 0 ? (
              <Muted>None yet.</Muted>
            ) : (
              <ul className="space-y-2.5">
                {requests.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2">
                    <Link href={`/client-portal/requests/${r.id}`} className="min-w-0 text-[13px] hover:underline">
                      <span className="font-medium">{r.ref}</span> {r.subject}
                      <span className="block text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {ukDay(r.receivedAt)} {ukTime(r.receivedAt)}
                      </span>
                    </Link>
                    <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
