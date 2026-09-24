"use client";

import { useActionState } from "react";
import { officerSignUp, type OfficerSignUpState } from "@/app/signup/officer/actions";
import { Field, Notice, SubmitButton } from "./Field";

const EMPTY: OfficerSignUpState = { error: null, values: { pin: "", dateOfBirth: "", username: "" } };

export function OfficerSignUpForm({ passwordMin }: { passwordMin: number }) {
  const [state, action, pending] = useActionState(officerSignUp, EMPTY);
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Your PIN" name="pin" inputMode="numeric" autoComplete="off" required defaultValue={state.values.pin} hint="The number on your ID card." />
        <Field label="Date of birth" name="dateOfBirth" type="date" required defaultValue={state.values.dateOfBirth} />
      </div>
      <Field label="Choose a username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required defaultValue={state.values.username} hint="You sign in with this." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Choose a password" name="password" password autoComplete="new-password" required hint={`At least ${passwordMin} characters.`} />
        <Field label="Password again" name="confirm" password autoComplete="new-password" required />
      </div>
      <SubmitButton pending={pending}>Set up my account</SubmitButton>
    </form>
  );
}
