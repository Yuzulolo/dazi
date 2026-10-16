"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "@/app/auth/actions";

const initialState: SignUpState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.done) {
    return (
      <p aria-live="polite">
        Check your email to confirm your account. Open the link in this same browser.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <p>
        <label htmlFor="displayName">Display name</label>
        <br />
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          maxLength={50}
          defaultValue={state.fields?.displayName}
        />
      </p>
      <p>
        <label htmlFor="birthYear">Birth year</label>
        <br />
        <input
          id="birthYear"
          name="birthYear"
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          required
          placeholder="e.g. 1995"
          defaultValue={state.fields?.birthYear}
        />
        <br />
        <small>Dazi is for adults only. We store your birth year, never your full birthday.</small>
      </p>
      <p>
        <label htmlFor="email">Email</label>
        <br />
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.fields?.email}
        />
      </p>
      <p>
        <label htmlFor="password">Password (at least 8 characters)</label>
        <br />
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </p>
      {state.error && (
        <p role="alert" aria-live="polite">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </button>
    </form>
  );
}
