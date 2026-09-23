import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { DEPARTMENTS, PASSWORD_MIN } from "@/lib/accounts";

/**
 * Create an account: name, username, email, password and department. The
 * department decides the role, so it is the only access question asked.
 */
export default function SignUpPage() {
  return (
    <AuthShell
      active="signup"
      title="Create your account"
      intro="Choose the department you work in. It decides which screens you see, and it is recorded against your account."
    >
      <SignUpForm
        departments={DEPARTMENTS.map(({ id, label, description, needsApproval }) => ({
          id,
          label,
          description,
          needsApproval,
        }))}
        passwordMin={PASSWORD_MIN}
      />
      <p className="mt-4 text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Already have an account?{" "}
        <Link
          href="/signin"
          className="font-medium underline-offset-2 hover:underline"
          style={{ color: "var(--series-1)" }}
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
