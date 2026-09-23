"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";
import type { ActionResult } from "@/lib/actions/types";

/**
 * A server action behind a form, without losing what was typed on a refusal.
 *
 * React clears a form's uncontrolled fields after every action, whatever the
 * result — so a refused SIA licence or decision would come back empty and the
 * person would type it all again. This submits through the same action but
 * keeps the fields, and clears them only once the action succeeds.
 */
export function useFormAction(
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>,
  { resetOnSuccess = true }: { resetOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // The submitter carries its own name and value, like a native submit.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(data));
  }

  return { state, pending, form: { ref, onSubmit } };
}
