"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  cancelInvite,
  respondInvite,
  sendInvite,
  type MessagingState,
} from "@/app/messaging/actions";
import { InfoDialog } from "./info-dialog";

type Action = (prev: MessagingState, formData: FormData) => Promise<MessagingState>;
export type InviteSummary = { id: string; direction: "sent" | "received"; status: string };

// One button that runs a messaging server action for an invite and shows a refusal inline.
export function InviteActionButton({
  action,
  inviteId,
  fields,
  className = "outline-button",
  label,
  children,
}: {
  action: Action;
  inviteId: string;
  fields?: Record<string, string>;
  className?: string;
  label?: string; // accessible name when several rows have the same button text (review N5)
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {} as MessagingState);
  return (
    <form action={formAction} className="invite-action">
      <input type="hidden" name="inviteId" value={inviteId} />
      {Object.entries(fields ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className} disabled={pending} aria-label={label}>
        {children}
      </button>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}

// The invite part of a match card: Invite (note dialog) / Invited · Cancel / Accept · Decline /
// Open chat, depending on the invite between my plan and theirs (if any).
export function MatchInviteControls({
  postId,
  displayName,
  isDemo,
  invite,
  demoLogin = false,
}: {
  postId: string;
  displayName: string;
  isDemo: boolean;
  invite: InviteSummary | null;
  demoLogin?: boolean; // the shared demo account: it may only connect with demo profiles (DB rule)
}) {
  const [open, setOpen] = useState(false);
  const demoNote = isDemo ? <p className="invite-demo-note">Demo profile — won&apos;t reply.</p> : null;

  if (invite?.status === "accepted") {
    return (
      <div className="poster-actions">
        <Link className="primary-button" href={`/chat/${invite.id}`}>
          Open chat →
        </Link>
      </div>
    );
  }
  if (invite?.status === "pending" && invite.direction === "sent") {
    return (
      <div className="invite-controls">
        <p className="invite-status">Invited · waiting for {displayName}</p>
        {demoNote}
        <InviteActionButton action={cancelInvite} inviteId={invite.id}>
          Cancel invite
        </InviteActionButton>
      </div>
    );
  }
  if (invite?.status === "pending" && invite.direction === "received") {
    return (
      <div className="invite-controls">
        <p className="invite-status">{displayName} invited you</p>
        <div className="poster-actions">
          <InviteActionButton
            action={respondInvite}
            inviteId={invite.id}
            fields={{ answer: "accept" }}
            className="primary-button"
            label={`Accept ${displayName}'s invite`}
          >
            Accept
          </InviteActionButton>
          <InviteActionButton action={respondInvite} inviteId={invite.id} fields={{ answer: "decline" }} label={`Decline ${displayName}'s invite`}>
            Decline
          </InviteActionButton>
        </div>
      </div>
    );
  }
  if (invite?.status === "closed") return <p className="invite-status">This chat is closed.</p>;
  if (demoLogin && !isDemo) {
    return <p className="invite-demo-note">The shared demo account can only invite demo profiles.</p>;
  }

  return (
    <div className="invite-controls">
      {demoNote}
      <div className="poster-actions">
        <button type="button" className="primary-button" onClick={() => setOpen(true)}>
          Invite {displayName}
        </button>
      </div>
      {open && <InviteDialog postId={postId} displayName={displayName} isDemo={isDemo} onClose={() => setOpen(false)} />}
    </div>
  );
}

function InviteDialog({
  postId,
  displayName,
  isDemo,
  onClose,
}: {
  postId: string;
  displayName: string;
  isDemo: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(sendInvite, {} as MessagingState);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);
  return (
    <InfoDialog
      onClose={onClose}
      content={{
        eyebrow: "Invite",
        title: `Invite ${displayName}`,
        body: isDemo
          ? "Demo profile — won't reply. You can still try how inviting works."
          : "They see your plan and your note. If they accept, a private chat opens for the two of you.",
      }}
    >
      <form action={formAction} className="dazi-form invite-form">
        <input type="hidden" name="postId" value={postId} />
        <p className="field">
          <label htmlFor="invite-note">A short note (optional)</label>
          <textarea
            id="invite-note"
            name="note"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Hi! Same dates — fancy the flea market on Sunday?"
            aria-describedby="invite-note-help"
          />
          <small id="invite-note-help" className="field-help">
            {note.length}/300 · No email or phone number — share those in the chat once you&apos;re connected.
          </small>
        </p>
        {state.error && (
          <p className="form-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="modal-actions">
          <button type="submit" className="primary-button" disabled={pending}>
            {pending ? "Sending…" : "Send invite"}
          </button>
          <button type="button" className="outline-button" onClick={onClose}>
            Not now
          </button>
        </div>
      </form>
    </InfoDialog>
  );
}
