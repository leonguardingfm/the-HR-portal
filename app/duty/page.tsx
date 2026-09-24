import { redirect } from "next/navigation";

/** The duty checks start at the first of them. */
export default function DutyPage() {
  redirect("/duty/chase-ups");
}
