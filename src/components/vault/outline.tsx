import { activeHeadingIndex, type Heading } from "@/lib/outline";

export function Outline({
  headings,
  cursorLine,
  onSelect,
}: {
  headings: Heading[];
  cursorLine: number | null;
  onSelect: (line: number) => void;
}) {
  const active = activeHeadingIndex(headings, cursorLine);
  const minLevel = Math.min(...headings.map((h) => h.level));

  return (
    <section aria-labelledby="outline-title">
      <h2 id="outline-title" className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
        Tópicos
      </h2>
      {headings.length === 0 ? (
        <p className="text-xs leading-normal text-muted">
          Sem títulos. Comece uma linha com # para criar um tópico.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-[13px]">
          {headings.map((h, i) => (
            <li key={`${h.line}-${h.text}`}>
              <button
                type="button"
                onClick={() => onSelect(h.line)}
                aria-current={i === active ? "location" : undefined}
                style={{ paddingLeft: 8 + (h.level - minLevel) * 12 }}
                className={`flex min-h-7 w-full items-center rounded-md py-1 pr-2 text-left leading-snug ${
                  i === active ? "bg-active text-text-strong" : "text-text-soft hover:bg-card"
                }`}
              >
                <span className="line-clamp-2">{h.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
