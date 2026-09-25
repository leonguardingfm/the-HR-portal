"use client";

import { useMemo, useState } from "react";
import { input, inputStyle } from "@/components/scheduling/RotaForms";
import { StatusPill } from "@/components/ui/StatusPill";
import { ANSWER_LABELS, CHANNEL_LABELS, dayLabel } from "@/lib/core/rota";
import type { RotaAsk, RotaChange } from "@/lib/db/rota";
import { formatDate, formatTime } from "@/lib/format";

const PAGE = 10;

/**
 * The ring-round and the changes for the weeks on screen, which at three or
 * four hundred officers run to hundreds of lines: searched by officer, post or
 * site, filtered, and shown ten at a time (Control, 25 September 2026).
 */
function useFiltered<T>(rows: T[], text: (r: T) => string) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => (needle ? rows.filter((r) => text(r).toLowerCase().includes(needle)) : rows), [rows, needle, text]);
  return { q, setQ: (v: string) => (setQ(v), setShown(PAGE)), hits, visible: hits.slice(0, shown), more: () => setShown((n) => n + PAGE * 3), shown };
}

function Search({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={`${input} h-8 max-w-xs`} style={inputStyle} />;
}

function More({ left, onMore }: { left: number; onMore: () => void }) {
  if (left <= 0) return null;
  return (
    <button type="button" onClick={onMore} className="mt-2 h-8 rounded-md border px-3 text-[12px]" style={{ borderColor: "var(--hairline)" }}>
      Show {Math.min(left, PAGE * 3)} more of {left}
    </button>
  );
}

export function AsksList({ calls, period }: { calls: RotaAsk[][]; period: string }) {
  const [answer, setAnswer] = useState<"all" | "yes" | "no" | "no_answer">("all");
  const byAnswer = useMemo(() => (answer === "all" ? calls : calls.filter((g) => g[0].answer === answer)), [calls, answer]);
  const f = useFiltered(byAnswer, (g) => `${g[0].personName} ${g[0].postName} ${g[0].siteName} ${g[0].askedBy}`);
  if (calls.length === 0) {
    return (
      <p className="py-4 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
        Nobody has been asked about {period} yet.
      </p>
    );
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Search value={f.q} onChange={f.setQ} placeholder="Find an officer, post or site" />
        {(["all", "yes", "no", "no_answer"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={answer === a} onClick={() => setAnswer(a)} className="h-8 rounded-md border px-2.5 text-[12px]" style={{ borderColor: answer === a ? "var(--text-primary)" : "var(--hairline)", fontWeight: answer === a ? 600 : 400 }}>
            {a === "all" ? `All · ${calls.length}` : `${ANSWER_LABELS[a]} · ${calls.filter((g) => g[0].answer === a).length}`}
          </button>
        ))}
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {f.visible.map((group) => {
          const a = group[0];
          return (
            <li key={a.id} className="py-2.5" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px]">
                  {a.coverNeedId && (
                    <span className="mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" style={{ background: "var(--wash-critical)", color: "var(--critical-text)" }}>
                      Cover
                    </span>
                  )}
                  <span className="font-medium">{a.personName}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {" "}
                    · {a.postName}, {a.siteName}
                  </span>
                </p>
                <StatusPill severity={a.answer === "yes" ? "good" : a.answer === "no" ? "neutral" : "warning"} label={ANSWER_LABELS[a.answer]} />
              </div>
              <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                {group.map((g) => dayLabel(g.date)).join(", ")} · {a.start}–{a.end}
              </p>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {a.channel === "portal" ? "Offered in their portal, accepted by" : "Asked by"} {a.askedBy}, {CHANNEL_LABELS[a.channel]?.toLowerCase() ?? a.channel}, {formatDate(a.askedAt)} {formatTime(a.askedAt)}
                {a.note && ` — “${a.note}”`}
              </p>
            </li>
          );
        })}
        {f.hits.length === 0 && (
          <li className="py-4 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nothing matches.
          </li>
        )}
      </ul>
      <More left={f.hits.length - f.visible.length} onMore={f.more} />
    </div>
  );
}

export function ChangesList({ changes }: { changes: RotaChange[] }) {
  const sorted = useMemo(() => [...changes].sort((a, b) => b.at.localeCompare(a.at)), [changes]);
  const f = useFiltered(sorted, (m) => `${m.change} ${m.postName} ${m.siteName} ${m.reason} ${m.by}`);
  return (
    <div>
      <div className="mb-2">
        <Search value={f.q} onChange={f.setQ} placeholder="Find an officer, post, site or reason" />
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
        {f.visible.map((m) => (
          <li key={m.id} className="py-2.5" style={{ borderColor: "var(--hairline)" }}>
            <p className="text-[13px] font-medium">{m.change}</p>
            <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {m.postName} · {m.siteName} — <span style={{ color: "var(--text-muted)" }}>Reason:</span> {m.reason}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
              {m.by} · {formatDate(m.at)} {formatTime(m.at)}
            </p>
          </li>
        ))}
        {f.hits.length === 0 && (
          <li className="py-4 text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Nothing matches.
          </li>
        )}
      </ul>
      <More left={f.hits.length - f.visible.length} onMore={f.more} />
    </div>
  );
}
