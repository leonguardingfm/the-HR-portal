import { Card } from "@/components/ui/Card";
import { ModuleOutline } from "@/components/ui/ModuleOutline";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tag } from "@/components/ui/StatusPill";
import { FORM_DEFINITIONS, KPI_FIELDS } from "@/lib/core/forms";

/**
 * Forms and packs.
 *
 * Application forms, welcome packs, document collection, uniform measurements,
 * site inspections, client feedback and welfare checks are one engine. The
 * business names them as seven things; they are seven definitions of the same
 * thing, and building them separately is how a platform ends up with four form
 * renderers that each handle dates differently.
 *
 * The definitions below are real — they drive the seed and will drive the
 * renderer. What is not built yet is the renderer itself, which is why this
 * page shows the shape and says so.
 */
export default function FormsPage() {
  const byDepartment = FORM_DEFINITIONS.reduce<Record<string, typeof FORM_DEFINITIONS>>(
    (acc, f) => {
      (acc[f.department] ??= []).push(f);
      return acc;
    },
    {},
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Forms & packs"
        description="One forms engine, used for everything the business calls a form: application forms, welcome packs, document collection, measurements, inspections and feedback. Each is a definition with a version, not a separate module."
      />

      <Card
        title={`${FORM_DEFINITIONS.length} definitions`}
        subtitle="A version number on each, so a response always says which version of the questions it answered. Changing a form does not rewrite what people have already told us."
      >
        <div className="space-y-4">
          {Object.entries(byDepartment).map(([department, forms]) => (
            <div key={department}>
              <p
                className="pb-1.5 text-[10px] font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                {department.replace(/_/g, " ")}
              </p>
              <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
                {forms.map((f) => (
                  <li key={f.id} className="py-2.5">
                    <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                      {f.title}
                      <Tag>v{f.version}</Tag>
                      <Tag>{f.fields.length} fields</Tag>
                      <Tag>filled by {f.filledBy}</Tag>
                    </p>
                    <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {f.purpose}
                    </p>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Triggered by: {f.trigger}
                      {f.raisesTasks ? ` · raises: ${f.raisesTasks}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Fields that feed a KPI directly"
        subtitle="A typed field, not a comment box. This is what makes a number trend without anyone re-keying it into a spreadsheet — and the reason the question is asked as a scale rather than as prose."
      >
        <ul className="divide-y" style={{ borderColor: "var(--hairline)" }}>
          {KPI_FIELDS.map((k) => (
            <li key={`${k.form}-${k.field}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="text-[12px]">
                <span style={{ color: "var(--text-muted)" }}>{k.form} · </span>
                {k.field}
              </span>
              <Tag>{k.kpi}</Tag>
            </li>
          ))}
        </ul>
      </Card>

      <ModuleOutline
        note="The one decision that matters here: a form response is stored as typed answers against a versioned definition, never as a document. A scanned PDF of a completed form cannot be counted, chased or reported on, which is the whole reason the paper process is being replaced."
        items={[
          {
            label: "The renderer",
            detail: "One component that draws any definition, with the field kinds the definitions already declare. Built once; every form above gets it.",
            release: "R2",
          },
          {
            label: "Signatures and the welcome pack",
            detail: "A pack is a form that needs signing, plus the chaser ladder that follows it up. Both engines exist — this is the join.",
            release: "R2",
          },
          {
            label: "Document collection against the form",
            detail: "Where a question demands evidence, the upload attaches to the person and inherits its retention rule from the document type. Not a second store.",
            release: "R2",
          },
          {
            label: "Client-facing feedback forms",
            detail: "Sent to a client contact by link, answered without a sign-in, scored on a typed scale so satisfaction trends.",
            release: "R4",
          },
        ]}
      />
    </div>
  );
}
