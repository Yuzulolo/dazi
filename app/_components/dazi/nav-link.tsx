"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A header link that marks the current section with aria-current="page".
// `match` is the path prefix that counts as this section (defaults to href).
export function NavLink({
  href,
  match = href,
  label,
  children,
}: {
  href: string;
  match?: string;
  label?: string; // accessible name when children add a visual extra (e.g. a count badge)
  children: ReactNode;
}) {
  const pathname = usePathname();
  const current = pathname === match || pathname.startsWith(`${match}/`);
  return (
    <Link className="text-button nav-link" href={href} aria-current={current ? "page" : undefined} aria-label={label}>
      {children}
    </Link>
  );
}
