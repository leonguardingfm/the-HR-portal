/**
 * The go-live checklist's hand-ticked items (26 September 2026): the things
 * the portal cannot see for itself — mostly UK GDPR paperwork and backups.
 * Each is ticked by the Managing Director, with a note, and recorded.
 */
export const MANUAL_CHECKS = [
  { key: "backups", group: "Running it", label: "Nightly database and document backups are set up, and one has been restored to prove it works", why: "A backup nobody has restored is a hope, not a backup." },
  { key: "welcome_pack", group: "Running it", label: "The welcome pack documents are uploaded and checked", why: "New starters sign these from their link." },
  { key: "certifications", group: "Running it", label: "Company certifications and policies are uploaded (SIA ACS, insurance, BS 7858 policy)", why: "Clients and auditors ask for them." },
  { key: "training", group: "Running it", label: "Each department has been shown its screens, and knows who to ask", why: "The first week decides whether people trust it." },
  { key: "ico", group: "UK GDPR", label: "The company is registered with the ICO and the data protection fee is paid", why: "Required of any organisation processing personal data, unless exempt." },
  { key: "ropa", group: "UK GDPR", label: "A record of processing is written: what personal data, why, where, how long, who sees it", why: "Article 30. The portal's retention rules and roles are most of it already." },
  { key: "privacy_notices", group: "UK GDPR", label: "Privacy notices are given to staff, officers, candidates and client contacts", why: "Articles 13 and 14: people must be told what is collected and why." },
  { key: "monitoring", group: "UK GDPR", label: "Officers have been told in writing about location, selfie and check-call records — and acknowledged it", why: "Monitoring workers must be necessary, proportionate and transparent (ICO employment guidance)." },
  { key: "dpia", group: "UK GDPR", label: "A data protection impact assessment is done for location/selfie checks and AI email sorting", why: "Article 35: required where processing is likely to be high-risk, as systematic monitoring of staff is." },
  { key: "dpas", group: "UK GDPR", label: "Data processing agreements are in place with the host, Anthropic (AI), Microsoft (Outlook) and the email provider", why: "Article 28: every processor needs a written contract; check where each keeps data." },
  { key: "rights", group: "UK GDPR", label: "There is a named person, and a written process, for access requests and data breaches (72 hours to the ICO)", why: "Articles 15 and 33. The audit log and the person's record are the evidence." },
] as const;

export type ManualKey = (typeof MANUAL_CHECKS)[number]["key"];
