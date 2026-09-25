import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import { getSession } from "@/lib/auth/server";
import { themeAttributes } from "@/lib/core/themes";
import { preferencesOf } from "@/lib/db/preferences";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leon Guarding — Workforce & Operations",
  description:
    "One platform for officers, recruitment, BS 7858:2019 vetting, scheduling, live operations, compliance and departmental KPIs.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Each person's own theme, from their settings; white for everyone else
  // (the sign-in page, a candidate's link).
  const session = await getSession();
  const { theme } = await preferencesOf(session?.userId);
  return (
    <html lang="en-GB" suppressHydrationWarning {...themeAttributes(theme)}>
      <body>
        {/* AppShell reads the signed session on the server. The sign-in page
            renders bare, because there is no session to build a shell from. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
