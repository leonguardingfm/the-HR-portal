/**
 * Reading an email with Claude (Control, 25 September 2026).
 *
 * The AI is asked to sort the email into the agreed categories and
 * priorities, summarise it in its own facts, and say what action it needs —
 * and to say so when it is unsure. It is never asked to fill a gap: a client,
 * site or officer is returned only as written in the email, and matched to our
 * records afterwards by the portal, not by the model.
 *
 * Without ANTHROPIC_API_KEY the rules in lib/core/hub.ts sort the email
 * instead, and mark it for a person to check. The AI never sends anything.
 */

import { CATEGORIES, PRIORITIES, type HubCategory, type HubDepartment, type HubPriority } from "@/lib/core/hub";

export const aiAvailable = () => !!process.env.ANTHROPIC_API_KEY;
export const aiModel = () => process.env.HUB_AI_MODEL || "claude-sonnet-5";

export interface AiReading {
  category: HubCategory;
  categoryOther: string | null;
  priority: HubPriority;
  confidence: number;
  uncertain: boolean;
  reasons: string[];
  summary: string;
  requiredAction: string;
  department: HubDepartment | null;
  clientAsWritten: string | null;
  siteAsWritten: string | null;
  officerAsWritten: string | null;
  deadlineAsWritten: string | null;
  model: string;
  ms: number;
}

const SYSTEM = `You sort emails that arrive in the shared mailboxes of Leon Guarding & FM Limited, a UK security guarding company. Its Control Room runs officers on client sites 24/7; HR recruits, screens (BS 7858) and looks after staff; Accounts & Admin handle invoices and contracts.

Choose ONE category:
- incident: something that happened on a site (injury, theft, fire, violence, alarm, police attendance)
- complaint: someone unhappy with our service or an officer
- lateness: an officer late or not attending
- cover_request: a request for an officer or extra officers
- shift_cancellation: a shift no longer needed
- client_request: anything else a client asks us to do
- officer_query: a question from one of our officers
- compliance: audits, insurance, accreditation, policies, certificates
- rtw_sia_expiry: right to work or SIA licence expiry
- hr_matter: leave, sickness, grievance, pay slips, resignations, training
- job_renewal: a contract or job renewal
- invoice_accounts: invoices, payments, statements
- other: none of these (say what in category_other)

Choose ONE priority, judged on urgency, operational impact, legal, safeguarding and health and safety risk, client impact and deadline:
- critical: immediate danger to life; serious incident; fire; medical emergency; safeguarding concern; violence or threat of violence; missing officer at a critical site; complete loss of security cover; serious data breach; police, ambulance or emergency services involved
- very_high: urgent uncovered shifts; officer non-attendance; serious client complaints; active site incidents; SIA or right-to-work expiry affecting deployment; major service failure; urgent client instruction; serious lateness affecting cover
- high: cover requests; shift cancellations; complaints needing prompt investigation; compliance documents with an approaching deadline; important client requests; payroll or payment issues affecting employees; unresolved officer welfare concerns
- medium: routine employee queries; standard document requests; job renewals; general operational follow-ups; non-urgent HR matters; routine client enquiries
- low: general information; marketing; non-urgent admin; duplicates; nothing needing action

Rules:
- Use only what the email says. Never invent a name, date, site, time or fact.
- client_as_written, site_as_written, officer_as_written and deadline_as_written: copy exactly as written in the email, or null if it is not there.
- summary: at most two short sentences of what the email says.
- required_action: one short instruction for the person handling it.
- If you are not sure of the category or the priority, set uncertain to true and give a lower confidence.
- If any wording suggests danger to life, violence, safeguarding, fire or emergency services, choose critical even if unsure, and set uncertain to true.`;

const TOOL = {
  name: "record_sorting",
  description: "Record how this email is sorted.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: CATEGORIES.map((c) => c.id) },
      category_other: { type: ["string", "null"], description: "What it is, when the category is other." },
      priority: { type: "string", enum: PRIORITIES.map((p) => p.id) },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      uncertain: { type: "boolean" },
      reasons: { type: "array", items: { type: "string" }, maxItems: 4, description: "Short reasons for the category and priority." },
      summary: { type: "string" },
      required_action: { type: "string" },
      department: { type: "string", enum: ["control", "recruitment", "administration"], description: "control = Control Room, recruitment = HR, administration = Accounts & Admin." },
      client_as_written: { type: ["string", "null"] },
      site_as_written: { type: ["string", "null"] },
      officer_as_written: { type: ["string", "null"] },
      deadline_as_written: { type: ["string", "null"] },
    },
    required: ["category", "priority", "confidence", "uncertain", "reasons", "summary", "required_action", "department"],
  },
};

type Attachment = { name: string; mimeType: string; base64: string };

/** The email read by Claude, or null when there is no key or the call fails — the caller falls back to the rules. */
export async function readWithAi(email: { subject: string; body: string; from: string; mailbox: string; attachments?: Attachment[] }): Promise<AiReading | { error: string } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const model = aiModel();
  const started = Date.now();
  const files = (email.attachments ?? [])
    .filter((a) => a.mimeType === "application/pdf" || a.mimeType.startsWith("image/"))
    .slice(0, 4)
    .map((a) =>
      a.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 }, title: a.name }
        : { type: "image", source: { type: "base64", media_type: a.mimeType, data: a.base64 } },
    );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              ...files,
              { type: "text", text: `Mailbox: ${email.mailbox}\nFrom: ${email.from}\nSubject: ${email.subject}\n\n${email.body.slice(0, 20_000)}` },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return { error: `The AI answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
    const json = (await res.json()) as { content?: { type: string; name?: string; input?: Record<string, unknown> }[] };
    const input = json.content?.find((c) => c.type === "tool_use" && c.name === TOOL.name)?.input;
    if (!input) return { error: "The AI did not answer in the expected form." };
    return parseReading(input, model, Date.now() - started);
  } catch (e) {
    return { error: controller.signal.aborted ? "The AI took too long to answer." : `The AI could not be reached: ${String((e as Error).message ?? e).slice(0, 160)}` };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The tool's answer, checked: anything outside the agreed lists is refused rather than guessed at. */
export function parseReading(input: Record<string, unknown>, model: string, ms: number): AiReading | { error: string } {
  const category = CATEGORIES.find((c) => c.id === input.category)?.id;
  const priority = PRIORITIES.find((p) => p.id === input.priority)?.id;
  if (!category || !priority) return { error: "The AI chose a category or priority that is not on the list." };
  const dept = ["control", "recruitment", "administration"].includes(String(input.department)) ? (input.department as HubDepartment) : null;
  const confidence = typeof input.confidence === "number" ? Math.max(0, Math.min(1, input.confidence)) : 0;
  return {
    category,
    categoryOther: str(input.category_other, 200),
    priority,
    confidence: Math.round(confidence * 100) / 100,
    uncertain: input.uncertain === true,
    reasons: Array.isArray(input.reasons) ? input.reasons.map((r) => str(r, 160)).filter((r): r is string => !!r).slice(0, 4) : [],
    summary: str(input.summary, 400) ?? "",
    requiredAction: str(input.required_action, 300) ?? "",
    department: dept,
    clientAsWritten: str(input.client_as_written, 120),
    siteAsWritten: str(input.site_as_written, 120),
    officerAsWritten: str(input.officer_as_written, 120),
    deadlineAsWritten: str(input.deadline_as_written, 120),
    model,
    ms,
  };
}
