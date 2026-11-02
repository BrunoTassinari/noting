"use client";

import { useSyncExternalStore } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import type { Backlink } from "@/lib/wikilinks";

// Nota mostrada antes de a página do servidor chegar:
//   create   → nota nova, aparece na hora do clique enquanto o servidor grava;
//   open     → nota já carregada nesta sessão, abre na hora do clique;
//   skeleton → nota ainda não carregada: mostra o título e um esqueleto.
// Quando a página real chega, ela "adota" a nota (mesmo id) e o editor
// continua montado, sem perder o que já foi digitado.

export type OptimisticMode = "create" | "open" | "skeleton";

export type OptimisticNote = NoteMeta & {
  body: string;
  backlinks: Backlink[];
  mode: OptimisticMode;
  /** create: o servidor ainda não confirmou a gravação. */
  pending: boolean;
  /** open/skeleton: a navegação para /n/<id> ainda não terminou. */
  opening: boolean;
  /** Muda quando o conteúdo do servidor substitui o mostrado (remonta o editor). */
  version: number;
};

let current: OptimisticNote | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (e: Error) => void };
const creations = new Map<string, Deferred>();

/** Notas em que o usuário digitou desde que abriram (não sobrescrever). */
const edited = new Set<string>();

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

export function markEdited(id: string) {
  edited.add(id);
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
  edited.delete(note.id);
  current = { ...note, body: "", backlinks: [], mode: "create", pending: true, opening: false, version: 0 };
  emit();
}

/** Abre uma nota existente antes do servidor responder. */
export function startOpeningNote(meta: NoteMeta, cached: (NoteMeta & { body: string; backlinks: Backlink[] }) | null) {
  edited.delete(meta.id);
  current = cached
    ? { ...meta, body: cached.body, backlinks: cached.backlinks, mode: "open", pending: false, opening: true, version: 0 }
    : { ...meta, body: "", backlinks: [], mode: "skeleton", pending: false, opening: true, version: 0 };
  emit();
}

/** A página real chegou com os dados do servidor. */
export function adoptOptimisticNote(note: NoteMeta & { body: string; backlinks: Backlink[] }) {
  if (current?.id !== note.id) return;
  creations.get(note.id)?.resolve();
  creations.delete(note.id);

  if (current.mode === "skeleton") {
    // A própria página mostra a nota; o esqueleto sai.
    current = null;
    emit();
    return;
  }

  // Conteúdo mudou no servidor (ex.: editado em outro aparelho) e nada foi
  // digitado aqui: mostra o do servidor.
  const replace = note.body !== current.body && !edited.has(note.id);
  const next: OptimisticNote = {
    ...current,
    ...note,
    body: replace ? note.body : current.body,
    pending: false,
    opening: false,
    version: replace ? current.version + 1 : current.version,
  };
  const same =
    !current.pending &&
    !current.opening &&
    !replace &&
    current.title === note.title &&
    current.path === note.path &&
    current.updatedAt === note.updatedAt &&
    current.backlinks === note.backlinks;
  if (same) return;
  current = next;
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

/** Saiu da nota: daqui em diante ela vem do servidor normalmente. */
export function clearOptimisticNote() {
  if (!current || current.pending || current.opening) return;
  current = null;
  emit();
}

/** Espera a nota existir no banco (resolve na hora se não há criação pendente). */
export function whenCreated(id: string): Promise<void> {
  return creations.get(id)?.promise ?? Promise.resolve();
}
