"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, resetPasswordWithLink, verifyTwoFactor, type ResetState, type SignInState } from "@/app/signin/actions";
import { Field, Notice, SubmitButton } from "./Field";

/** The second step of sign-in: the code from their authenticator app. */
export function TwoFactorForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(verifyTwoFactor, { error: null, username: "" });
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Six-digit code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus />
      <SubmitButton pending={pending}>Continue</SubmitButton>
      <p className="text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
        Lost your phone? Ask the Admin Manager to reset your two-factor.{" "}
        <Link href="/signin" className="underline underline-offset-2">
          Start again
        </Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState<ResetState, FormData>(requestPasswordReset, { error: null, done: null });
  if (state.done) return <Notice tone="success">{state.done}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Username or email address" name="who" autoComplete="username" autoCapitalize="none" spellCheck={false} required autoFocus />
      <SubmitButton pending={pending}>Email me a link</SubmitButton>
      <p className="text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/signin" className="underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<ResetState, FormData>(resetPasswordWithLink.bind(null, token), { error: null, done: null });
  if (state.done)
    return (
      <div className="space-y-4">
        <Notice tone="success">{state.done}</Notice>
        <Link href="/signin" className="block text-center text-[13px] font-medium underline underline-offset-2">
          Sign in
        </Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="New password" name="next" password autoComplete="new-password" required hint="At least 10 characters, not containing your username." />
      <Field label="New password again" name="confirm" password autoComplete="new-password" required />
      <SubmitButton pending={pending}>Set my new password</SubmitButton>
    </form>
  );
}
