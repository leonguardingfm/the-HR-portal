import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { OfficerSignUpForm } from "@/components/auth/OfficerSignUpForm";
import { PASSWORD_MIN } from "@/lib/accounts";

/**
 * A security officer's own account: their duties, their book-on and their
 * check calls, and nothing else. It attaches to the record we already hold,
 * so they prove who they are rather than filling in who they are.
 */
export default function OfficerSignUpPage() {
  return (
    <AuthShell
      active="signup"
      title="Set up your officer account"
      intro="For security officers. You will see your own duties, book on when you arrive and make your check calls — nothing else. Use your PIN and date of birth so we know it is you."
    >
      <OfficerSignUpForm passwordMin={PASSWORD_MIN} />
      <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Already set up?{" "}
        <Link href="/signin" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--accent-text)" }}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
