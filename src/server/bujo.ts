import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import type { NoteRef } from "@/lib/bujo";
import { mentionersOf, rebuildLinks } from "./links";

/**
 * Nota pelo caminho (pasta + título); cria com `template` se não existir.
 * Seguro contra corrida: dois aparelhos criando a mesma nota ao mesmo tempo
 * ficam com a mesma (UNIQUE user_id, path, title).
 */
export async function getOrCreateNote(
  userId: string,
  ref: NoteRef,
  template: string,
): Promise<{ id: string; body: string; created: boolean }> {
  const inserted = await db
    .insert(notes)
    .values({ userId, path: ref.path, title: ref.title, body: template })
    .onConflictDoNothing()
    .returning({ id: notes.id, body: notes.body });
  if (inserted[0]) {
    // Links do modelo e quem já apontava para este nome.
    await rebuildLinks(db, userId, [inserted[0].id, ...(await mentionersOf(db, userId, ref.title))]);
    return { ...inserted[0], created: true };
  }
  const [row] = await db
    .select({ id: notes.id, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.path, ref.path), eq(notes.title, ref.title)));
  return { ...row, created: false };
}
