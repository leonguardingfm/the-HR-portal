import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

/** The eight post-offer tasks, unchanged in substance — now tracked. */
const CHECKLIST = [
  {
    task: "Online history checks recorded",
    owner: "Vetting administrator",
    automation: "Already captured at the preliminary-checks stage — this becomes a confirmation, not a task",
    done: true,
  },
  {
    task: "Name added to the Recruitment Sheet exactly as per SIA badge",
    owner: "Recruitment",
    automation: "Derived from the verified SIA register result rather than retyped",
    done: true,
  },
  {
    task: "PIN assigned",
    owner: "Recruitment",
    automation: "Portal allocates the next free PIN — no clashes, no manual lookup",
    done: true,
  },
  {
    task: "Indeed profile created",
    owner: "Recruitment",
    automation: "Partly automatable, depending on Indeed API access",
    done: true,
  },
  {
    task: "Added to the Watch List",
    owner: "Recruitment",
    automation: "Depends what the Watch List is — if it is a spreadsheet, the portal should replace it rather than integrate",
    done: false,
  },
  {
    task: "Added to Maps",
    owner: "Recruitment",
    automation: "Same question as the Watch List",
    done: false,
  },
  {
    task: "Hired in Casper from the submitted application",
    owner: "Recruitment",
    automation: "Automatable if Casper exposes an API; otherwise a tracked manual step with a deep link",
    done: false,
  },
  {
    task: "New Recruit Onboarding Group notified",
    owner: "Portal",
    automation: "Automatic once the checklist completes",
    done: false,
  },
];

export default function OnboardingPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Onboarding"
        description="The post-offer admin checklist. Nothing changes about what these tasks are — the portal makes them tracked work with owners and due dates instead of a memory exercise."
      />

      <Card
        title="Onboarding checklist"
        subtitle="Target: complete within 2 working days of all signed documents being received."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {CHECKLIST.map((item, i) => (
            <li key={item.task} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 max-w-2xl">
                <p className="text-[13px] font-medium">
                  <span className="tnum mr-1.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {i + 1}.
                  </span>
                  {item.task}
                </p>
                <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                  {item.owner} · {item.automation}
                </p>
              </div>
              <StatusPill
                severity={item.done ? "good" : "warning"}
                label={item.done ? "Automatable now" : "Needs a decision first"}
              />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Note the first item. In the current process the online checks happen
          here, after the contract is signed. In the proposed order they have
          already happened before the conditional offer — which is what removes
          the single biggest compliance risk in the workflow. See
          docs/proposal/01 §3.1.
        </p>
      </Card>

      <ModuleOutline
        items={[
          {
            label: "Automatic PIN allocation",
            detail: "Next free number from the configured format, assigned by the portal.",
            phase: 1,
          },
          {
            label: "SIA-badge name propagation",
            detail: "One verified spelling flows to the officer record, the Recruitment Sheet view and every export — instead of being retyped into each.",
            phase: 1,
          },
          {
            label: "Casper hire push",
            detail: "Create the hire from the submitted application rather than re-entering it. Blocked on confirming whether Casper has an API or a structured import.",
            phase: 3,
          },
          {
            label: "Onboarding group notification",
            detail: "Fired automatically on completion, to whatever the New Recruit Onboarding Group turns out to be.",
            phase: 2,
          },
        ]}
      />
    </div>
  );
}
