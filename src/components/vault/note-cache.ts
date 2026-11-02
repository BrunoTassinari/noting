"use client";

import type { NoteMeta } from "@/lib/note-paths";
import type { Backlink } from "@/lib/wikilinks";

// Notas já carregadas nesta sessão (conteúdo + backlinks), para abrir na hora
// do clique. O servidor confirma logo depois; isto só adianta a tela.

export type CachedNote = NoteMeta & { body: string; backlinks: Backlink[] };

const FRESH_MS = 30_000; // não busca de novo se foi carregada há menos que isso
const cache = new Map<string, { note: CachedNote; at: number }>();
const inflight = new Map<string, Promise<void>>();

export function getCachedNote(id: string): CachedNote | null {
  return cache.get(id)?.note ?? null;
}

export function putCachedNote(note: CachedNote) {
  cache.set(note.id, { note, at: Date.now() });
}

/** Conteúdo salvo pelo autosave: mantém o cache igual ao que está no banco. */
export function updateCachedBody(id: string, body: string) {
  const entry = cache.get(id);
  if (entry) cache.set(id, { note: { ...entry.note, body, updatedAt: new Date().toISOString() }, at: Date.now() });
}

export function forgetCachedNote(id: string) {
  cache.delete(id);
}

/** Busca a nota em segundo plano (intenção de abrir: mouse em cima, toque). */
export function prefetchNote(id: string): Promise<void> {
  const entry = cache.get(id);
  if (entry && Date.now() - entry.at < FRESH_MS) return Promise.resolve();
  const running = inflight.get(id);
  if (running) return running;
  const p = fetch(`/api/notes/${id}`, { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { note: CachedNote };
      putCachedNote(data.note);
    })
    .catch(() => {})
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
