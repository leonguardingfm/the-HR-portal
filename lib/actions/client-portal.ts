"use server";

import { revalidatePath } from "next/cache";
import { ACTIONS, canDo, type ActionId } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/server";
import { createClientRequest } from "@/lib/db/hub";
import { portalScope } from "@/lib/db/client-portal";
import { ok, refused, type ActionResult } from "./types";

/**
 * What a client contact can do in their portal (26 September 2026): send a
 * request. Everything else there is looking. The site is checked against the
 * sites this contact may see, read from the database — never trusted from the
 * form — so a request can only ever be about their own organisation.
 */
async function guard(action: ActionId) {
  const session = await getSession();
  if (!session) return { scope: null, error: refused("Your session has ended. Sign in again.") };
  if (!canDo(session.activeRole, action)) return { scope: null, error: refused(`${ACTIONS[action].what} belongs to ${ACTIONS[action].owner}.`) };
  const scope = await portalScope(session);
  if (!scope) return { scope: null, error: refused("Your login is not linked to your organisation yet. Speak to your Leon Guarding account manager.") };
  return { scope, error: null };
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function raiseClientRequest(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { scope, error } = await guard("client.request");
  if (error || !scope) return error!;
  const siteId = text(formData, "siteId") || null;
  if (siteId && !scope.siteIds.includes(siteId)) return refused("Choose one of your sites.");
  const r = await createClientRequest(
    { userId: scope.userId, name: scope.name, clientId: scope.clientId, clientName: scope.clientName },
    { kind: text(formData, "kind"), siteId, subject: text(formData, "subject"), details: text(formData, "details"), urgent: formData.get("urgent") === "on", when: text(formData, "when") },
  );
  if (!r.ok) return refused(r.message);
  revalidatePath("/client-portal/requests");
  revalidatePath("/client-portal");
  return ok(r.message);
}
