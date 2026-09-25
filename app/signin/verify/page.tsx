import { AuthShell } from "@/components/auth/AuthShell";
import { TwoFactorForm } from "@/components/auth/RecoveryForms";

export const dynamic = "force-dynamic";

/** The second step of sign-in, for accounts with two-factor on. */
export default function VerifyPage() {
  return (
    <AuthShell active="signin" title="Enter your code" intro="Open your authenticator app and type the six-digit code it shows for Leon Guarding.">
      <TwoFactorForm />
    </AuthShell>
  );
}
