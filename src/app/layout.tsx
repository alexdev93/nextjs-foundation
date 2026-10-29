import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/client/components/theme-toggle";
import { AppProviders } from "@/client/providers/app-providers";
import { EXAMPLES, SITE } from "@/shared/constants/site";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: SITE.name, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

const NAV_LINKS = EXAMPLES.filter((example) => example.kind !== "api");

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // next-themes sets the theme class on <html> before hydration.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">
        <AppProviders>
          <div className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
            {/* <nav className="flex items-center justify-between gap-4 text-sm">
              <Link href="/" className="font-semibold">
                {SITE.name}
              </Link>
              <div className="text-muted-foreground flex items-center gap-4">
                {NAV_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                ))}
                <ThemeToggle />
              </div>
            </nav> */}
            <main className="flex flex-col gap-8">{children}</main>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
