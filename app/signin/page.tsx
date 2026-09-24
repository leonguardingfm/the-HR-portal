import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice } from "@/components/auth/Field";
import { SignInForm } from "@/components/auth/SignInForm";
import { DEPARTMENT_LABELS, DEV_SEED_PASSWORD } from "@/lib/accounts";
import { db } from "@/lib/db/client";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Sign-in: username and password, nothing else. The role comes from the
 * account, so it is not asked for here.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; registered?: string; u?: string; ended?: string }>;
}) {
  const { next, registered, u, ended } = await searchParams;
  const dev = process.env.NODE_ENV !== "production";

  // The seeded demonstration accounts, listed only in development so each
  // role is one copy-paste away. Registered accounts are never listed.
  const demo = dev
    ? await db.user.findMany({
        where: { active: true, status: "active", username: { not: null }, passwordHash: { not: null } },
        orderBy: { displayName: "asc" },
        select: {
          username: true,
          displayName: true,
          department: true,
          roles: { where: { revokedAt: null }, select: { role: true } },
          events: { where: { type: "account.registered" }, select: { id: true }, take: 1 },
        },
      })
    : [];
  const seeded = demo.filter((d) => d.events.length === 0);

  return (
    <AuthShell
      active="signin"
      title="Welcome back"
      intro="Sign in with your username and password. Your department is already on your account, so you go straight to the screens for your role."
    >
      <div className="space-y-4">
        {ended && (
          <Notice tone="info">
            You have been signed out because your account is no longer active. Speak to
            Administration if you think this is a mistake.
          </Notice>
        )}
        {registered === "active" && (
          <Notice tone="success">
            <strong>Account created.</strong> Sign in with your new username and password.
          </Notice>
        )}
        {registered === "pending" && (
          <Notice tone="info">
            <strong>Registration received.</strong> Your department needs an administrator to
            approve it. You will be able to sign in once it has been approved.
          </Notice>
        )}

        <SignInForm next={next ?? ""} username={u ?? ""} />

        <p className="text-center text-[12px]" style={{ color: "var(--text-secondary)" }}>
          New here?{" "}
          <Link href="/signup" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
            Create an account
          </Link>
          {" · "}
          <Link href="/signup/officer" className="font-medium underline-offset-2 hover:underline" style={{ color: "var(--series-1)" }}>
            I’m a security officer
          </Link>
        </p>

        {seeded.length > 0 && (
          <details
            className="rounded-lg border text-[12px]"
            style={{ borderColor: "var(--hairline)" }}
          >
            <summary
              className="cursor-pointer px-3.5 py-2.5 font-medium select-none"
              style={{ color: "var(--text-secondary)" }}
            >
              Development accounts
            </summary>
            <div className="border-t px-3.5 pt-2.5 pb-3" style={{ borderColor: "var(--hairline)" }}>
              <p style={{ color: "var(--text-muted)" }}>
                Seeded by <code>npm run db:seed</code>. Every one uses the password{" "}
                <code className="rounded px-1 py-0.5" style={{ background: "var(--wash-neutral)", color: "var(--text-primary)" }}>
                  {DEV_SEED_PASSWORD}
                </code>
                . Not shown in production.
              </p>
              <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                {seeded.map((d) => (
                  <li key={d.username} className="flex min-w-0 items-baseline gap-2">
                    <code className="font-medium">{d.username}</code>
                    <span className="truncate" style={{ color: "var(--text-muted)" }}>
                      {d.department
                        ? DEPARTMENT_LABELS[d.department]
                        : d.roles.map((r) => ROLE_LABELS[r.role as Role]).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        )}
      </div>
    </AuthShell>
  );
}
