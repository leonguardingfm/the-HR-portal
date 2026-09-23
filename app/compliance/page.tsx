import { ComplianceRegister } from "@/components/compliance/ComplianceRegister";
import { requireSession } from "@/lib/auth/server";
import { deniedReason } from "@/lib/auth/ui";
import {
  getDisposalLog,
  getExpiringDocuments,
  getRetentionQueue,
  getWorkforceDeployability,
} from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const session = await requireSession();
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
      renewDenied={deniedReason(session.activeRole, "document.renew")}
      disposeDenied={deniedReason(session.activeRole, "disposal.run")}
    />
  );
}
