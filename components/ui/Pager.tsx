import Link from "next/link";

/**
 * Nothing disappears without saying so (26 September 2026). A list that holds
 * more than one page shows which part you are looking at and how to get to
 * the rest; a list capped for speed says it is capped.
 */
export function Pager({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  if (total <= pageSize) return null;
  const pages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "rounded-md border px-2.5 py-1 text-[12px]";
  return (
    <nav aria-label="Pages" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
      <span>
        Showing {from}–{to} of {total}
      </span>
      <span className="flex items-center gap-1.5">
        {page > 1 ? (
          <Link href={href(page - 1)} className={link} style={{ borderColor: "var(--hairline)" }}>
            ← Previous
          </Link>
        ) : null}
        <span>
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link href={href(page + 1)} className={link} style={{ borderColor: "var(--hairline)" }}>
            Next →
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

/** For a list capped for speed: says how many are not shown, and how to find them. */
export function CappedNotice({ shown, total, hint }: { shown: number; total: number; hint: string }) {
  if (total <= shown) return null;
  return (
    <p role="status" className="mt-3 rounded-md px-3 py-2 text-[12px]" style={{ background: "var(--wash-warning)" }}>
      Showing {shown} of {total}. {hint}
    </p>
  );
}

export const pageFrom = (v: string | undefined) => Math.max(1, Math.floor(Number(v) || 1));
