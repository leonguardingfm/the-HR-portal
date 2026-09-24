/**
 * The emails the portal sends, in plain words — the wording in one place, so
 * the first email and its reminder say the same thing.
 */

import { dayLabel, ukDate } from "./rota";

export const COMPANY = "Leon Guarding";

/** The application email, in plain words. */
export function applicationEmail(args: { name: string; link: string; expiresAt: Date; years: number; reminder?: boolean }) {
  const first = args.name.split(" ")[0];
  return {
    subject: args.reminder ? `Reminder: your application to ${COMPANY}` : `Your application to ${COMPANY}`,
    body: [
      `Hello ${first},`,
      "",
      args.reminder
        ? `A reminder that your application to ${COMPANY} is not finished yet. You can carry on where you left off:`
        : `Thank you for your interest in working with ${COMPANY}. Please complete your application here — it takes about 20 minutes, works on your phone, and saves as you go:`,
      "",
      args.link,
      "",
      "You will need:",
      `• the addresses you have lived at, and what you have been doing, for the last ${args.years} years — with dates`,
      "• a contact for each employer, school or college",
      "• photo ID (passport or driving licence) and a proof of address from the last 3 months",
      "• your right-to-work share code, if you are not a British or Irish citizen",
      "",
      `The link works until ${dayLabel(ukDate(args.expiresAt))} ${args.expiresAt.getUTCFullYear()}. If you have any questions, reply to this email.`,
      "",
      `${COMPANY} Recruitment`,
    ].join("\n"),
  };
}


/** The welcome pack email, after the conditional offer. */
export function welcomePackEmail(args: { name: string; link: string; expiresAt: Date; reminder?: boolean }) {
  const first = args.name.split(" ")[0];
  return {
    subject: args.reminder ? `Reminder: your welcome pack from ${COMPANY}` : `Welcome to ${COMPANY} — your welcome pack to sign`,
    body: [
      `Hello ${first},`,
      "",
      args.reminder
        ? `A reminder that your welcome pack from ${COMPANY} is not signed yet. It takes about five minutes:`
        : `Congratulations on your offer. The next step is your welcome pack — your contract, confidentiality agreement, restrictive covenant and the employee handbook. You can read and sign it all online, on your phone:`,
      "",
      args.link,
      "",
      "You will also be asked for your next of kin's name and phone number. If you have printed and signed your contract, you can upload a photo of it too.",
      "",
      `The link works until ${dayLabel(ukDate(args.expiresAt))} ${args.expiresAt.getUTCFullYear()}. If anything is unclear, reply to this email before you sign.`,
      "",
      `${COMPANY} Recruitment`,
    ].join("\n"),
  };
}
