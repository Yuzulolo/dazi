"use client";

import { useActionState } from "react";
import { FormError } from "@/app/_components/profile-fields";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteAccountForm() {
  const [state, formAction, pending] = useActionState(deleteAccount, {} as DeleteState);
  return (
    <form action={formAction} className="dazi-form">
      <p className="field">
        <label htmlFor="confirm">Type DELETE to confirm</label>
        <input id="confirm" name="confirm" autoComplete="off" required aria-describedby="confirm-help" />
        <small id="confirm-help" className="field-help">
          This can&apos;t be undone.
        </small>
      </p>
      <FormError error={state.error} />
      <button type="submit" className="danger-button" disabled={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </button>
    </form>
  );
}
