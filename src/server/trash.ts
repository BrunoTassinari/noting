import "server-only";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes, trash } from "@/db/schema";
import { makeExcerpt } from "@/lib/markdown-text";
import { isUuid, type NoteMeta } from "@/lib/note-paths";
import { mentionersOf, rebuildLinks } from "./links";
import { freeTitle, NoteError } from "./notes";

// Lixeira: excluir uma nota move a linha para `trash` (ver deleteNote).

export const TRASH_DAYS = 30;

export type TrashItem = {
  id: string;
  path: string;
  title: string;
  excerpt: string;
  deletedAt: string; // ISO
};

/** Apaga de vez o que está na lixeira há mais de 30 dias. */
export async function purgeOldTrash(userId: string): Promise<number> {
  const rows = await db
    .delete(trash)
    .where(
      and(
        eq(trash.userId, userId),
        lt(trash.deletedAt, sql`now() - make_interval(days => ${TRASH_DAYS})`),
      ),
    )
    .returning({ id: trash.id });
  return rows.length;
}

/** Itens da lixeira, excluídos mais recentemente primeiro. */
export async function listTrash(userId: string): Promise<TrashItem[]> {
  const rows = await db
    .select({
      id: trash.id,
      path: trash.path,
      title: trash.title,
      head: sql<string>`left(${trash.body}, 600)`,
      deletedAt: trash.deletedAt,
    })
    .from(trash)
    .where(eq(trash.userId, userId))
    .orderBy(desc(trash.deletedAt), trash.title);
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    title: r.title,
    excerpt: makeExcerpt(r.head),
    deletedAt: r.deletedAt.toISOString(),
  }));
}

/**
 * Devolve a nota para o vault com o mesmo id. Se a pasta já tem uma nota
 * com o mesmo nome, restaura como "Nome (restaurada)" (ou "... 2", ...).
 */
export async function restoreNote(userId: string, id: string): Promise<NoteMeta> {
  if (!isUuid(id)) throw new NoteError("Item não encontrado na lixeira.");
  return db.transaction(async (tx) => {
    const [item] = await tx
      .delete(trash)
      .where(and(eq(trash.userId, userId), eq(trash.id, id)))
      .returning();
    if (!item) throw new NoteError("Item não encontrado na lixeira.");

    const [clash] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, item.path), eq(notes.title, item.title)));
    const title = clash
      ? await freeTitle(userId, item.path, `${item.title.slice(0, 185)} (restaurada)`, tx)
      : item.title;

    const [row] = await tx
      .insert(notes)
      .values({
        id: item.id,
        userId,
        path: item.path,
        title,
        body: item.body,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .returning({ id: notes.id, path: notes.path, title: notes.title, updatedAt: notes.updatedAt });

    // Links que saem dela e [[links]] de outras notas que a mencionam.
    await rebuildLinks(tx, userId, [...(await mentionersOf(tx, userId, title)), row.id]);
    return { id: row.id, path: row.path, title: row.title, updatedAt: row.updatedAt.toISOString() };
  });
}

export async function deleteForever(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new NoteError("Item não encontrado na lixeira.");
  const rows = await db
    .delete(trash)
    .where(and(eq(trash.userId, userId), eq(trash.id, id)))
    .returning({ id: trash.id });
  if (rows.length === 0) throw new NoteError("Item não encontrado na lixeira.");
}

export async function emptyTrash(userId: string): Promise<number> {
  const rows = await db.delete(trash).where(eq(trash.userId, userId)).returning({ id: trash.id });
  return rows.length;
}
