import { PlannedModule } from "@/components/platform/PlannedModule";

export default function EquipmentPage() {
  return (
    <PlannedModule
      domainId="equipment"
      description="Uniform measurements, issues and returns, and the rest of the kit that has to come back: radios, keys, passes and PPE."
      note="Small, but it is where money leaks and where a leaver keeps a site key. The measurement sheet is a form definition; the issue and the return are work items; the receipt is a document. No new engine."
      items={[
        { label: "Measurements", detail: "Taken once at onboarding, so the right kit is issued once rather than exchanged twice.", release: "R5" },
        { label: "Issue and return register", detail: "Who holds what, since when, and what is outstanding. Signed for on issue.", release: "R5" },
        { label: "Leaver returns", detail: "A return task per item held, raised automatically on notice. Outstanding items surface on the leaver's record, not in someone's memory.", release: "R5" },
        { label: "Site keys and passes", detail: "Tracked per site as well as per person, because a missing key is a site problem before it is an HR one.", release: "R5" },
        { label: "Stock and reorder", detail: "What is in stores, and what to reorder. The lowest-value part of the module, and the one most likely to be cut.", release: "R5" },
      ]}
    />
  );
}
