import { Fragment } from "react";
import { displayFolder } from "@/lib/note-paths";
import { type Backlink, WIKILINK_RE } from "@/lib/wikilinks";
import { NoteLink } from "./note-link";

/** Trecho com os [[links]] destacados (mostra o apelido quando houver). */
function Snippet({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(WIKILINK_RE)) {
    parts.push(text.slice(last, m.index));
    parts.push(
      <span key={m.index} className="text-accent">
        {m[2] ?? m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}

export function Backlinks({ items }: { items: Backlink[] }) {
  return (
    <section aria-labelledby="backlinks-title">
      <h2
        id="backlinks-title"
        className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted"
      >
        Backlinks · {items.length}
      </h2>
      {items.length === 0 ? (
        <p className="text-xs leading-normal text-muted">
          Nenhuma nota aponta para esta. Use [[{"Nome da nota"}]] em outra nota para ligar.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((b) => (
            <li key={b.id}>
              <NoteLink
                id={b.id}
                className="block rounded-lg bg-card px-3 py-2.5 hover:bg-active"
              >
                <div className="truncate text-[13px] font-medium text-text">{b.title}</div>
                {b.path && <div className="truncate text-[11px] text-muted">{displayFolder(b.path)}</div>}
                {b.snippet && (
                  <div className="mt-0.5 line-clamp-3 text-xs leading-normal text-muted">
                    <Snippet text={b.snippet} />
                  </div>
                )}
              </NoteLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
