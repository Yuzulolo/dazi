"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { blockFromInvite, sendMessage, type MessagingState } from "@/app/messaging/actions";
import { InfoDialog } from "@/app/_components/dazi/info-dialog";

// No realtime (SPEC): while the tab is visible the page re-renders from the server every 15 s.
export function ChatRefresher() {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router]);
  return null;
}

export function ChatComposer({ inviteId }: { inviteId: string }) {
  const [state, formAction, pending] = useActionState(sendMessage, {} as MessagingState);
  const [body, setBody] = useState("");
  const form = useRef<HTMLFormElement>(null);
  // Clear the box after each successful send (every action result is a new object). A failed
  // send keeps the text so nothing typed is lost.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setBody("");
  }

  return (
    <form ref={form} action={formAction} className="dazi-form chat-composer">
      <input type="hidden" name="inviteId" value={inviteId} />
      <p className="field">
        <label htmlFor="chat-body">Message</label>
        <textarea
          id="chat-body"
          name="body"
          maxLength={1000}
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter makes a new line.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!pending && body.trim()) form.current?.requestSubmit(); // no double send (review S5)
            }
          }}
          aria-describedby="chat-help"
        />
        <small id="chat-help" className="field-help">
          {body.length}/1000 · Enter to send, Shift+Enter for a new line
        </small>
      </p>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="primary-button" disabled={pending || !body.trim()}>
        {pending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export function BlockButton({ inviteId, displayName }: { inviteId: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(blockFromInvite, {} as MessagingState);
  return (
    <>
      <button type="button" className="text-button" onClick={() => setOpen(true)}>
        Block {displayName}
      </button>
      {open && (
        <InfoDialog
          onClose={() => setOpen(false)}
          content={{
            eyebrow: "Block",
            title: `Block ${displayName}?`,
            body: "You both disappear from each other's matches, open invites are cancelled and this chat closes for both of you. They don't get a notification.",
          }}
        >
          <form action={formAction} className="modal-actions">
            <input type="hidden" name="inviteId" value={inviteId} />
            {state.error && (
              <p className="form-error" role="alert">
                {state.error}
              </p>
            )}
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? "Blocking…" : `Block ${displayName}`}
            </button>
            <button type="button" className="outline-button" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </form>
        </InfoDialog>
      )}
    </>
  );
}
