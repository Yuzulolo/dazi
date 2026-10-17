"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Paper } from "./primitives";
import { useSessionValue } from "./use-session-value";
import type { Tone } from "./types";

export type CarouselItem = {
  key: string;
  tone: Tone;
  label: string; // read out as "2 of 5: <label>"
  className?: string;
  content: (current: boolean) => ReactNode; // controls must be untabbable when not current
};

// Signed distance from the active slide, wrapping around (…, -1, 0, 1, …).
function distance(index: number, active: number, count: number) {
  const d = (index - active + count) % count;
  return d > count / 2 ? d - count : d;
}

// Poster wall carousel: drag/swipe, arrow keys, wraparound, previous/next
// buttons. With positionKey, the selected poster survives a trip to the
// detail page and back (sessionStorage).
export function PosterCarousel({ items, positionKey }: { items: CarouselItem[]; positionKey?: string }) {
  const [savedKey, saveKey] = useSessionValue(positionKey ?? null);
  const [localKey, setLocalKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const carouselRef = useRef<HTMLElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClickUntil = useRef(0);

  const count = items.length;
  const activeKey = localKey ?? savedKey;
  const active = Math.max(0, items.findIndex((item) => item.key === activeKey));

  function turn(index: number) {
    const next = items[(index + count) % count];
    // Keep keyboard focus on the carousel when the focused poster moves away.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && carouselRef.current?.contains(focused) && focused !== carouselRef.current) {
      carouselRef.current.focus({ preventScroll: true });
    }
    setLocalKey(next.key);
    saveKey(next.key);
  }

  function pointerDown(event: PointerEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (!event.isPrimary || event.button !== 0 || target.closest("a,button,textarea,input")) return;
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function pointerUp(event: PointerEvent<HTMLElement>) {
    const origin = start.current;
    start.current = null;
    setDragging(false);
    if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      // A tap (pointer capture swallows the click): bring the tapped poster forward.
      const poster = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-slide-index]");
      if (poster) turn(Number(poster.getAttribute("data-slide-index")));
    }
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      suppressClickUntil.current = event.timeStamp + 300;
      turn(active + (dx < 0 ? 1 : -1));
    }
  }

  if (count === 0) return null;

  return (
    <>
      <section
        className={`carousel ${dragging ? "is-dragging" : ""}`}
        ref={carouselRef}
        tabIndex={0}
        aria-label="Plan posters"
        aria-roledescription="carousel"
        onPointerDown={pointerDown}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
        }}
        onClickCapture={(event) => {
          if (event.timeStamp < suppressClickUntil.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("textarea,input")) return;
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            turn(active + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        <div className="carousel-stage">
          {items.map((item, index) => {
            const d = distance(index, active, count);
            const current = d === 0;
            return (
              <Paper
                key={item.key}
                tone={item.tone}
                className={`carousel-paper ${item.className ?? ""}`}
                data-slide-index={index}
                data-distance={d}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${item.label}`}
                aria-hidden={!current}
                onClickCapture={(event) => {
                  if (!current) {
                    event.preventDefault();
                    event.stopPropagation();
                    turn(index);
                  }
                }}
              >
                {item.content(current)}
              </Paper>
            );
          })}
        </div>
      </section>
      <div className="carousel-controls">
        <button type="button" className="round-button" onClick={() => turn(active - 1)} aria-label="Previous poster">
          ←
        </button>
        <div className="carousel-position">
          <div className="position-dots" aria-hidden="true">
            {items.map((item, index) => (
              <span key={item.key} className={index === active ? "selected" : ""} />
            ))}
          </div>
          <p aria-live="polite" aria-atomic="true">
            {active + 1} of {count} · {items[active].label}
          </p>
        </div>
        <button type="button" className="round-button" onClick={() => turn(active + 1)} aria-label="Next poster">
          →
        </button>
      </div>
      <p className="gesture-hint">Drag or swipe to explore · Arrow keys work too</p>
    </>
  );
}
