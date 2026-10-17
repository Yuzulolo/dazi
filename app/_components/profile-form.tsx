"use client";

import { useActionState } from "react";
import type { ProfileFormState, ProfileFormValues } from "@/lib/profile/types";
import { BasicsFields, BirthYearField, FormError, StyleFields } from "./profile-fields";

type Props = {
  action: (state: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  initial: ProfileFormValues;
  sections: { basics?: { birthYear: number | null }; style?: true };
  submitLabel: string;
};

// One form for onboarding step 1, step 2 and /me/edit. On error the server
// action echoes the submitted values, so nothing the user typed is lost.
export function ProfileForm({ action, initial, sections, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initial;

  return (
    <form action={formAction} className="dazi-form">
      {sections.basics && (
        <>
          <BirthYearField birthYear={sections.basics.birthYear} defaultValue={state.birthYear} />
          <BasicsFields values={values} />
        </>
      )}
      {sections.style && <StyleFields values={values} />}
      <FormError error={state.error} />
      {state.saved && (
        <p className="form-success" aria-live="polite">
          Saved.
        </p>
      )}
      <button type="submit" className="primary-button" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
