import Link from "next/link";
import { getMyInvites, type Invite } from "@/lib/messaging/queries";
import { formatDateRange } from "@/lib/posts/format";
import { cancelInvite, respondInvite } from "@/app/messaging/actions";
import { InviteActionButton } from "@/app/_components/dazi/invite-controls";
import { DemoBadge } from "@/app/_components/dazi/primitives";

const STATUS_LABEL: Record<Invite["status"], string> = {
  pending: "Waiting",
  accepted: "Connected",
  declined: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  closed: "Chat closed",
};

// "Invites" on /plan (phase 7b-1, only rendered when messaging is enabled): received and sent,
// newest first. Expired = one of the two plans ended or was replaced (computed in SQL).
export async function InvitesSection() {
  const invites = await getMyInvites();
  if (invites === null) {
    return <p className="calm-lead">Invites are unavailable right now. Please try again in a moment.</p>;
  }
  const received = invites.filter((i) => i.direction === "received");
  const sent = invites.filter((i) => i.direction === "sent");
  return (
    <section className="invites" aria-labelledby="invites-title">
      <h2 id="invites-title">Invites</h2>
      <InviteList title="Received" invites={received} empty="No invites yet — they appear here when someone invites you." />
      <InviteList title="Sent" invites={sent} empty="You haven't invited anyone yet. Invite people from Matches." />
    </section>
  );
}

function InviteList({ title, invites, empty }: { title: string; invites: Invite[]; empty: string }) {
  return (
    <div className="invite-list">
      <h3>{title}</h3>
      {invites.length === 0 ? (
        <p className="calm-lead">{empty}</p>
      ) : (
        <ul>
          {invites.map((i) => (
            <li key={i.id} className="glass invite-item">
              <div className="invite-who">
                <p className="invite-name">
                  {i.displayName} · {i.ageRange ?? "—"} {i.isDemo && <DemoBadge />}
                </p>
                <p className="invite-plan">
                  {i.headline.join(" ")} · {i.city} / {formatDateRange(i.overlapStart, i.overlapEnd)}
                </p>
                {i.note && (
                  <p className="invite-note">
                    <span className="eyebrow">{i.direction === "received" ? "Their note" : "Your note"}</span>“{i.note}”
                  </p>
                )}
                {i.isDemo && i.direction === "sent" && i.status === "pending" && (
                  <p className="invite-demo-note">Demo profile — won&apos;t reply.</p>
                )}
              </div>
              <div className="invite-side">
                <span className="invite-chip" data-status={i.status}>
                  {STATUS_LABEL[i.status]}
                </span>
                <InviteActions invite={i} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InviteActions({ invite }: { invite: Invite }) {
  if (invite.status === "accepted") {
    return (
      <Link className="primary-button" href={`/chat/${invite.id}`} aria-label={`Open chat with ${invite.displayName}`}>
        Open chat →
      </Link>
    );
  }
  if (invite.status !== "pending") return null;
  if (invite.direction === "sent") {
    return (
      <InviteActionButton action={cancelInvite} inviteId={invite.id} label={`Cancel your invite to ${invite.displayName}`}>
        Cancel
      </InviteActionButton>
    );
  }
  return (
    <div className="invite-buttons">
      <InviteActionButton
        action={respondInvite}
        inviteId={invite.id}
        fields={{ answer: "accept" }}
        className="primary-button"
        label={`Accept ${invite.displayName}'s invite`}
      >
        Accept
      </InviteActionButton>
      <InviteActionButton
        action={respondInvite}
        inviteId={invite.id}
        fields={{ answer: "decline" }}
        label={`Decline ${invite.displayName}'s invite`}
      >
        Decline
      </InviteActionButton>
    </div>
  );
}
