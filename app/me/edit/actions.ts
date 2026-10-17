"use server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBasics, parseStyle, readFormValues, toFormValues } from "@/lib/profile/validate";
import type { ProfileFormState } from "@/lib/profile/types";

// Edit everything except the (locked) birth year. Only onboarded users get here:
// getCurrentUser() redirects everyone else to /onboarding.
export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser();

  const values = readFormValues(formData);
  const basics = parseBasics(values);
  if (!basics.ok) return { error: basics.error, values };
  const style = parseStyle(values);
  if (!style.ok) return { error: style.error, values };

  const supabase = await createClient();
  const update = { ...basics.update, ...style.update };
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);
  if (error) {
    console.error("updateProfile failed:", error.code);
    return { error: "Couldn't save your changes. Please check them and try again.", values };
  }

  // Show what was stored (trimmed, de-duplicated), not the raw input.
  return { saved: true, values: toFormValues(update) };
}
