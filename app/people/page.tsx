import { PlannedModule } from "@/components/platform/PlannedModule";

export default function PeoplePage() {
  return (
    <PlannedModule
      domainId="people"
      description="One record per person, for life. Applicant, officer, leaver and rehire are states of the same record — which is why a returning officer keeps their history instead of being typed in again as a stranger."
      note="The identity engine is already in the code (lib/core/types.ts) and in use: the operational data reads every name from the person record rather than storing its own copy. What is missing is the screen."
      items={[
        { label: "The person record", detail: "Identity, contact details, next of kin, payroll reference. Written once, at first contact, and referenced everywhere after.", release: "R1" },
        { label: "Lifecycle timeline", detail: "Every stage the person has passed through, with dates: enquiry, application, screening, conditional employment, confirmation, leaving, return.", release: "R1" },
        { label: "Duplicate prevention", detail: "Checks on name and date of birth, National Insurance number, SIA licence, phone and email before a record is created, not after.", release: "R1" },
        { label: "Rehire handling", detail: "A returning officer is matched to their existing record, keeping screening history and PIN lineage. What the standard needs re-verifying on return is flagged.", clause: "7.3", release: "R2" },
        { label: "Leaver process", detail: "Exit interview, equipment return, access revocation, and the retention clock starting on the file.", clause: "11.3", release: "R5" },
        { label: "Payroll export", detail: "Approved hours out to payroll software. We own the inputs, not the calculation.", release: "R5" },
      ]}
    />
  );
}
