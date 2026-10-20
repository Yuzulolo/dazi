"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBasics, parseBirthYear, parseStyle, profileSaveError, readFormValues } from "@/lib/profile/validate";
import type { ProfileFormState } from "@/lib/profile/types";
import { myProfileEmbeddingText, refreshMyProfileEmbedding } from "@/lib/ai/profile-embedding";

const SAVE_FAILED = "Couldn't save your answers. Please check them and try again.";

// Step 1: basics. Birth year is only accepted while the profile has none
// (the database trigger refuses any change once it is set).
export async function saveBasics(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser({ allowIncompleteOnboarding: true });
  if (user.onboarded) redirect("/me/edit");

  const values = readFormValues(formData);
  const birthYearRaw = String(formData.get("birthYear") ?? "").trim();
  const basics = parseBasics(values);
  if (!basics.ok) return { error: basics.error, values, birthYear: birthYearRaw };

  const update: Record<string, unknown> = { ...basics.update };
  if (formData.has("birthYear")) {
    const birth = parseBirthYear(birthYearRaw);
    // Under 18: refused, not deleted, until "Delete my data" exists (part G, FLOWS 2.0).
    if (!birth.ok) return { error: birth.error, values, birthYear: birthYearRaw };
    update.birth_year = birth.year;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update(update).eq("id", user.id);
  if (error) {
    console.error("saveBasics failed:", error.code);
    return { error: profileSaveError(error, SAVE_FAILED), values, birthYear: birthYearRaw };
  }

  revalidatePath("/onboarding");
  redirect("/onboarding"); // shows step 2
}

// Step 2: travel style quiz, then onboarding is complete. The database refuses
// onboarding_completed_at unless the required basics are filled in.
export async function saveStyle(
  _prevState: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const user = await getCurrentUser({ allowIncompleteOnboarding: true });
  if (user.onboarded) redirect("/me/edit");

  const values = readFormValues(formData);
  const style = parseStyle(values);
  if (!style.ok) return { error: style.error, values };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ ...style.update, onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    console.error("saveStyle failed:", error.code);
    const message = error.code === "23514" ? "Please complete step 1 first." : SAVE_FAILED;
    return { error: message, values };
  }

  // Onboarding is complete: compute the personality embedding (one "profile" quota slot).
  // Never blocks onboarding: a failed read or AI call just leaves personality at 0 for now.
  const text = await myProfileEmbeddingText();
  if (text) await refreshMyProfileEmbedding(text);

  revalidatePath("/plan");
  revalidatePath("/matches");
  revalidatePath("/me/edit");
  redirect("/plan");
}
