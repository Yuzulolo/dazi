"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { DialogContent } from "./types";

// Native <dialog>: Escape and backdrop click close it, focus returns to the
// button that opened it.
export function InfoDialog({ content, onClose, children }: { content: DialogContent; onClose: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      className="dazi-modal"
      ref={ref}
      aria-labelledby="dazi-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        const outside =
          event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
        if (outside) onClose();
      }}
    >
      <button type="button" className="close-button" onClick={onClose} aria-label="Close">
        ×
      </button>
      {content.eyebrow && <p className="eyebrow">{content.eyebrow}</p>}
      <h2 id="dazi-modal-title">{content.title}</h2>
      <p>{content.body}</p>
      {children ?? <div className="modal-actions">
        {content.signUp ? (
          <>
            <Link className="primary-button" href="/signup">
              Sign up
            </Link>
            <button type="button" className="outline-button" onClick={onClose}>
              Not now
            </button>
          </>
        ) : (
          <button type="button" className="primary-button" onClick={onClose}>
            Got it
          </button>
        )}
      </div>}
    </dialog>
  );
}

// A text button that opens an InfoDialog (header "How it works", footer privacy, safety tips).
export function InfoButton({ content, children }: { content: DialogContent; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-button" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <InfoDialog content={content} onClose={() => setOpen(false)} />}
    </>
  );
}
