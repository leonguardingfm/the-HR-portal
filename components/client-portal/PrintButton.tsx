"use client";

/** Print, or save as PDF from the print dialogue. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-9 items-center rounded-md border px-3 text-[12px] font-semibold" style={{ borderColor: "var(--hairline)" }}>
      ⎙ Print or save as PDF
    </button>
  );
}
