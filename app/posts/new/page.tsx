import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { getMyActivePost } from "@/lib/posts/queries";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { PostEditor } from "../post-editor";
import { publishPost } from "../actions";

export const metadata = { title: "Post your plan · Dazi" };

export default function NewPostPage() {
  return (
    <SiteShell variant="calm">
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <NewPost />
      </Suspense>
    </SiteShell>
  );
}

async function NewPost() {
  const user = await getCurrentUser();
  const active = await getMyActivePost(user.id);
  // An ended plan is replaced without asking; a running one needs the confirm dialog.
  return <PostEditor mode="new" action={publishPost} hasActivePost={active !== null && !active.ended} />;
}
