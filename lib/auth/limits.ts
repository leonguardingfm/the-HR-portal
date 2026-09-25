/**
 * Slowing down password guessing (26 September 2026). Each account locks for
 * 15 minutes after 5 wrong passwords in a row; and one network address gets at
 * most 20 failed sign-ins (or reset requests) in 15 minutes, across all
 * accounts, so guessing many usernames from one place stops too.
 *
 * The per-address count is kept in the server's memory: the portal runs as one
 * instance (docs/platform/07), and a restart forgetting it is harmless.
 */

export const ACCOUNT_LOCK = { attempts: 5, minutes: 15 };
const ADDRESS = { attempts: 20, minutes: 15 };

const store = globalThis as unknown as { __signInFailures?: Map<string, number[]> };
const failures: Map<string, number[]> = (store.__signInFailures ??= new Map<string, number[]>());

const recent = (ip: string, now: number) => (failures.get(ip) ?? []).filter((t) => now - t < ADDRESS.minutes * 60_000);

/** Minutes until this address may try again, or 0. */
export function addressBlockedFor(ip: string, now = Date.now()): number {
  const r = recent(ip, now);
  if (r.length < ADDRESS.attempts) return 0;
  return Math.max(1, Math.ceil((ADDRESS.minutes * 60_000 - (now - r[0])) / 60_000));
}

export function noteFailure(ip: string, now = Date.now()) {
  const r = recent(ip, now);
  r.push(now);
  failures.set(ip, r.slice(-ADDRESS.attempts * 2));
}

export function clearFailures(ip: string) {
  failures.delete(ip);
}

/** Roles whose holders see passports, screening files or everyone's work — two-factor matters most for them. */
export const SENSITIVE_ROLES = ["top_management", "operations_manager", "recruitment_manager", "admin_manager", "finance_officer", "vetting_admin", "vetting_controller", "shift_supervisor", "auditor"];
export const STAFF_ROLES_NEEDING_2FA = { off: [] as string[], managers: SENSITIVE_ROLES, staff: ["control", "recruitment", "admin_officer", ...SENSITIVE_ROLES] } as const;
export type TwoFactorPolicy = keyof typeof STAFF_ROLES_NEEDING_2FA;
