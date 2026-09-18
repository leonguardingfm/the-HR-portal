import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import { StatusPill } from "@/components/ui/StatusPill";
import { clockState, weeksAllowed } from "@/lib/bs7858";
import { formatDate, formatDays } from "@/lib/format";
import { candidateById, filesOnClock } from "@/lib/mock/data";

/**
 * The screening clock board.
 *
 * Every conditionally employed officer whose screening is incomplete, sorted by
 * days remaining. This is the screen that converts an otherwise invisible
 * obligation into a queue: BS 7858 requires full screening within 12 weeks of
 * conditional employment starting (16 for a 10-year period), and requires the
 * commencement and cease dates to be shown prominently [7.2, 7.6].
 */
export function VettingClockBoard() {
  const rows = filesOnClock()
    .map((file) => {
      const clock = clockState(file);
      const candidate = candidateById(file.candidateId);
      return { file, clock, candidate };
    })
    .filter((r) => r.clock !== null)
    .sort((a, b) => a.clock!.daysRemaining - b.clock!.daysRemaining);

  return (
    <Card
      title="Screening clock — conditional employment"
      subtitle="Sorted by days remaining. The clock measures one thing: five-year career-history verification, due within 12 weeks of deployment (clause 7.6)."
      action={
        <Link href="/vetting" className="text-[12px] underline" style={{ color: "var(--text-secondary)" }}>
          All files
        </Link>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-left">
          <thead>
            <tr className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              <th className="pb-2 pr-3 font-medium">Officer</th>
              <th className="pb-2 pr-3 font-medium">Allowed</th>
              <th className="pb-2 pr-3 font-medium">Conditional start</th>
              <th className="pb-2 pr-3 font-medium">Must complete by</th>
              <th className="pb-2 pr-3 font-medium">Time used</th>
              <th className="pb-2 pr-3 font-medium">Remaining</th>
              <th className="pb-2 pr-3 font-medium">Outstanding</th>
              <th className="pb-2 font-medium">Owner</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ file, clock, candidate }) => (
              <tr
                key={file.id}
                className="border-t align-top"
                style={{ borderColor: "var(--hairline)" }}
              >
                <td className="py-2.5 pr-3">
                  <Link href="/vetting" className="text-[13px] font-medium hover:underline">
                    {candidate?.fullName ?? file.candidateId}
                  </Link>
                  {file.extensionWeeks > 0 && (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      +{file.extensionWeeks}wk extension, approved by {file.extensionApprovedBy}
                    </p>
                  )}
                </td>
                <td className="tnum py-2.5 pr-3 text-[12px] tabular-nums" style={{ color: "var(--text-secondary)" }}>
                  {weeksAllowed(file.screeningPeriodYears)} wk
                  {file.extensionWeeks > 0 && ` + ${file.extensionWeeks}`}
                </td>
                <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {formatDate(file.conditionalEmploymentStart)}
                </td>
                <td className="py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {formatDate(clock!.deadline)}
                </td>
                <td className="w-40 py-2.5 pr-3">
                  <Meter
                    fraction={clock!.fractionUsed}
                    severity={clock!.severity}
                    label={`${candidate?.fullName}: ${Math.round(clock!.fractionUsed * 100)}% of the allowed period used`}
                  />
                </td>
                <td className="py-2.5 pr-3">
                  <StatusPill
                    severity={clock!.severity}
                    label={
                      clock!.expired
                        ? `Expired ${formatDays(clock!.daysRemaining)}`
                        : formatDays(clock!.daysRemaining)
                    }
                  />
                </td>
                <td className="max-w-[16rem] py-2.5 pr-3 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {file.outstandingSummary}
                  {file.gapsOver31Days > 0 && (
                    <span className="tnum block text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {file.unverifiedDays} unverified days · clause 7.7
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {file.administrator}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Everything else — identity, address, sanctions, public record,
        criminality and right to work — was complete before deployment. Where
        the history has not been verified by the date shown, the officer should
        not continue in relevant employment (clause 7.6). A single extension of
        up to four weeks needs Farhan&rsquo;s approval and evidence that written
        requests were made.
      </p>
    </Card>
  );
}
