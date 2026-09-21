import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";

/** The eight post-offer tasks, unchanged in substance — now tracked. */
const CHECKLIST = [
  {
    task: "Online checks recorded",
    owner: "Screening administrator",
    automation:
      "SIA status, right to work, Creditsafe, UK sanctions and OFAC are all recorded on the screening file before this point — this becomes a confirmation, not a task",
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
    automation:
      "Portal allocates the next free PIN and guarantees it is unique. Where a site issues its own PRN, the two are recorded against each other",
    done: true,
  },
  {
    task: "INDEL profile created",
    owner: "Recruitment",
    automation:
      "Done by hand today. The platform holds the same information and is confirmed as fully replacing INDEL, so this step is retired once R1 is in live use — it is on the list precisely so nobody forgets to stop doing it",  
    done: true,
  },
  {
    task: "Added to the SIA Watch List",
    owner: "Recruitment",
    automation:
      "The SIA website, checked twice daily for officers who have gone inactive. The portal can hold the licence numbers and run that monitoring itself",
    done: true,
  },
  {
    task: "Added to Google Maps",
    owner: "Recruitment",
    automation:
      "Control uses it to see officer areas for shift deployment. Automatable via the Maps API once we agree what is plotted and who can see it",
    done: true,
  },
  {
    task: "Hired in Casper from the submitted application",
    owner: "Recruitment",
    automation: "Casper holds the application and has an API, so the hire can be pushed rather than retyped",
    done: true,
  },
  {
    task: "Control Team notified",
    owner: "Portal",
    automation:
      "Replaces the manual WhatsApp message to the New Recruit Onboarding Group. Fires automatically to the right Control team on completion",
    done: true,
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
                label={item.done ? "Automatable" : "Needs a decision first"}
              />
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Note the first item. The online checks — SIA status, right to work,
          Creditsafe, UK sanctions and OFAC — are recorded on the screening file
          before deployment, so this step confirms rather than performs them.
          Every task here is now automatable: the three that were open questions
          turned out to be real systems with interfaces, not spreadsheets.
        </p>
      </Card>

      <ModuleOutline
        items={[
          {
            label: "Automatic PIN allocation, with client PRN mapping",
            detail: "Next free PIN, unique by construction and never reused. Where a site keeps its own PRN, the two are recorded against each other so neither side has to match on a name.",
            phase: 1,
          },
          {
            label: "SIA-badge name propagation",
            detail: "One verified spelling flows to the officer record, the Recruitment Sheet view and every export, instead of being retyped into each.",
            phase: 1,
          },
          {
            label: "SIA status monitoring",
            detail: "The Watch List is checked twice daily by hand today. The portal holds every licence number already, so it can run that check and raise an officer who has gone inactive as a task.",
            clause: "7.4c1",
            phase: 2,
          },
          {
            label: "Control Team notification",
            detail: "Fires automatically to the right Control team on completion, replacing the manual WhatsApp message to the New Recruit Onboarding Group.",
            phase: 2,
          },
          {
            label: "Casper integration",
            detail: "Push the hire to Casper from the record already captured, rather than retyping it. Its API is confirmed.",
            phase: 2,
          },
          {
            label: "Google Maps placement",
            detail: "Add the officer's area to the map Control uses for deployment, once we agree what is plotted and who can see it.",
            phase: 3,
          },
        ]}
      />
    </div>
  );
}
