import { redirect } from "next/navigation";

// Old address of the signed-in hub (before phase 7a): plan → /plan, matches → /matches.
export default function HomePage() {
  redirect("/plan");
}
