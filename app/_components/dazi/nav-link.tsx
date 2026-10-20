"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A header link that marks the current section with aria-current="page".
// `match` is the path prefix that counts as this section (defaults to href).
export function NavLink({ href, match = href, children }: { href: string; match?: string; children: ReactNode }) {
  const pathname = usePathname();
  const current = pathname === match || pathname.startsWith(`${match}/`);
  return (
    <Link className="text-button nav-link" href={href} aria-current={current ? "page" : undefined}>
      {children}
    </Link>
  );
}
