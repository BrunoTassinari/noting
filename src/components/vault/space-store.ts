"use client";

import { useSyncExternalStore } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import { type Space, spaceOf } from "@/lib/promote";

// Espaço escolhido no explorador: BuJo, Acervo ou Tudo. Filtra a árvore, a
// busca da lateral e o grafo. Fica salvo no navegador.

export type SpaceFilter = Space | "all";
const KEY = "noting-space";
const listeners = new Set<() => void>();
let current: SpaceFilter | null = null;

function read(): SpaceFilter {
  if (current) return current;
  try {
    const v = localStorage.getItem(KEY);
    current = v === "bujo" || v === "acervo" ? v : "all";
  } catch {
    current = "all";
  }
  return current;
}

export function setSpace(s: SpaceFilter) {
  current = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    // ok
  }
  listeners.forEach((l) => l());
}

export function useSpace(): SpaceFilter {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "all",
  );
}

export const inSpace = (space: SpaceFilter, path: string) => space === "all" || spaceOf(path) === space;

export function filterSpace<T extends Pick<NoteMeta, "path">>(space: SpaceFilter, notes: T[]): T[] {
  return space === "all" ? notes : notes.filter((n) => inSpace(space, n.path));
}

export const SPACES: { key: SpaceFilter; label: string }[] = [
  { key: "bujo", label: "BuJo" },
  { key: "acervo", label: "Acervo" },
  { key: "all", label: "Tudo" },
];
