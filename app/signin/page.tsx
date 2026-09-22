import { db } from "@/lib/db/client";
import { ROLE_LABELS } from "@/lib/labels";
import { roleOption } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { devSignIn } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Sign-in.
 *
 * Name, then the role you are working as. The role list is not the full set of
 * roles — it is only the ones that person actually holds, read from the
 * database, because offering a role someone cannot hold is an invitation to a
 * refusal they will not understand.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const now = new Date();
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { displayName: "asc" },
    include: {
      roles: { where: { revokedAt: null } },
      // Roles lent to this person and in force right now. A deputy covering
      // the Finance Officer's leave has to be able to sign in as Finance
      // Officer, or the delegation is a row in a table and nothing else.
      delegationsHeld: {
        where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } },
        include: { from: true },
      },
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div
        className="w-full max-w-lg rounded-lg border p-6"
        style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
      >
        <p className="text-[11px] tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Leon Guarding &amp; FM
        </p>
        <h1 className="mt-1.5 text-lg font-semibold tracking-tight">Workforce &amp; Operations</h1>
        <p className="mt-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Sign in, and choose the role you are working as. The role decides what you can
          see and what you can do, and it is recorded against everything you do.
        </p>

        {users.length === 0 && (
          <p className="mt-6 text-[13px]" style={{ color: "var(--status-critical)" }}>
            No users are set up. Run <code className="tnum">npm run db:seed</code> first.
          </p>
        )}

        <div className="mt-6 space-y-3">
          {users.map((u) => {
            const substantive = u.roles.map((r) => r.role as Role);
            const lent = u.delegationsHeld
              .map((d) => ({ role: d.role as Role, from: d.from.displayName, endsAt: d.endsAt }))
              .filter((d) => !substantive.includes(d.role));
            const roles = [...substantive, ...lent.map((d) => d.role)];
            return (
              <form
                key={u.id}
                action={devSignIn}
                className="rounded border p-3"
                style={{ borderColor: "var(--hairline)" }}
              >
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="next" value={next ?? "/"} />
                <p className="text-[13px] font-medium">{u.displayName}</p>
                <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Holds {substantive.length} role{substantive.length === 1 ? "" : "s"}
                  {lent.length > 0 &&
                    `, plus ${lent.length} lent: ${lent
                      .map(
                        (d) =>
                          `${ROLE_LABELS[d.role]} from ${d.from} until ${d.endsAt.toISOString().slice(0, 10)}`,
                      )
                      .join("; ")}`}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    name="role"
                    defaultValue={roles[0]}
                    aria-label={`Role for ${u.displayName}`}
                    className="min-w-0 rounded border px-2 py-1.5 text-[12px]"
                    style={{
                      background: "var(--page)",
                      borderColor: "var(--hairline)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                        {roleOption(r)?.clause ? ` (${roleOption(r)!.clause})` : ""}
                        {lent.some((d) => d.role === r) ? " — lent" : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--series-1)", color: "#fff" }}
                  >
                    Sign in as {u.displayName}
                  </button>
                </div>
              </form>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <strong>This is a development sign-in, not authentication.</strong> It checks that
          the person exists and holds the role; it proves nothing about who is at the
          keyboard, and it refuses to run in production unless deliberately enabled. Company
          sign-on replaces it, and nothing else in the platform changes when it does —
          everything reads the same session.
        </p>
      </div>
    </main>
  );
}
