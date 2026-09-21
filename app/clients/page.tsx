import { PlannedModule } from "@/components/platform/PlannedModule";

export default function ClientsPage() {
  return (
    <PlannedModule
      domainId="clients"
      description="Contracts, the service levels they commit us to, and what the client actually thinks. Satisfaction is captured as typed scores so it trends by itself."
      note="One boundary worth stating now: contract terms that the operation depends on are in scope — the screening period, the inspection frequency, the check-call requirement. Sales, tenders and quoting are not."
      items={[
        { label: "Contract record", detail: "Term, renewal date, rates, and the operational terms: screening period, licence requirements, inspection frequency, check-call instructions.", release: "R4" },
        { label: "Contract terms reaching the work", detail: "A contract's screening period lands on the post, and from there on the screening file — instead of being remembered by whoever raised the requirement.", clause: "7.6", release: "R2" },
        { label: "Satisfaction reviews", detail: "Quarterly, and after any serious incident. Four typed scores plus comments, so the trend per client is a query rather than a compilation.", release: "R4" },
        { label: "Service-level reporting", detail: "Cover delivered against cover contracted, book-on compliance, inspection programme, incident response times — per client, per period.", release: "R4" },
        { label: "Client access", detail: "Whether clients see their own site's reports and compliance directly. A strong commercial feature and a lot of care about permissions — decision E7.", release: "R5" },
      ]}
    />
  );
}
