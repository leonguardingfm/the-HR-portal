/**
 * What an action gives back.
 *
 * Actions return a result rather than throwing on refusal, because a refusal is
 * a normal outcome the person needs to read — not a server error. Genuine
 * faults still throw.
 */
export interface ActionResult {
  ok: boolean;
  message: string;
}

export const ok = (message: string): ActionResult => ({ ok: true, message });
export const refused = (message: string): ActionResult => ({ ok: false, message });
