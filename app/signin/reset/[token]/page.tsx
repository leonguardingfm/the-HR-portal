import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "@/components/auth/RecoveryForms";

export const dynamic = "force-dynamic";

/** The emailed link: choose a new password. The link is checked when it is used. */
export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <AuthShell active="signin" title="Choose a new password" intro="Pick one you have not used here before.">
      <ResetForm token={token} />
    </AuthShell>
  );
}
