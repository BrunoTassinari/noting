"use server";

import { refresh } from "next/cache";
import { type Day, parseDay } from "@/lib/bujo";
import { isDestination, type Destination } from "@/lib/migrate";
import { isUuid } from "@/lib/note-paths";
import { requireUser } from "@/lib/session";
import {
  type Backlog,
  cleanBacklog,
  type DestinationNote,
  getBacklog,
  listMigration,
  migrateTasks,
  type MigrationItem,
  type MigrationSource,
  pullFromBacklog,
  writeToDestination,
} from "@/server/migrate";
import { NoteError } from "@/server/notes";

// Ações da migração do Bullet Journal. "Hoje" vem do relógio do navegador
// (o servidor pode estar em outro fuso): o cliente manda "2026-11-02".

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_ITEMS = 500;
const MAX_LINE = 10_000;

function dayOf(iso: unknown): Day {
  const d = typeof iso === "string" ? parseDay(iso) : null;
  if (!d) throw new NoteError("Data inválida.");
  return d;
}

function destOf(dest: unknown): Destination {
  if (!isDestination(dest)) throw new NoteError("Destino inválido.");
  return dest;
}

const isLine = (s: unknown): s is string => typeof s === "string" && s.length <= MAX_LINE && !s.includes("\n");

function itemsOf<T>(items: unknown, check: (x: Record<string, unknown>) => boolean): T[] {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new NoteError("Lista inválida.");
  for (const x of items) {
    if (typeof x !== "object" || x === null || !check(x as Record<string, unknown>)) {
      throw new NoteError("Lista inválida.");
    }
  }
  return items as T[];
}

const validLineRef = (x: Record<string, unknown>) =>
  Number.isInteger(x.line) && (x.line as number) >= 0 && isLine(x.raw);

/**
 * Recarrega o layout (lista de notas) só quando uma nota foi criada
 * (`created`): alterar o conteúdo não muda a árvore, e o cliente atualiza a
 * data das notas alteradas localmente (notesChanged).
 */
async function run<T extends object>(fn: (userId: string) => Promise<T>): Promise<Result<T>> {
  const user = await requireUser();
  let value: T;
  try {
    value = await fn(user.id);
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  // Nota criada (destino que não existia): a árvore muda.
  if ("created" in value && value.created) refresh();
  return { ok: true, ...value };
}

/**
 * Editor: grava no destino as linhas que saem da nota aberta. A nota de
 * origem é alterada no editor (o autosave grava), não aqui.
 */
export async function moveToDestinationAction(
  originId: string,
  dest: Destination,
  todayIso: string,
  lines: string[],
): Promise<Result<{ dest: DestinationNote }>> {
  return run(async (userId) => {
    if (!isUuid(originId)) throw new NoteError("Nota não encontrada.");
    if (!Array.isArray(lines) || lines.length > MAX_ITEMS || !lines.every(isLine)) {
      throw new NoteError("Linhas inválidas.");
    }
    const note = await writeToDestination(userId, originId, destOf(dest), dayOf(todayIso), lines);
    return { dest: note, created: note.created };
  });
}

export async function loadMigrationAction(todayIso: string): Promise<Result<{ sources: MigrationSource[] }>> {
  return run(async (userId) => ({ sources: await listMigration(userId, dayOf(todayIso)) }));
}

const ACTIONS = new Set(["today", "tomorrow", "month", "nextMonth", "backlog", "done", "cancel"]);

/** Migra/conclui/cancela tarefas da tela de migração; devolve a lista nova. */
export async function migrateTasksAction(
  todayIso: string,
  items: MigrationItem[],
): Promise<Result<{ changed: string[]; sources: MigrationSource[] }>> {
  return run(async (userId) => {
    const today = dayOf(todayIso);
    const valid = itemsOf<MigrationItem>(
      items,
      (x) => isUuid(String(x.noteId)) && validLineRef(x) && ACTIONS.has(String(x.action)),
    );
    // A lista nova é lida junto com a migração (ver listMigration).
    const migration = migrateTasks(userId, today, valid);
    const sources = await listMigration(userId, today, migration.then((m) => m.bodies));
    const { changed, created } = await migration;
    return { changed, created, sources };
  });
}

export async function loadBacklogAction(): Promise<Result<{ backlog: Backlog }>> {
  return run(async (userId) => ({ backlog: await getBacklog(userId) }));
}

export async function pullFromBacklogAction(
  todayIso: string,
  items: { line: number; raw: string }[],
  dest: Destination,
): Promise<Result<{ changed: string[]; backlog: Backlog }>> {
  return run(async (userId) => {
    const d = destOf(dest);
    if (d === "backlog") throw new NoteError("Destino inválido.");
    const valid = itemsOf<{ line: number; raw: string }>(items, validLineRef);
    const { changed, created, backlog } = await pullFromBacklog(userId, dayOf(todayIso), valid, d);
    return { changed, created, backlog };
  });
}

export async function cleanBacklogAction(): Promise<Result<{ removed: number; noteId: string | null; backlog: Backlog }>> {
  return run(async (userId) => {
    return cleanBacklog(userId);
  });
}
