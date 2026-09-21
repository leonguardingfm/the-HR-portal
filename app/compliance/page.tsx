import { ComplianceRegister } from "@/components/compliance/ComplianceRegister";
import {
  getDisposalLog,
  getExpiringDocuments,
  getRetentionQueue,
  getWorkforceDeployability,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const [documents, workforce, retention, disposals] = await Promise.all([
    getExpiringDocuments(),
    getWorkforceDeployability(),
    getRetentionQueue(),
    getDisposalLog(),
  ]);
  return (
    <ComplianceRegister
      documents={documents}
      workforce={workforce}
      retention={retention}
      disposals={disposals}
    />
  );
}
