"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "@/app/auth/actions";
import { FormError } from "@/app/_components/profile-fields";

const initialState: SignUpState = {};

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  if (state.done) {
    return (
      <p className="form-success" aria-live="polite">
        Check your email to confirm your account. Open the link in this same browser.
      </p>
    );
  }

  return (
    <form action={formAction} className="dazi-form">
      <p className="field">
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          maxLength={50}
          defaultValue={state.fields?.displayName}
        />
      </p>
      <p className="field">
        <label htmlFor="birthYear">Birth year</label>
        <input
          id="birthYear"
          name="birthYear"
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          required
          placeholder="e.g. 1995"
          aria-describedby="birthYear-help"
          defaultValue={state.fields?.birthYear}
        />
        <small id="birthYear-help" className="field-help">
          Dazi is for adults only. We store your birth year, never your full birthday.
        </small>
      </p>
      <p className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.fields?.email}
        />
      </p>
      <p className="field">
        <label htmlFor="password">Password (at least 8 characters)</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </p>
      <FormError error={state.error} />
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </button>
    </form>
  );
}
