import { ACTIONS, canDo, type ActionId } from "./permissions";
import type { Role } from "@/lib/types";

/**
 * The refusal sentence for a role that cannot take an action, or null if it
 * can. Used to render a button disabled with the reason instead of hiding it —
 * the server refuses either way, and this only saves a wasted click.
 */
export function deniedReason(role: Role, action: ActionId): string | null {
  if (canDo(role, action)) return null;
  const spec = ACTIONS[action];
  return `${spec.what} belongs to ${spec.owner}. You are working as ${role.replace(/_/g, " ")}.`;
}
