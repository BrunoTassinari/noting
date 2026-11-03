"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { linkMentionsAction, loadUnlinkedMentionsAction } from "@/app/(vault)/link-actions";
import type { UnlinkedMention } from "@/server/mentions";
import { notesChanged, onNotesChanged } from "./note-cache";
import { useVault } from "./vault-context";
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

export function Backlinks({ items, noteId }: { items: Backlink[]; noteId?: string }) {
  return (
    <>
      <LinkedList items={items} />
      {noteId && <UnlinkedMentions key={noteId} noteId={noteId} />}
    </>
  );
}

function LinkedList({ items }: { items: Backlink[] }) {
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

/** Notas que citam o nome desta sem [[link]], com botão para linkar. */
function UnlinkedMentions({ noteId }: { noteId: string }) {
  const { showError } = useVault();
  const [items, setItems] = useState<UnlinkedMention[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    void loadUnlinkedMentionsAction(noteId)
      .catch(() => null)
      .then((r) => setItems(r?.ok ? r.mentions : []));
  }, [noteId]);

  useEffect(() => {
    load();
    return onNotesChanged(load);
  }, [load]);

  const link = async (m: UnlinkedMention) => {
    setBusy(m.id);
    const r = await linkMentionsAction(m.id, noteId).catch(() => null);
    setBusy(null);
    if (!r?.ok) {
      showError(r?.error ?? "Não foi possível linkar.");
      return;
    }
    setItems((cur) => cur?.filter((x) => x.id !== m.id) ?? null);
    notesChanged([m.id, noteId]);
  };

  if (!items || items.length === 0) return null;
  return (
    <section aria-labelledby="mentions-title" className="mt-5">
      <h2 id="mentions-title" className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
        Menções sem link · {items.length}
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((m) => (
          <li key={m.id} className="rounded-lg border border-border px-3 py-2.5">
            <div className="flex items-start gap-2">
              <NoteLink id={m.id} className="min-w-0 flex-1 hover:underline">
                <div className="truncate text-[13px] font-medium text-text">{m.title}</div>
                {m.path && <div className="truncate text-[11px] text-muted">{displayFolder(m.path)}</div>}
              </NoteLink>
              <button
                type="button"
                disabled={busy === m.id}
                onClick={() => void link(m)}
                title={m.count > 1 ? `Transformar as ${m.count} menções em links` : "Transformar a menção em link"}
                className="h-8 shrink-0 rounded-md bg-card px-2.5 text-xs font-medium text-text hover:bg-active disabled:opacity-50"
              >
                {busy === m.id ? "…" : m.count > 1 ? `Linkar (${m.count})` : "Linkar"}
              </button>
            </div>
            <div className="mt-1 line-clamp-3 text-xs leading-normal text-muted">
              {m.snippet.slice(0, m.hit[0])}
              <mark className="rounded-sm bg-accent/20 px-0.5 text-text">{m.snippet.slice(m.hit[0], m.hit[1])}</mark>
              {m.snippet.slice(m.hit[1])}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
