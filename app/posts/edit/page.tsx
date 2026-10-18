import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMyActivePost } from "@/lib/posts/queries";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { PostEditor } from "../post-editor";
import { updatePost } from "../actions";

export const metadata = { title: "Edit your plan · Dazi" };

export default function EditPostPage() {
  return (
    <SiteShell variant="calm">
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <EditPost />
      </Suspense>
    </SiteShell>
  );
}

async function EditPost() {
  const user = await getCurrentUser();
  const post = await getMyActivePost(user.id);
  if (!post || post.ended) redirect("/posts/new"); // an ended trip gets a new post, not an edit
  // key = last save time: Next 16 keeps visited pages alive (Activity) and the editor
  // reads `initial` only once, so fresh data must remount it — otherwise it shows old values.
  // aiAssisted false here: the AI badge belongs to an unsaved AI draft only.
  return <PostEditor key={post.updatedAt} mode="edit" action={updatePost} initial={{ ...post, aiAssisted: false }} />;
}
