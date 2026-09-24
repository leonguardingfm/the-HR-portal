/**
 * The welcome pack, signed online (HR, 25 September 2026). After the
 * conditional offer the candidate is emailed a link: they read what they are
 * signing, tick each part, give their next of kin, and sign with their name.
 * Each part completes its onboarding step, so the checklist follows the
 * signature rather than someone ticking it from a scanned page.
 *
 * Bank details are deliberately not asked for: the portal does not keep them.
 */

import type { OnboardingStepKey } from "./onboarding";

export const WELCOME_ACKS: { id: string; step: OnboardingStepKey; title: string; text: string }[] = [
  {
    id: "contract",
    step: "contract_signed",
    title: "Employment contract",
    text: "I accept the terms of employment offered to me. I understand my employment is conditional on screening to BS 7858 being completed satisfactorily within the period allowed, and that it ends if screening is not completed or is unsatisfactory.",
  },
  {
    id: "confidentiality",
    step: "confidentiality_signed",
    title: "Confidentiality & disclosure",
    text: "I will keep confidential anything I learn about the company, its clients and their sites, during and after my employment. I will tell the company straight away about any caution, conviction, charge or change in my circumstances that affects my screening or SIA licence.",
  },
  {
    id: "covenant",
    step: "covenant_signed",
    title: "Restrictive covenant",
    text: "I accept the restrictive covenant in my contract, including not working directly for a client site I am placed at during my employment and for the period it states after.",
  },
  {
    id: "handbook",
    step: "handbook_acknowledged",
    title: "Employee handbook",
    text: "I have received the Employee Handbook, and I will read it and follow it.",
  },
];

export interface WelcomeInput {
  acks: string[];
  nextOfKinName: string;
  nextOfKinRelation: string;
  nextOfKinPhone: string;
  signedName: string;
}

/** Why it cannot be signed yet, or null. The typed name must be their name as we hold it. */
export function welcomeProblem(d: WelcomeInput, fullName: string): string | null {
  const missing = WELCOME_ACKS.filter((a) => !d.acks.includes(a.id));
  if (missing.length) return `Tick ${missing.map((a) => a.title.toLowerCase()).join(", ")} to accept ${missing.length === 1 ? "it" : "them"}.`;
  if (d.nextOfKinName.trim().length < 2) return "Give your next of kin's name.";
  if (d.nextOfKinPhone.replace(/\D/g, "").length < 10) return "Give your next of kin's phone number.";
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  if (norm(d.signedName) !== norm(fullName)) return `Type your full name exactly as ${fullName} to sign.`;
  return null;
}
