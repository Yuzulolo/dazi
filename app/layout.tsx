import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";

// Fonts from docs/DESIGN.md: Manrope for headings, DM Sans for body text.
const bodyFont = DM_Sans({
  variable: "--font-dazi-body",
  subsets: ["latin"],
  display: "swap",
});

const headingFont = Manrope({
  variable: "--font-dazi-heading",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dazi",
  description: "Find a travel or food buddy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
