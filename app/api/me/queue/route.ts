import { getSession } from "@/lib/auth/server";
import { bookMeOn, myCheckCall } from "@/lib/actions/me";

/**
 * Book-ons and check calls made with no signal, kept on the officer's phone
 * and sent here when signal returns (26 September 2026) — by the page, or by
 * the service worker in the background. The same actions as pressing the
 * button, with the same checks; "queued" tells them it was made earlier.
 *
 * 401: signed out — the phone keeps it and tries again after sign-in.
 * 200 { ok: false }: refused for a reason that will not change — the phone
 * stops trying and shows the officer why.
 */
export async function POST(request: Request) {
  if (!(await getSession())) return Response.json({ ok: false, retry: true, message: "Signed out." }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, message: "That could not be read." }, { status: 400 });
  }
  const kind = String(form.get("kind") ?? "");
  const assignmentId = String(form.get("assignmentId") ?? "");
  form.set("queued", "1");
  if (!assignmentId) return Response.json({ ok: false, message: "Which shift is missing." }, { status: 400 });
  const r = kind === "book_on" ? await bookMeOn(assignmentId, null, form) : kind === "check_call" ? await myCheckCall(assignmentId, null, form) : null;
  if (!r) return Response.json({ ok: false, message: "Unknown kind." }, { status: 400 });
  return Response.json(r);
}
