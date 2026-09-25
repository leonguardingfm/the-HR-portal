import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Muted, NotLinked, Pill, ukDay, ukTime } from "@/components/client-portal/Bits";
import { clientScope } from "@/lib/auth/client-scope";
import { portalRequest } from "@/lib/db/client-portal";

export const dynamic = "force-dynamic";

/** One request, and where it has got to. Someone else's organisation's is "not found", the same as nothing at all. */
export default async function ClientRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const scope = await clientScope();
  if (!scope) return <NotLinked />;
  const { id } = await params;
  const r = await portalRequest(scope, id);
  if (!r) notFound();
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/client-portal/requests" className="underline underline-offset-2">
          Requests
        </Link>{" "}
        / {r.ref}
      </nav>
      <header className="space-y-1.5">
        <h1 className="text-[22px] font-semibold tracking-tight">{r.subject}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={r.stage.tone}>{r.stage.label}</Pill>
          <Muted>
            {r.ref} · raised by {r.raisedBy}
            {r.site ? ` · ${r.site}` : ""}
          </Muted>
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What you asked">
          <p className="text-[14px] whitespace-pre-line">{r.details}</p>
        </Card>
        <Card title="Where it has got to">
          <ol className="space-y-3">
            {r.timeline.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: i === r.timeline.length - 1 ? "var(--series-1)" : "var(--baseline)" }} />
                <div>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {ukDay(e.at)} {ukTime(e.at)}
                  </p>
                  <p className="text-[14px] whitespace-pre-line">{e.text}</p>
                </div>
              </li>
            ))}
          </ol>
          {r.open && <Muted className="mt-4">We will update this as it moves. For anything urgent, ring the Control Room.</Muted>}
        </Card>
      </div>
    </div>
  );
}
