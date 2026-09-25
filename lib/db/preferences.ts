/**
 * A person's own settings — their theme and whether hub notifications make a
 * sound — and their name as the account holds it now. Read once per request, on the server, so the page arrives already in
 * their theme rather than flashing white first.
 */

import { cache } from "react";
import { DEFAULT_THEME } from "@/lib/core/themes";
import { db } from "./client";

export const preferencesOf = cache(async (userId: string | null | undefined) => {
  if (!userId) return { theme: DEFAULT_THEME as string, soundOn: true, name: null as string | null, organisation: null as string | null, services: null as { portal: boolean; live: boolean; siteIssues: boolean } | null };
  const u = await db.user.findUnique({ where: { id: userId }, select: { theme: true, soundOn: true, displayName: true, client: { select: { name: true, portalSince: true, liveSince: true, siteIssuesSince: true } } } });
  // The name as it is now — a correction shows at once, not at the next sign-in.
  // A client contact's organisation stands where staff see their department.
  // …and the paid extras it has, so the menu shows only those.
  const services = u?.client ? { portal: !!u.client.portalSince, live: !!u.client.liveSince, siteIssues: !!u.client.siteIssuesSince } : null;
  return { theme: u?.theme ?? DEFAULT_THEME, soundOn: u?.soundOn ?? true, name: u?.displayName ?? null, organisation: u?.client?.name ?? null, services };
});
