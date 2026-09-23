/**
 * The document type registry.
 *
 * One store for every document in the business, and therefore one expiry
 * engine. SIA licences, right to work, visas, insurance, training certificates
 * and client contracts all warn at 90/60/30 days through the same code path
 * (lib/sla.ts) rather than through six separate reminder implementations.
 *
 * Each type carries its own retention rule. The one that matters most is the
 * criminal record certificate: the outcome and date are retained, the
 * certificate is not.
 */

import type { DocumentType } from "./types";

export const DOCUMENT_TYPES: DocumentType[] = [
  {
    id: "sia_licence",
    label: "SIA licence",
    department: "compliance",
    expires: true,
    copyRetained: true,
    retentionNote: "Held while employed; disposed 7 years after cessation.",
    clause: "7.4c",
  },
  {
    id: "right_to_work",
    label: "Right to work evidence",
    department: "compliance",
    expires: true,
    copyRetained: true,
    retentionNote: "Statutory excuse requires the copy be kept for the employment plus 2 years.",
    clause: "7.4b",
  },
  {
    id: "visa",
    label: "Visa / leave to remain",
    department: "compliance",
    expires: true,
    copyRetained: true,
    retentionNote: "As right to work. Expiry blocks assignment publication.",
  },
  {
    id: "photo_id",
    label: "Photographic identity",
    department: "vetting",
    expires: true,
    copyRetained: true,
    retentionNote: "Part of the screening file; 7 years after cessation.",
    clause: "7.4a",
  },
  {
    id: "address_proof",
    label: "Proof of address",
    department: "vetting",
    expires: false,
    copyRetained: true,
    retentionNote: "Part of the screening file; 7 years after cessation.",
    clause: "7.4a",
  },
  {
    id: "employment_reference",
    label: "Employment reference",
    department: "vetting",
    expires: false,
    copyRetained: true,
    retentionNote: "Screening file. Request dates retained as extension evidence.",
    clause: "7.7",
  },
  {
    id: "gap_evidence",
    label: "Evidence for a gap over 31 days",
    department: "vetting",
    expires: false,
    copyRetained: true,
    retentionNote: "Screening file; no unverified gap over 31 days may remain.",
    clause: "7.7",
  },
  {
    id: "statutory_declaration",
    label: "Statutory declaration",
    department: "vetting",
    expires: true,
    copyRetained: true,
    retentionNote: "Valid for 6 months from swearing.",
    clause: "7.7i",
  },
  {
    id: "criminal_record_outcome",
    label: "Criminality check outcome",
    department: "vetting",
    expires: false,
    /** Data minimisation: the certificate itself is never stored. */
    copyRetained: false,
    retentionNote: "Outcome and date only. The certificate is seen, recorded, and not copied.",
    clause: "7.7j",
  },
  {
    id: "welcome_pack",
    label: "Signed welcome pack",
    department: "recruitment",
    expires: false,
    copyRetained: true,
    retentionNote: "Employment record; 7 years after cessation.",
  },
  {
    id: "training_certificate",
    label: "Training certificate",
    department: "compliance",
    expires: true,
    copyRetained: true,
    retentionNote: "Held while valid. Expiry drives a renewal task, not a block.",
    clause: "6.2",
  },
  {
    id: "site_instructions",
    label: "Site assignment instructions",
    department: "operations",
    expires: true,
    copyRetained: true,
    retentionNote: "Current version held against the site; reviewed annually.",
  },
  {
    id: "client_contract",
    label: "Client contract",
    department: "account_management",
    expires: true,
    copyRetained: true,
    retentionNote: "Held for the contract term plus 7 years. Sets the screening period.",
  },
  {
    id: "inspection_report",
    label: "Site inspection report",
    department: "quality",
    expires: false,
    copyRetained: true,
    retentionNote: "Held 3 years; evidence for ACS assessment.",
  },
];

export const documentTypeById = (id: string) =>
  DOCUMENT_TYPES.find((t) => t.id === id);

/** Types whose expiry the scheduler watches. One list, one job. */
export const EXPIRING_TYPES = DOCUMENT_TYPES.filter((t) => t.expires);

/** Types where only the outcome is kept — the data-minimisation cases. */
export const OUTCOME_ONLY_TYPES = DOCUMENT_TYPES.filter((t) => !t.copyRetained);
