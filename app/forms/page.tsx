import { redirect } from "next/navigation";

/**
 * Forms are no longer a screen of their own (HR, 25 September 2026): the
 * application form goes to the candidate by email from their record, and the
 * welcome pack the same way. Old links land on Candidates.
 */
export default function FormsPage() {
  redirect("/candidates");
}
