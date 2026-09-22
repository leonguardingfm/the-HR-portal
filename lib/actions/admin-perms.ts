import { deniedReason } from "@/lib/auth/ui";
import type { AdminPerms } from "@/components/admin/AdminItemList";
import type { Role } from "@/lib/types";

/**
 * The refusals for one role, worked out on the server from the signed session.
 *
 * The buttons only reflect this. Every action checks it again before it writes,
 * and for approvals the database checks a third time — which is the one that
 * survives a bug in the first two.
 */
export function adminPerms(role: Role): AdminPerms {
  return {
    start: deniedReason(role, "admin_item.start"),
    review: deniedReason(role, "admin_item.review"),
    approve: deniedReason(role, "admin_item.approve"),
    reject: deniedReason(role, "admin_item.reject"),
    complete: deniedReason(role, "admin_item.complete"),
    cancel: deniedReason(role, "admin_item.cancel"),
  };
}
