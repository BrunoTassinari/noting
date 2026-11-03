"use client";

import { useSyncExternalStore } from "react";

// Pastas abertas na barra lateral, lembradas no navegador (conveniência local).

const KEY = "noting:expanded-folders";
const listeners = new Set<() => void>();
let cache: Set<string> | null = null;
const EMPTY = new Set<string>();

function read(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function write(next: Set<string>) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    // Sem storage (aba privada etc.): vale só nesta sessão.
  }
  listeners.forEach((l) => l());
}

export function useExpandedFolders(): Set<string> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => EMPTY,
  );
}

export function toggleFolder(path: string) {
  const next = new Set(read());
  if (next.has(path)) next.delete(path);
  else next.add(path);
  write(next);
}

export function expandFolders(paths: string[]) {
  const current = read();
  if (paths.every((p) => current.has(p))) return;
  write(new Set([...current, ...paths]));
}

export function collapseAllFolders() {
  if (read().size > 0) write(new Set());
}
