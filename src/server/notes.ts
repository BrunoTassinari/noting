import "server-only";
import { and, asc, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import {
  DEFAULT_TITLE,
  isUuid,
  type NoteMeta,
  validateFolder,
  validateTitle,
} from "@/lib/note-paths";

// Camada de acesso a dados das notas. TODA consulta filtra por userId:
// é isso que substitui o RLS do Supabase.

export class NoteError extends Error {}

export type NoteFull = NoteMeta & { body: string };

const metaColumns = {
  id: notes.id,
  path: notes.path,
  title: notes.title,
  updatedAt: notes.updatedAt,
};

const toMeta = (r: { id: string; path: string; title: string; updatedAt: Date }): NoteMeta => ({
  id: r.id,
  path: r.path,
  title: r.title,
  updatedAt: r.updatedAt.toISOString(),
});

type PgError = { code?: string; constraint?: string; cause?: unknown };

/** Nome da constraint UNIQUE violada (o driver embrulha o erro do pg). */
function uniqueConstraint(err: unknown): string | null {
  for (let e = err as PgError | undefined; e; e = e.cause as PgError | undefined) {
    if (e.code === "23505") return e.constraint ?? "";
  }
  return null;
}

const isUniqueViolation = (err: unknown) => uniqueConstraint(err) !== null;

const DUPLICATE_MESSAGE = "Já existe uma nota com esse nome nesta pasta.";

function unwrap<T>(r: { value: T } | { error: string }): T {
  if ("error" in r) throw new NoteError(r.error);
  return r.value;
}

export async function listNotes(userId: string): Promise<NoteMeta[]> {
  const rows = await db
    .select(metaColumns)
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(asc(notes.path), asc(notes.title));
  return rows.map(toMeta);
}

export async function getNote(userId: string, id: string): Promise<NoteFull | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ ...metaColumns, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)));
  return row ? { ...toMeta(row), body: row.body } : null;
}

/** Primeiro título livre na pasta: "Sem título", "Sem título 2", ... */
async function freeTitle(userId: string, path: string, base: string): Promise<string> {
  const escaped = base.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await db
    .select({ title: notes.title })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.path, path),
        or(eq(notes.title, base), like(notes.title, `${escaped} %`)),
      ),
    );
  const taken = new Set(rows.map((r) => r.title));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Cria a nota. O cliente pode mandar id e título já calculados (criação
 * otimista): aí é um único INSERT. Se o título colidir, usa o próximo livre.
 */
export async function createNote(
  userId: string,
  input: { id?: string; path?: string; title?: string },
): Promise<NoteMeta> {
  if (input.id !== undefined && !isUuid(input.id)) throw new NoteError("Id inválido.");
  const path = unwrap(validateFolder(input.path ?? ""));
  const base = input.title ? unwrap(validateTitle(input.title)) : DEFAULT_TITLE;

  let title = base;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [row] = await db
        .insert(notes)
        .values({ id: input.id, userId, path, title })
        .returning(metaColumns);
      return toMeta(row);
    } catch (err) {
      if (uniqueConstraint(err) !== "notes_unique_title_per_folder") throw err;
      // Outro dispositivo criou o mesmo nome: pega o próximo livre.
      title = await freeTitle(userId, path, base);
    }
  }
  throw new NoteError(DUPLICATE_MESSAGE);
}

async function updateOwned(
  userId: string,
  id: string,
  values: Partial<{ path: string; title: string; body: string }>,
): Promise<NoteMeta> {
  if (!isUuid(id)) throw new NoteError("Nota não encontrada.");
  try {
    const [row] = await db
      .update(notes)
      .set(values)
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning(metaColumns);
    if (!row) throw new NoteError("Nota não encontrada.");
    return toMeta(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new NoteError(DUPLICATE_MESSAGE);
    throw err;
  }
}

export function updateNoteBody(userId: string, id: string, body: string) {
  return updateOwned(userId, id, { body });
}

export function renameNote(userId: string, id: string, title: string) {
  return updateOwned(userId, id, { title: unwrap(validateTitle(title)) });
}

export function moveNote(userId: string, id: string, path: string) {
  return updateOwned(userId, id, { path: unwrap(validateFolder(path)) });
}

export async function deleteNote(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new NoteError("Nota não encontrada.");
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, id)))
    .returning({ id: notes.id });
  if (deleted.length === 0) throw new NoteError("Nota não encontrada.");
}
