import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "@/components/auth/RecoveryForms";

export const dynamic = "force-dynamic";

/** Forgotten password: a link to the email address on the account. */
export default function ForgotPage() {
  return (
    <AuthShell active="signin" title="Forgotten your password?" intro="We will email a link to the address on your account. It works for an hour.">
      <ForgotForm />
    </AuthShell>
  );
}
