import { PlannedModule } from "@/components/platform/PlannedModule";

export default function QualityPage() {
  return (
    <PlannedModule
      domainId="quality"
      description="Site inspections and operational reports, and the corrective actions they raise. Both are form definitions on the shared engine, so a client-specific inspection sheet is configuration rather than a release."
      note="The inspection form is already defined in lib/core/forms.ts, including which fields feed which KPI. A failed field raises a corrective-action task automatically — that is the Work engine, not new code."
      items={[
        { label: "Inspection programme", detail: "Which sites are due, at the frequency each client contract specifies, with the ones overdue at the top.", release: "R4" },
        { label: "Inspection form", detail: "Appearance, site knowledge, occurrence book, equipment, overall score, photographs. Typed fields, so the pass rate trends without anyone compiling it.", release: "R4" },
        { label: "Corrective actions", detail: "A task per failed field, owned by the operations manager, with an SLA and an escalation. Closed with evidence.", release: "R4" },
        { label: "Operational reports", detail: "The same engine with a different definition — daily occurrence summaries and client-facing reports.", release: "R4" },
        { label: "ACS evidence pack", detail: "Inspections completed against programme, actions closed, trends by site. The pack an SIA ACS assessor asks for, generated rather than assembled.", release: "R4" },
      ]}
    />
  );
}
