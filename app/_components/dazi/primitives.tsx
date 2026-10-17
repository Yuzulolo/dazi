import type { HTMLAttributes, ReactNode } from "react";
import type { GuestTrip, Tone } from "./types";

// Small, stateless building blocks (docs/DESIGN.md → Components).
// No hooks, so they work in server and client components alike.

export function AIBadge() {
  return <span className="ai-badge">AI-generated</span>;
}

export function DemoBadge({ children = "Demo profile" }: { children?: ReactNode }) {
  return <span className="demo-badge">{children}</span>;
}

export function Tags({ values, label }: { values: string[]; label?: string }) {
  return (
    <ul className="tags" aria-label={label}>
      {values.map((value) => (
        <li key={value}>{value}</li>
      ))}
    </ul>
  );
}

// Never a face or photo: guests and public profiles get this abstract shape.
export function AbstractAvatar({ size }: { size?: "large" }) {
  return <span className="abstract-avatar" data-size={size} aria-hidden="true" />;
}

export function Identity({ trip }: { trip: Pick<GuestTrip, "name" | "ageRange" | "languages"> }) {
  return (
    <div className="identity">
      <AbstractAvatar />
      <div>
        <strong>{trip.name}</strong> · {trip.ageRange}
        <small>{trip.languages.join(" / ")}</small>
      </div>
    </div>
  );
}

export function Headline({ lines, as: Tag = "h2" }: { lines: readonly string[]; as?: "h1" | "h2" }) {
  return (
    <Tag>
      {lines.map((line) => (
        <span key={line}>{line}</span>
      ))}
    </Tag>
  );
}

// Pasted-paper poster: tone colours, motif circles and crease texture.
export function Paper({
  tone,
  className = "",
  children,
  ...rest
}: { tone: Tone; className?: string; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <article className={`paper ${className}`} data-tone={tone} {...rest}>
      <span className="paper-motif" aria-hidden="true" />
      {children}
    </article>
  );
}
