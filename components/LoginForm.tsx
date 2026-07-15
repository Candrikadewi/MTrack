"use client";
import { useActionState } from "react";
import { login } from "@/app/login/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | void, formData: FormData) => login(formData),
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Email">
        <Input type="email" name="email" required autoComplete="email" />
      </Field>
      <Field label="Password">
        <Input type="password" name="password" required autoComplete="current-password" />
      </Field>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
