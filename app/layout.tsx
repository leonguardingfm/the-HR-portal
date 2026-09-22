import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leon Guarding — Workforce & Operations",
  description:
    "One platform for officers, recruitment, BS 7858:2019 vetting, scheduling, live operations, compliance and departmental KPIs.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body>
        {/* AppShell reads the signed session on the server. The sign-in page
            renders bare, because there is no session to build a shell from. */}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
