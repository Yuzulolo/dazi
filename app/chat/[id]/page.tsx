import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { messagingEnabled } from "@/lib/messaging/flag";
import { getChatMessages, getMyInvites } from "@/lib/messaging/queries";
import { formatDateRange } from "@/lib/posts/format";
import { SiteShell } from "@/app/_components/dazi/site-shell";
import { DemoBadge } from "@/app/_components/dazi/primitives";
import { BlockButton, ChatComposer, ChatRefresher } from "./chat-client";

export const metadata: Metadata = { title: "Chat · Dazi" };

// Private chat of one accepted invite (phase 7b-1). Only the two participants get here:
// the invite comes from my_invites() (pinned to auth.uid()) and the messages through RLS
// (private.can_chat). Blocked → closed, no messages shown.
export default function ChatPage({ params }: PageProps<"/chat/[id]">) {
  return (
    <SiteShell variant="calm">
      <Suspense fallback={<p className="wall-caption">Loading…</p>}>
        <Chat params={params} />
      </Suspense>
    </SiteShell>
  );
}

function NotFound() {
  return (
    <section className="glass calm-panel">
      <h1>Chat not found</h1>
      <p className="calm-lead">This chat doesn&apos;t exist, or it isn&apos;t yours.</p>
      <Link className="outline-button" href="/plan">
        ← My plan
      </Link>
    </section>
  );
}

async function Chat({ params }: { params: PageProps<"/chat/[id]">["params"] }) {
  const user = await getCurrentUser();
  if (!messagingEnabled()) return <NotFound />;
  const { id } = await params;
  const invite = (await getMyInvites())?.find((i) => i.id === id);
  if (!invite || (invite.status !== "accepted" && invite.status !== "closed")) return <NotFound />;

  const closed = invite.status === "closed";
  const messages = closed ? [] : await getChatMessages(invite.id, user.id);

  return (
    <section className="glass calm-panel chat-panel" aria-labelledby="chat-title">
      <p className="panel-footer chat-back">
        <Link href="/plan">← My plan</Link>
      </p>
      <h1 id="chat-title">{invite.displayName}</h1>
      <p className="calm-lead">
        {invite.isDemo && <DemoBadge />} {invite.ageRange ?? "—"} · {invite.headline.join(" ")} · {invite.city} /{" "}
        {formatDateRange(invite.overlapStart, invite.overlapEnd)}
      </p>
      <p className="notice shared-demo chat-banner" role="note">
        <strong>Meet in a public place first.</strong> Tell a friend where you&apos;re going.
      </p>
      {invite.isDemo && <p className="invite-demo-note">Demo profile — won&apos;t reply.</p>}
      {user.isDemoLogin && (
        <p className="notice shared-demo" role="note">
          <strong>Shared demo account.</strong> Other visitors can read this chat — don&apos;t share contact details.
        </p>
      )}

      {closed ? (
        <p className="calm-lead">This chat is closed.</p>
      ) : (
        <>
          <ChatRefresher />
          {/* Always-rendered live region, so the first message is announced too (review N6). */}
          <div aria-live="polite">
          {messages === null ? (
            <p className="calm-lead">Messages are unavailable right now. Please try again in a moment.</p>
          ) : messages.length === 0 ? (
            <p className="calm-lead">You&apos;re connected — say hello.</p>
          ) : (
            <ol className="chat-messages" aria-label="Messages">
              {messages.map((m) => (
                <li key={m.id} className="chat-message" data-mine={m.mine ? "" : undefined}>
                  <span className="chat-sender">{m.mine ? "You" : invite.displayName}</span>
                  <p>{m.body}</p>
                  <time dateTime={m.createdAt}>{formatTime(m.createdAt)}</time>
                </li>
              ))}
            </ol>
          )}
          </div>
          <ChatComposer inviteId={invite.id} />
          <div className="panel-footer panel-links">
            <BlockButton inviteId={invite.id} displayName={invite.displayName} />
          </div>
        </>
      )}
    </section>
  );
}

// Berlin time, e.g. "20 Oct, 18:05".
function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
