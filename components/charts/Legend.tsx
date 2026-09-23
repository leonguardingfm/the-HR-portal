/**
 * A legend is always present for two or more series — identity never rests on
 * colour alone. A single-series chart gets none; its title names what is plotted.
 */
export function Legend({
  items,
}: {
  items: { label: string; color: string; glyph?: string }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ background: item.color }}
          />
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
