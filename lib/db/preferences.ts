/**
 * A person's own settings — their theme and whether hub notifications make a
 * sound. Read once per request, on the server, so the page arrives already in
 * their theme rather than flashing white first.
 */

import { cache } from "react";
import { DEFAULT_THEME } from "@/lib/core/themes";
import { db } from "./client";

export const preferencesOf = cache(async (userId: string | null | undefined) => {
  if (!userId) return { theme: DEFAULT_THEME as string, soundOn: true };
  const u = await db.user.findUnique({ where: { id: userId }, select: { theme: true, soundOn: true } });
  return { theme: u?.theme ?? DEFAULT_THEME, soundOn: u?.soundOn ?? true };
});
