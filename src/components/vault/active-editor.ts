"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import type { Heading } from "@/lib/outline";
import type { Backlink } from "@/lib/wikilinks";

// Dados do editor de cada nota aberta, para os painéis das laterais
// (Backlinks, Tópicos). Por id: durante a troca de nota podem existir dois
// editores montados; os painéis leem o da nota ativa.

export type EditorInfo = {
  backlinks: Backlink[];
  headings: Heading[];
  cursorLine: number | null;
  goToLine: (line: number) => void;
};

let entries = new Map<string, EditorInfo & { owner: string }>();
const listeners = new Set<() => void>();

function publish(id: string, owner: string, info: EditorInfo | null) {
  const next = new Map(entries);
  if (info) next.set(id, { ...info, owner });
  else if (next.get(id)?.owner === owner) next.delete(id);
  else return;
  entries = next;
  listeners.forEach((l) => l());
}

/** Chamado pelo NoteView: mantém os dados da nota em dia enquanto montado. */
export function usePublishEditor(id: string, info: EditorInfo) {
  const owner = useId();
  const { backlinks, headings, cursorLine, goToLine } = info;
  useEffect(() => {
    publish(id, owner, { backlinks, headings, cursorLine, goToLine });
  }, [id, owner, backlinks, headings, cursorLine, goToLine]);
  useEffect(() => () => publish(id, owner, null), [id, owner]);
}

export function useEditorInfo(id: string | undefined): EditorInfo | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (id ? (entries.get(id) ?? null) : null),
    () => null,
  );
}
