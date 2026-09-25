/**
 * Site issues (26 September 2026): something an officer finds wrong at a
 * client's site. Words for each kind, urgency and stage — for Control, and
 * the plainer ones the client reads.
 */

export const SITE_ISSUE_KINDS = [
  { id: "door_or_lock", label: "Door or lock", icon: "🚪" },
  { id: "leak_or_flood", label: "Leak or flooding", icon: "💧" },
  { id: "fence_or_gate", label: "Fence, gate or barrier", icon: "🚧" },
  { id: "lighting", label: "Lighting out", icon: "💡" },
  { id: "fire_safety", label: "Fire safety (exit, alarm, extinguisher)", icon: "🔥" },
  { id: "cctv_or_alarm", label: "CCTV or intruder alarm", icon: "📹" },
  { id: "damage", label: "Damage or breakage", icon: "🔨" },
  { id: "hazard", label: "Hazard to people", icon: "⚠️" },
  { id: "other", label: "Something else", icon: "•" },
] as const;
export type SiteIssueKind = (typeof SITE_ISSUE_KINDS)[number]["id"];
export const kindLabel = (k: string) => SITE_ISSUE_KINDS.find((x) => x.id === k)?.label ?? k;
export const kindIcon = (k: string) => SITE_ISSUE_KINDS.find((x) => x.id === k)?.icon ?? "•";

export const SITE_ISSUE_URGENCY = [
  { id: "urgent", label: "Urgent — unsafe or unsecured now", short: "Urgent" },
  { id: "soon", label: "Soon — within the next few days", short: "Soon" },
  { id: "routine", label: "Routine — when convenient", short: "Routine" },
] as const;
export type SiteIssueUrgency = (typeof SITE_ISSUE_URGENCY)[number]["id"];
export const urgencyLabel = (u: string) => SITE_ISSUE_URGENCY.find((x) => x.id === u)?.short ?? u;

/** What Control sees of where an issue has got to. */
export const STAFF_STAGE: Record<string, string> = {
  reported: "To review",
  kept_internal: "Kept internal",
  open: "With the client",
  client_fixed: "Client says fixed — to check",
  resolved: "Resolved",
};

/** What the client sees. */
export const CLIENT_STAGE: Record<string, { label: string; tone: "good" | "info" | "warn" | "bad" }> = {
  open: { label: "Needs attention", tone: "warn" },
  client_fixed: { label: "You said fixed — our officer will check", tone: "info" },
  resolved: { label: "Fixed — checked by our officer", tone: "good" },
};

/** Up to four photos, each up to 8 MB. */
export const SITE_ISSUE_PHOTOS = { max: 4, bytes: 8 * 1024 * 1024 };
/** An officer can report during their shift, or up to twelve hours after it. */
export const REPORT_WINDOW_HOURS = 12;
