"use client";

import { useSyncExternalStore } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import type { Backlink } from "@/lib/wikilinks";

// Nota criada de forma otimista: aparece na hora do clique, enquanto o
// servidor grava. Quando a página real chega, ela "adota" esta nota (mesmo
// id), e o editor continua montado, sem perder o que já foi digitado.

export type OptimisticNote = NoteMeta & { body: string; pending: boolean; backlinks: Backlink[] };

let current: OptimisticNote | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void };
const creations = new Map<string, Deferred>();

export function useOptimisticNote(): OptimisticNote | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}

export function getOptimisticNote() {
  return current;
}

/** Mostra a nota nova imediatamente e registra a criação em andamento. */
export function startOptimisticNote(note: NoteMeta) {
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // quem espera trata; evita "unhandled rejection"
  creations.set(note.id, { promise, resolve, reject });
  current = { ...note, body: "", pending: true, backlinks: [] };
  emit();
}

/** A página real chegou: a nota existe no banco. */
export function adoptOptimisticNote(note: NoteMeta & { body: string; backlinks: Backlink[] }) {
  if (current?.id !== note.id) return;
  creations.get(note.id)?.resolve();
  creations.delete(note.id);
  const same =
    !current.pending &&
    current.title === note.title &&
    current.path === note.path &&
    current.updatedAt === note.updatedAt &&
    current.backlinks === note.backlinks;
  if (same) return;
  current = { ...note, pending: false };
  emit();
}

export function failOptimisticNote(id: string, error: string) {
  creations.get(id)?.reject(new Error(error));
  creations.delete(id);
  if (current?.id === id) {
    current = null;
    emit();
  }
}

export function clearOptimisticNote() {
  if (!current || current.pending) return;
  current = null;
  emit();
}

/** Espera a nota existir no banco (resolve na hora se não há criação pendente). */
export function whenCreated(id: string): Promise<void> {
  return creations.get(id)?.promise ?? Promise.resolve();
}
