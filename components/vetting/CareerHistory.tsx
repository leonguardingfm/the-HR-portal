import { Card } from "@/components/ui/Card";
import { ClauseRef, StatusPill, Tag } from "@/components/ui/StatusPill";
import {
  DOCUMENT_ONLY,
  KIND_CLAUSES,
  KIND_LABELS,
  METHOD_LABELS,
  chaseState,
  dateOf,
  spanDays,
  type HistoryAnalysis,
  type HistoryKind,
  type HistoryMethod,
  type Period,
  type Span,
} from "@/lib/core/history";
import { formatDate } from "@/lib/format";
import {
  AddPeriodForm,
  ChaseButton,
  PermissionForm,
  RemovePeriodButton,
  RequestForm,
  VerifyForm,
} from "./HistoryForms";

export interface HistoryRow extends Period {
  organisation: string | null;
  role: string | null;
  verifierName: string | null;
  method: HistoryMethod | null;
  documentStart: string | null;
  documentEnd: string | null;
  notes: string | null;
  verifiedByName: string | null;
  documents?: { id: string; label: string; hasCopy: boolean; verification: string }[];
}

const fmt = (n: number) => formatDate(dateOf(n));
const spanText = (s: Span) => `${fmt(s.from)} to ${fmt(s.to)} (${spanDays(s)} days)`;

/**
 * The career and history timeline for one file [7.5.2a, 7.7].
 *
 * A bar across the screening window shows what is verified, what is stated but
 * not yet verified, and what nothing accounts for. Below it, the stretches the
 * standard does not allow, and one row per period with the next thing to do.
 */
export function CareerHistory({
  fileId,
  rows,
  analysis,
  editable,
  declarations,
}: {
  fileId: string;
  rows: HistoryRow[];
  analysis: HistoryAnalysis;
  editable: boolean;
  declarations: { from: Date; to: Date }[];
}) {
  const w = analysis.window;
  const total = spanDays(w);
  const pct = (n: number) => `${(Math.min(Math.max(n - w.from, 0), total) / total) * 100}%`;
  const width = (s: Span) => `${(Math.max(Math.min(s.to, w.to) - Math.max(s.from, w.from) + 1, 0) / total) * 100}%`;
  const now = new Date();

  const segments = rows.map((r) => {
    const from = Math.floor(r.statedFrom.getTime() / 86_400_000);
    const to = r.statedTo ? Math.floor(r.statedTo.getTime() / 86_400_000) : w.to;
    return {
      span: { from, to },
      colour: r.verifiedAt ? "var(--status-good)" : r.firstRequestAt ? "var(--status-warning)" : "var(--baseline)",
    };
  });

  return (
    <Card
      title="Career and history"
      subtitle={`The screening window: ${fmt(w.from)} to ${fmt(w.to)}. Every day accounted for, and nothing over 31 days left unverified (7.7).`}
      action={
        <StatusPill
          severity={analysis.fullDone ? "good" : analysis.limitedDone ? "warning" : "critical"}
          label={analysis.fullDone ? "Whole period verified" : analysis.limitedDone ? "3 years verified" : "3 years not yet verified"}
        />
      }
    >
      {/* The timeline bar */}
      <div className="relative mt-1 h-7 overflow-hidden rounded-md" style={{ background: "var(--wash-critical)" }} aria-hidden="true">
        {segments.map((s, i) => (
          <div
            key={i}
            className="absolute top-0 h-full"
            style={{ left: pct(s.span.from), width: width(s.span), background: s.colour, opacity: 0.85 }}
          />
        ))}
        {declarations.map((d, i) => (
          <div
            key={`d${i}`}
            className="absolute top-0 h-full"
            style={{
              left: pct(Math.floor(d.from.getTime() / 86_400_000)),
              width: width({ from: Math.floor(d.from.getTime() / 86_400_000), to: Math.floor(d.to.getTime() / 86_400_000) }),
              background: "var(--series-1)",
              opacity: 0.6,
            }}
          />
        ))}
        <div className="absolute top-0 h-full w-0.5" style={{ left: pct(analysis.limitedWindow.from), background: "var(--text-primary)" }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{fmt(w.from)}</span>
        <span>3 years ←</span>
        <span>{fmt(w.to)}</span>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <Legend colour="var(--status-good)" label="Verified" />
        <Legend colour="var(--status-warning)" label="Requested" />
        <Legend colour="var(--baseline)" label="Stated, not yet requested" />
        {declarations.length > 0 && <Legend colour="var(--series-1)" label="Statutory declaration" />}
        <Legend colour="var(--wash-critical)" label="Not accounted for" />
      </p>

      {/* What is wrong, in sentences */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Figure label="Verified" value={`${Math.round(analysis.verifiedShare * 100)}%`} detail="of the screening window" />
        <Figure
          label="Unverified over 31 days"
          value={`${analysis.unverifiedDays} days`}
          detail={`${analysis.overLimit.length} stretch${analysis.overLimit.length === 1 ? "" : "es"} · must reach zero (7.7)`}
          bad={analysis.unverifiedDays > 0}
        />
        <Figure
          label="Not accounted for"
          value={`${analysis.holes.reduce((n, h) => n + spanDays(h), 0)} days`}
          detail={`${analysis.holes.length} hole${analysis.holes.length === 1 ? "" : "s"} in the stated timeline`}
          bad={analysis.holes.length > 0}
        />
      </div>
      {(analysis.holes.length > 0 || analysis.overLimit.length > 0) && (
        <ul className="mt-3 space-y-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {analysis.holes.map((h) => (
            <li key={`h${h.from}`}>· No period stated from {spanText(h)} — ask the individual what they were doing.</li>
          ))}
          {analysis.overLimit.map((g) => (
            <li key={`g${g.from}`}>· Unverified from {spanText(g)} — over 31 days <ClauseRef clause="7.7" /></li>
          ))}
        </ul>
      )}

      {/* The periods */}
      <ul className="mt-4 space-y-2">
        {rows.length === 0 && (
          <li className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            No periods recorded yet.
          </li>
        )}
        {rows.map((r) => {
          const chase = chaseState(r, now);
          const kind = r.kind as HistoryKind;
          const docOnly = DOCUMENT_ONLY.includes(kind);
          const needsPermission = r.isCurrent && r.kind === "employment" && r.permissionToContact !== true;
          return (
            <li key={r.id} className="rounded-md border p-3" style={{ borderColor: "var(--hairline)" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">
                    {KIND_LABELS[kind]}
                    {r.organisation ? ` — ${r.organisation}` : ""} <ClauseRef clause={KIND_CLAUSES[kind]} />
                    {r.isCurrent && (
                      <span className="ml-1.5">
                        <Tag>Current</Tag>
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {formatDate(r.statedFrom)} to {r.statedTo ? formatDate(r.statedTo) : "now"}
                    {r.role ? ` · ${r.role}` : ""}
                    {(r.confirmedFrom || r.confirmedTo) &&
                      ` · confirmed ${formatDate(r.confirmedFrom ?? r.statedFrom)} to ${r.confirmedTo ? formatDate(r.confirmedTo) : "now"}`}
                  </p>
                  {r.isCurrent && r.kind === "employment" && (
                    <p className="mt-0.5 text-[11px]" style={{ color: r.permissionToContact ? "var(--text-muted)" : "var(--serious-text)" }}>
                      Permission to contact:{" "}
                      {r.permissionToContact === true ? "given" : r.permissionToContact === false ? "withheld — verify from documents (7.3.3a)" : "not asked yet (7.7b)"}
                    </p>
                  )}
                  {r.verifiedAt ? (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      Verified {formatDate(r.verifiedAt)} · {r.method ? METHOD_LABELS[r.method] : ""}
                      {r.method === "documentary" && r.documentStart && ` (${r.documentStart}; ${r.documentEnd})`}
                      {r.verifiedByName ? ` · ${r.verifiedByName}` : ""}
                    </p>
                  ) : (
                    r.firstRequestAt && (
                      <p className="mt-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                        1st request {formatDate(r.firstRequestAt)}
                        {r.secondRequestAt ? ` · 2nd ${formatDate(r.secondRequestAt)}` : ""}
                        {r.verifierName ? ` · to ${r.verifierName}` : ""}
                        {r.contactVerifiedHow ? ` · contact: ${r.contactVerifiedHow}` : ""}
                      </p>
                    )
                  )}
                  {r.notes && (
                    <p className="mt-1 text-[12px] whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>
                      {r.notes}
                    </p>
                  )}
                  {r.documents && r.documents.length > 0 && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Evidence:{" "}
                      {r.documents.map((d, i) => (
                        <span key={d.id}>
                          {i > 0 && ", "}
                          {d.hasCopy ? (
                            <a href={`/documents/${d.id}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--accent-text)" }}>
                              {d.label}
                            </a>
                          ) : (
                            d.label
                          )}
                          {d.verification === "verified" ? " ✓" : d.verification === "rejected" ? " (rejected)" : " (to check)"}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {r.verifiedAt ? (
                    <StatusPill severity="good" label="Verified" />
                  ) : chase ? (
                    <StatusPill severity={chase.severity} label={chase.next} />
                  ) : null}
                  {editable && !r.verifiedAt && !r.firstRequestAt && <RemovePeriodButton periodId={r.id} />}
                </div>
              </div>

              {editable && !r.verifiedAt && (
                <div className="mt-2 space-y-2">
                  {needsPermission && !r.firstRequestAt && <PermissionForm periodId={r.id} />}
                  {!docOnly && !r.firstRequestAt && !needsPermission && <RequestForm periodId={r.id} />}
                  {r.firstRequestAt && !r.secondRequestAt && <ChaseButton periodId={r.id} />}
                  <VerifyForm periodId={r.id} documentOnly={docOnly} contactKnown={Boolean(r.contactVerifiedHow)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editable && (
        <div className="mt-3">
          <AddPeriodForm fileId={fileId} open={rows.length === 0} />
        </div>
      )}
    </Card>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colour }} />
      {label}
    </span>
  );
}

function Figure({ label, value, detail, bad = false }: { label: string; value: string; detail: string; bad?: boolean }) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{ background: bad ? "var(--wash-critical)" : "var(--wash-neutral)" }}>
      <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p className="tnum text-[16px] font-semibold">{value}</p>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {detail}
      </p>
    </div>
  );
}
