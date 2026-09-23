"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/signin/actions";
import { Field, Notice, SubmitButton } from "./Field";

export function SignInForm({ next, username }: { next: string; username: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signIn, {
    error: null,
    username,
  });

  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <Notice tone="error">{state.error}</Notice>}
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={state.username}
        autoFocus={!state.username}
      />
      <Field
        label="Password"
        name="password"
        password
        autoComplete="current-password"
        required
        autoFocus={Boolean(state.username)}
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
