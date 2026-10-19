"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DeleteState = { error?: string };

// GDPR "Delete my data". public.delete_my_account() deletes only the caller from
// auth.users; every user table cascades (profile, plans, cached match reasons, AI usage).
// No service role key: the database function is pinned to auth.uid().
export async function deleteAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  await getCurrentUser();
  if (String(formData.get("confirm") ?? "").trim() !== "DELETE") {
    return { error: "Please type DELETE (in capitals) to confirm." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error("delete_my_account failed:", error.code);
    if (error.message.includes("cannot be deleted")) return { error: "This demo account can't be deleted." };
    return { error: "We couldn't delete your account right now. Please try again." };
  }
  // The user no longer exists; signing out just clears the session cookies.
  await supabase.auth.signOut().catch(() => undefined);
  redirect("/?deleted=1");
}
