"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/app/auth/actions";
import { FormError } from "@/app/_components/profile-fields";

const initialState: SignInState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="dazi-form">
      <p className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
        />
      </p>
      <p className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </p>
      <FormError error={state.error} />
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
