"use client";

import { login, type LoginState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { useActionState } from "react";

const initialState: LoginState = { error: "" };

export function LoginForm({
  from,
  configError,
}: {
  from?: string;
  configError: boolean;
}) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="grid gap-5">
      {from ? <input type="hidden" name="from" value={from} /> : null}

      <Field
        label="Password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {configError ? (
          <span className="text-ink-2">
            Auth is not configured. Set AUTH_SECRET and AUTH_PASSWORD.
          </span>
        ) : state.error ? (
          <span className="text-ink-2">{state.error}</span>
        ) : null}
      </p>
    </form>
  );
}
