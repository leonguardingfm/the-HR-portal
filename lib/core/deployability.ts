/**
 * Deployability — the one choke point that makes compliance real.
 *
 * Whether a person may be put on a post is DERIVED, never set by hand. It
 * combines the BS 7858 screening position (lib/bs7858.ts, lib/policy.ts) with
 * the compliance documents that have expiry dates. Scheduling calls this before
 * it publishes an assignment; nothing else decides.
 *
 * Owned by the Compliance domain, read by Scheduling as a hard block
 * (docs/platform/02 §3).
 */

import { EXPIRY_WARNING_DAYS } from "../sla";
import type { Severity } from "../types";

export interface Blocker {
  code: string;
  label: string;
  /** Set where the rule comes from the standard rather than from our policy. */
  clause?: string;
  severity: Severity;
}

export interface DeployabilityInput {
  /** Our own pre-deployment gate: criminality and right to work done. */
  deploymentGatePassed: boolean;
  /** Full screening not completed inside the permitted period [7.6]. */
  screeningClockExpired: boolean;
  /** Screening ended unsuccessfully: a declined risk or an upheld finding. */
  screeningUnsuccessful?: boolean;
  suspended: boolean;
  postRequiresSiaLicence: boolean;
  siaLicenceExpiry: string | null;
  /** Null where leave to remain is not time-limited. */
  rightToWorkExpiry: string | null;
}

export interface Deployability {
  deployable: boolean;
  /** Hard stops. Any one of these prevents an assignment being published. */
  blockers: Blocker[];
  /** Not yet a stop, but dated. The reason the reminder engine exists. */
  warnings: Blocker[];
}

const MS_PER_DAY = 86_400_000;

export function daysUntil(dateIso: string, now: Date = new Date()): number {
  return Math.floor((new Date(dateIso).getTime() - now.getTime()) / MS_PER_DAY);
}

/** Warning severity from how close an expiry is, using our 90/60/30 ladder. */
export function expirySeverity(dateIso: string | null, now: Date = new Date()): Severity {
  if (!dateIso) return "neutral";
  const days = daysUntil(dateIso, now);
  if (days < 0) return "critical";
  const [far, mid, near] = EXPIRY_WARNING_DAYS;
  if (days <= near) return "serious";
  if (days <= mid) return "warning";
  if (days <= far) return "warning";
  return "good";
}

export function evaluateDeployability(
  input: DeployabilityInput,
  now: Date = new Date(),
): Deployability {
  const blockers: Blocker[] = [];
  const warnings: Blocker[] = [];

  if (input.suspended) {
    blockers.push({
      code: "suspended",
      label: "Employment suspended",
      severity: "critical",
    });
  }

  if (!input.deploymentGatePassed) {
    blockers.push({
      code: "deployment_gate",
      label: "Pre-deployment checks not complete",
      severity: "critical",
    });
  }

  // Failing to complete inside the permitted period is not an administrative
  // slip: the person cannot continue in relevant employment [7.6].
  if (input.screeningClockExpired) {
    blockers.push({
      code: "screening_time_expired",
      label: "Screening period expired without completion",
      clause: "7.6",
      severity: "critical",
    });
  }

  if (input.screeningUnsuccessful) {
    blockers.push({
      code: "screening_unsuccessful",
      label: "Screening unsuccessful — a finding was not accepted",
      clause: "7.4f",
      severity: "critical",
    });
  }

  if (input.postRequiresSiaLicence) {
    if (!input.siaLicenceExpiry) {
      blockers.push({
        code: "sia_missing",
        label: "No SIA licence recorded for a licensable post",
        severity: "critical",
      });
    } else {
      const days = daysUntil(input.siaLicenceExpiry, now);
      if (days < 0) {
        blockers.push({
          code: "sia_expired",
          label: `SIA licence expired ${Math.abs(days)} days ago`,
          severity: "critical",
        });
      } else if (days <= EXPIRY_WARNING_DAYS[0]) {
        warnings.push({
          code: "sia_expiring",
          label: `SIA licence expires in ${days} days`,
          severity: expirySeverity(input.siaLicenceExpiry, now),
        });
      }
    }
  }

  if (input.rightToWorkExpiry) {
    const days = daysUntil(input.rightToWorkExpiry, now);
    if (days < 0) {
      blockers.push({
        code: "rtw_expired",
        label: `Right to work expired ${Math.abs(days)} days ago`,
        severity: "critical",
      });
    } else if (days <= EXPIRY_WARNING_DAYS[0]) {
      warnings.push({
        code: "rtw_expiring",
        label: `Right to work expires in ${days} days`,
        severity: expirySeverity(input.rightToWorkExpiry, now),
      });
    }
  }

  return { deployable: blockers.length === 0, blockers, warnings };
}

/**
 * Whether an assignment may be published.
 *
 * Deliberately the same function as deployability rather than a second set of
 * rules — a rota that enforces something slightly different from the compliance
 * register is worse than one that enforces nothing, because it is trusted.
 */
export function canPublishAssignment(d: Deployability): {
  allowed: boolean;
  reason: string | null;
} {
  if (d.deployable) return { allowed: true, reason: null };
  return { allowed: false, reason: d.blockers.map((b) => b.label).join("; ") };
}
