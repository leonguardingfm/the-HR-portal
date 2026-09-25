import { SettingsView } from "@/components/settings/SettingsView";
import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { hearsHub } from "@/lib/db/pulse";
import { preferencesOf } from "@/lib/db/preferences";

export const dynamic = "force-dynamic";

/** Everyone's own settings: their theme, their notifications, their account. */
export default async function SettingsPage() {
  const session = await requireSession();
  const [user, prefs] = await Promise.all([
    db.user.findUnique({ where: { id: session.userId }, select: { displayName: true, username: true, email: true, passwordHash: true } }),
    preferencesOf(session.userId),
  ]);
  return (
    <SettingsView
      me={{ name: user?.displayName ?? session.name, username: user?.username ?? null, email: user?.email ?? null, activeRole: session.activeRole, roles: session.roles }}
      theme={prefs.theme}
      soundOn={prefs.soundOn}
      hearsHub={hearsHub(session.activeRole)}
      hasPassword={!!user?.passwordHash}
    />
  );
}
