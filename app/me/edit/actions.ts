"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseBasics, parseStyle, profileSaveError, readFormValues } from "@/lib/profile/validate";
import type { ProfileFormState } from "@/lib/profile/types";
import { profileEmbeddingText } from "@/lib/ai/profile-text";
import { myProfileEmbeddingText, refreshMyProfileEmbedding } from "@/lib/ai/profile-embedding";

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

  // What the personality embedding is built from before this save (null if unreadable —
  // the save still goes ahead, review W4).
  const beforeText = await myProfileEmbeddingText();

  const supabase = await createClient();
  const update = { ...basics.update, ...style.update };
  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", user.id);
  if (error) {
    console.error("updateProfile failed:", error.code);
    return { error: profileSaveError(error, "Couldn't save your changes. Please check them and try again."), values };
  }

  // Only re-embed when bio, hobbies, cities or interests changed (name/preferences are free).
  const afterText = profileEmbeddingText({
    bio: update.bio,
    hobbies: update.hobbies,
    visitedCities: update.visited_cities,
    travelInterests: update.travel_interests,
  });
  if (beforeText === null || afterText !== beforeText) await refreshMyProfileEmbedding(afterText);

  // Every page that shows profile data is re-rendered from the server (Next 16 client cache),
  // then a fresh /me/edit shows the stored values (trimmed, de-duplicated) and "Saved.".
  // Errors above return state instead, so nothing the user typed is lost.
  revalidatePath("/home");
  revalidatePath(`/u/${user.id}`);
  revalidatePath("/me/edit");
  redirect("/me/edit?saved=1");
}
