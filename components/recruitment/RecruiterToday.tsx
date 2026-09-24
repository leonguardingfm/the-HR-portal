import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import type { getRecruiterToday } from "@/lib/db/recruitment";
import { formatShortDate, formatTime } from "@/lib/format";

type Today = Awaited<ReturnType<typeof getRecruiterToday>>;

const STAGE = { first: "1st interview", second: "2nd interview", additional: "Client interview" } as const;

function Column({ title, empty, children, count }: { title: string; empty: string; count: number; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        {title} · {count}
      </h3>
      {count === 0 ? (
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {empty}
        </p>
      ) : (
        <ul className="mt-1 space-y-1 text-[13px]">{children}</ul>
      )}
    </div>
  );
}

/** What the recruiter does now: who is coming in, what has arrived, who has not replied. */
export function RecruiterToday({ t }: { t: Today }) {
  return (
    <Card title="Today" subtitle="Interviews coming up, applications to check, and forms still with the candidate.">
      <div className="grid gap-5 md:grid-cols-3">
        <Column title="Interviews today & tomorrow" count={t.interviews.length} empty="None booked.">
          {t.interviews.map((b) => (
            <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link href={`/candidates/${b.candidacyId}`} className="font-medium underline-offset-2 hover:underline">
                {b.name}
              </Link>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {b.today ? "today" : "tomorrow"} {formatTime(b.startsAt)} · {STAGE[b.stage]}
              </span>
            </li>
          ))}
        </Column>
        <Column title="Applications to check" count={t.received.length} empty="Nothing waiting.">
          {t.received.map((r) => (
            <li key={r.candidacyId} className="flex flex-wrap items-baseline justify-between gap-x-2">
              <Link href={`/candidates/${r.candidacyId}`} className="font-medium underline-offset-2 hover:underline">
                {r.name}
              </Link>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                in {formatShortDate(r.at)}
              </span>
            </li>
          ))}
        </Column>
        <Column title="Forms with the candidate" count={t.waiting.length} empty="No links out.">
          {t.waiting.map((w) => (
            <li key={w.candidacyId} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <Link href={`/candidates/${w.candidacyId}`} className="font-medium underline-offset-2 hover:underline">
                {w.name}
              </Link>
              {w.expired ? (
                <StatusPill severity="serious" label="Link expired" />
              ) : (
                <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  sent {formatShortDate(w.sentAt)} · {w.opened ? "started" : "not opened"}
                </span>
              )}
            </li>
          ))}
        </Column>
      </div>
    </Card>
  );
}
