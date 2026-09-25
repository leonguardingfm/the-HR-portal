import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TemplateForm } from "@/components/hub/TemplateForms";
import { requireSession } from "@/lib/auth/server";
import { CATEGORIES } from "@/lib/core/hub";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * Reply templates (26 September 2026): the agreed wording for common replies,
 * by category. Written by each department's manager; offered to whoever owns a
 * task when they record a response, with the sender, client and site put in.
 */
export default async function ReplyTemplatesPage() {
  await requireSession();
  const templates = await db.replyTemplate.findMany({ orderBy: [{ active: "desc" }, { title: "asc" }] });
  const groups = CATEGORIES.map((c) => ({ ...c, rows: templates.filter((t) => t.category === c.id) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-5">
      <nav aria-label="Breadcrumb" className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <Link href="/hub" className="underline underline-offset-2">
          Performance hub
        </Link>{" "}
        / Reply templates
      </nav>
      <PageHeader title="Reply templates" description="The agreed wording for common replies. Whoever owns a task can start from one when they record a response; those for the task's category come first." />
      <Card title="Add a template">
        <TemplateForm />
      </Card>
      {groups.length === 0 ? (
        <Card title="No templates yet">
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Add the first with “New template”. A good start: cover found, officer running late, invoice query received.
          </p>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id} title={g.label} subtitle={`${g.rows.length} template${g.rows.length === 1 ? "" : "s"}`}>
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {g.rows.map((t) => (
                  <li key={t.id} style={{ borderColor: "var(--hairline)" }}>
                    <TemplateForm t={{ id: t.id, category: t.category, title: t.title, body: t.body, active: t.active }} />
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
