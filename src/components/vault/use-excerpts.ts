"use client";

import { useEffect, useSyncExternalStore } from "react";

// Resumos (começo do texto) das notas, para a lista "Recentes" do celular.
// Não vêm no layout: ele é refeito depois de várias ações e levaria o resumo
// de todas as notas junto, mesmo no computador, onde não aparecem. Aqui são
// buscados uma vez (e de novo depois de um tempo) só quando a lista aparece.

const STALE_MS = 60_000;
let excerpts: Record<string, string> = {};
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (loading || Date.now() - loadedAt < STALE_MS) return;
  loading = fetch("/api/notes/excerpts", { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) return;
      excerpts = ((await res.json()) as { excerpts: Record<string, string> }).excerpts;
      loadedAt = Date.now();
      listeners.forEach((l) => l());
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
}

const EMPTY: Record<string, string> = {};

/** Resumos por id (vazio até carregar). `enabled`: a lista está visível. */
export function useExcerpts(enabled: boolean): Record<string, string> {
  useEffect(() => {
    if (enabled) load();
  }, [enabled]);
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => excerpts,
    () => EMPTY,
  );
}

/** Só no celular (a lista "Recentes" fica escondida no computador). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}
