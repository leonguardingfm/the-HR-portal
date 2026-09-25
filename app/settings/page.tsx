import { SettingsView } from "@/components/settings/SettingsView";
import { STAFF_ROLES_NEEDING_2FA, type TwoFactorPolicy } from "@/lib/auth/limits";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { hearsHub } from "@/lib/db/pulse";
import { preferencesOf } from "@/lib/db/preferences";

export const dynamic = "force-dynamic";

/** Everyone's own settings: their theme, their notifications, their account. */
export default async function SettingsPage() {
  const session = await requireSession();
  const [user, prefs, policy] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { displayName: true, username: true, email: true, passwordHash: true, totpEnabledAt: true } }),
    preferencesOf(session.userId),
    db.setting.findUnique({ where: { key: "security.require_2fa" } }),
  ]);
  const needed = (STAFF_ROLES_NEEDING_2FA[(policy?.value ?? "off") as TwoFactorPolicy] ?? []) as readonly string[];
  return (
    <SettingsView
      me={{ name: user?.displayName ?? session.name, username: user?.username ?? null, email: user?.email ?? null, activeRole: session.activeRole, roles: session.roles }}
      theme={prefs.theme}
      soundOn={prefs.soundOn}
      hearsHub={hearsHub(session.activeRole)}
      hasPassword={!!user?.passwordHash}
      twoFactor={{ enabledAt: user?.totpEnabledAt?.toISOString() ?? null, required: session.roles.some((r) => needed.includes(r)) }}
      must={session.must ?? null}
    />
  );
}
