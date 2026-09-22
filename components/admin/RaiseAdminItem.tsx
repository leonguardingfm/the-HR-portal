"use client";

import { useState } from "react";
import { ActionForm, type Field } from "./ActionForm";
import { raiseAdminItem } from "@/lib/actions/admin";
import { ADMIN_CATEGORIES, PRIORITIES, PRIORITY_ORDER } from "@/lib/core/admin";

/**
 * Raising a task or a request.
 *
 * One form, two shapes. Picking "request" reveals what it is asking for and
 * the amount, because those are what build the approval chain; a task has
 * neither and asking for them would be asking people to fill in fields that do
 * not apply, which is how forms get abandoned halfway.
 */
export function RaiseAdminItem({ denied }: { denied: string | null }) {
  const [track, setTrack] = useState<"task" | "request">("task");

  const fields: Field[] = [
    { name: "track", kind: "hidden", label: "", value: track },
    {
      name: "category",
      label: "Category",
      kind: "select",
      required: true,
      options: ADMIN_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
    },
    { name: "title", label: "What is it", required: true, placeholder: "Something the person picking it up can act on" },
    { name: "detail", label: "Detail", kind: "textarea", placeholder: "Optional" },
    {
      name: "priority",
      label: "Priority",
      kind: "select",
      value: "P3",
      options: PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITIES[p].label })),
    },
    ...(track === "request"
      ? ([
          {
            name: "kind",
            label: "Asking for",
            kind: "select",
            required: true,
            options: [
              { value: "payment", label: "A payment" },
              { value: "purchase", label: "A purchase" },
              { value: "voucher", label: "A voucher" },
              { value: "penalty", label: "A penalty against an employee" },
              { value: "suspension", label: "A suspension" },
              { value: "holiday", label: "Holiday" },
              { value: "authority_response", label: "A response to an external authority" },
              { value: "write_off", label: "A write-off" },
            ],
          },
          { name: "amountPounds", label: "Amount £", kind: "number", placeholder: "Leave blank if none" },
        ] as Field[])
      : []),
  ];

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Track"
        className="inline-flex gap-1 rounded border p-0.5"
        style={{ borderColor: "var(--hairline)" }}
      >
        {(["task", "request"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={track === t}
            onClick={() => setTrack(t)}
            className="rounded px-2.5 py-1 text-[12px]"
            style={{
              background: track === t ? "var(--wash)" : "transparent",
              color: track === t ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: track === t ? 600 : 400,
            }}
          >
            {t === "task" ? "Task — needs doing" : "Request — needs deciding"}
          </button>
        ))}
      </div>

      {/* Keyed on the track so switching resets the fields rather than leaving
          a stale amount behind on a task. */}
      <ActionForm
        key={track}
        action={raiseAdminItem}
        fields={fields}
        submitLabel={track === "task" ? "Raise task" : "Raise request"}
        variant="primary"
        denied={denied}
      />
    </div>
  );
}
