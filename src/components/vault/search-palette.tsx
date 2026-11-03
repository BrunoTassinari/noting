"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NoteIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { findTerms, fold, searchTerms } from "@/lib/fold";
import { displayFolder, type NoteMeta } from "@/lib/note-paths";
import type { SearchResult } from "@/server/search";
import { prefetchNote } from "./note-cache";
import { useVault } from "./vault-context";

type Item =
  | { kind: "note"; id: string; title: string; path: string; snippet: string; titleMatches: [number, number][]; snippetMatches: [number, number][] }
  | { kind: "create"; title: string };

const RECENT_COUNT = 8;
const DEBOUNCE_MS = 150;

export function Highlight({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{text}</>;
  const out: React.ReactNode[] = [];
  let last = 0;
  ranges.forEach(([a, b], i) => {
    out.push(text.slice(last, a));
    out.push(
      <mark key={i} className="bg-transparent font-semibold text-accent">
        {text.slice(a, b)}
      </mark>,
    );
    last = b;
  });
  out.push(text.slice(last));
  return <>{out}</>;
}

/** Busca rápida por título e conteúdo. Abre com Ctrl/Cmd+K. */
export function SearchPalette({
  open,
  onClose,
  notes,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  notes: NoteMeta[];
  onCreate: (title: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Buscar notas"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-panel p-0 text-text backdrop:bg-black/60 md:mx-auto md:mt-[12vh] md:h-fit md:max-h-[70vh] md:w-[calc(100%-32px)] md:max-w-xl md:rounded-xl md:border md:border-border"
    >
      {open && <Palette notes={notes} onClose={onClose} onCreate={onCreate} />}
    </dialog>
  );
}

function Palette({
  notes,
  onClose,
  onCreate,
}: {
  notes: NoteMeta[];
  onClose: () => void;
  onCreate: (title: string) => void;
}) {
  const { goToNote } = useVault();
  const [query, setQuery] = useState("");
  const [server, setServer] = useState<{ q: string; results: SearchResult[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const trimmed = query.trim();

  // Busca no servidor (conteúdo) com debounce; cancela a anterior.
  useEffect(() => {
    if (!trimmed) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: SearchResult[] };
        setServer({ q: trimmed, results: data.results });
        setFailed(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  const items: Item[] = useMemo(() => {
    if (!trimmed) {
      return [...notes]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, RECENT_COUNT)
        .map((n) => ({ kind: "note", id: n.id, title: n.title, path: n.path, snippet: "", titleMatches: [], snippetMatches: [] }));
    }
    let list: Item[];
    if (server?.q === trimmed) {
      list = server.results.map((r) => ({ kind: "note", ...r }));
    } else {
      // Enquanto o servidor responde: filtra pelos nomes que já temos.
      list = notes
        .map((n) => ({ n, m: findTerms(n.title, terms) }))
        .filter(({ n, m }) => terms.every((t) => findTerms(n.title, [t]).length > 0) && m.length > 0)
        .slice(0, 30)
        .map(({ n, m }) => ({ kind: "note", id: n.id, title: n.title, path: n.path, snippet: "", titleMatches: m, snippetMatches: [] }));
    }
    // Já existe uma nota com esse nome (ignorando maiúsculas e acentos)?
    const exact = notes.some((n) => fold(n.title) === fold(trimmed));
    if (!exact && !trimmed.includes("/")) list.push({ kind: "create", title: trimmed });
    return list;
  }, [trimmed, server, notes, terms]);

  const current = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current]);

  // Adianta a nota selecionada (setas/mouse) para abrir na hora no Enter.
  const currentId = items[current]?.kind === "note" ? (items[current] as { id: string }).id : null;
  useEffect(() => {
    if (!currentId) return;
    const t = setTimeout(() => void prefetchNote(currentId), 120);
    return () => clearTimeout(t);
  }, [currentId]);

  /** newTab: Ctrl/Cmd+Enter ou Ctrl/Cmd+clique abre numa aba nova do app. */
  const choose = (item: Item | undefined, newTab = false) => {
    if (!item) return;
    onClose();
    if (item.kind === "note") goToNote(item.id, newTab);
    else onCreate(item.title);
  };

  const loading = Boolean(trimmed) && server?.q !== trimmed && !failed;

  return (
    <div className="flex h-full flex-col md:h-auto md:max-h-[calc(70vh-2px)]">
      <div className="flex items-center gap-3 border-b border-border px-4 pt-[env(safe-area-inset-top)] md:pt-0">
        <SearchIcon size={18} className="shrink-0 text-muted" />
        <input
          autoFocus
          aria-label="Buscar por título ou conteúdo"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={items.length ? `search-item-${current}` : undefined}
          placeholder="Buscar por título ou conteúdo"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(items[current], e.ctrlKey || e.metaKey);
            }
          }}
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={onClose}
          className="h-11 shrink-0 px-1 text-sm text-muted hover:text-text md:hidden"
        >
          Cancelar
        </button>
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 font-mono text-[11px] text-muted md:block">
          Esc
        </kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {!trimmed && items.length > 0 && (
          <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
            Recentes
          </div>
        )}
        {failed && <p className="px-2 py-2 text-[13px] text-danger">Não foi possível buscar no conteúdo.</p>}
        <ul id="search-results" ref={listRef} role="listbox" aria-label="Resultados" className="flex flex-col gap-0.5">
          {items.map((item, i) => (
            <li
              key={item.kind === "note" ? item.id : "create"}
              id={`search-item-${i}`}
              data-index={i}
              role="option"
              aria-selected={i === current}
              onMouseMove={() => setActive(i)}
              onClick={(e) => choose(item, e.ctrlKey || e.metaKey || e.shiftKey)}
              onAuxClick={(e) => e.button === 1 && choose(item, true)}
              className={`cursor-pointer rounded-lg px-3 py-2 ${i === current ? "bg-active" : ""}`}
            >
              {item.kind === "note" ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <NoteIcon size={14} className="shrink-0 self-center text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[15px] text-text-strong md:text-sm">
                      <Highlight text={item.title} ranges={item.titleMatches} />
                    </span>
                    {item.path && (
                      <span className="max-w-[40%] shrink-0 truncate text-xs text-muted">
                        {displayFolder(item.path)}
                      </span>
                    )}
                  </div>
                  {item.snippet && (
                    <div className="mt-0.5 line-clamp-2 pl-[22px] text-[13px] leading-snug text-muted">
                      <Highlight text={item.snippet} ranges={item.snippetMatches} />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2 text-[15px] text-text md:text-sm">
                  <PlusIcon size={14} className="shrink-0 text-accent" />
                  Criar nota <span className="font-medium text-text-strong">“{item.title}”</span>
                </div>
              )}
            </li>
          ))}
        </ul>
        {trimmed && !loading && items.every((i) => i.kind === "create") && (
          <p className="px-3 py-3 text-[13px] text-muted">Nenhuma nota encontrada.</p>
        )}
        {!trimmed && items.length === 0 && (
          <p className="px-3 py-3 text-[13px] text-muted">Seu vault está vazio.</p>
        )}
      </div>
    </div>
  );
}
