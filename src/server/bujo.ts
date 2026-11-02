import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { FUTURE_LOG, migrateFutureLog, withMonthTasks, type Day, type NoteRef } from "@/lib/bujo";
import { sha256Hex } from "@/lib/hash";
import { mentionersOf, rebuildLinks } from "./links";
import { updateNoteBody } from "./notes";

/**
 * Nota pelo caminho (pasta + título); cria com `template` se não existir.
 * Seguro contra corrida: dois aparelhos criando a mesma nota ao mesmo tempo
 * ficam com a mesma (UNIQUE user_id, path, title).
 * `id`: id escolhido pelo cliente (criação otimista); ignorado se a nota já existe.
 */
export async function getOrCreateNote(
  userId: string,
  ref: NoteRef,
  template: string,
  id?: string,
): Promise<{ id: string; body: string; created: boolean }> {
  const inserted = await db
    .insert(notes)
    .values({ id, userId, path: ref.path, title: ref.title, body: template })
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

/**
 * Nota do mês recém-criada: traz as tarefas da seção do mês no Future Log
 * para "## Tarefas" e marca as abertas como migradas ([>]) lá.
 * Nada acontece se o Future Log não existe ou a seção está vazia.
 */
export async function pullFutureLogIntoMonth(
  userId: string,
  month: { id: string; body: string },
  d: Day,
): Promise<void> {
  // Duas tentativas: o Future Log pode mudar em outro aparelho no meio.
  for (let attempt = 0; attempt < 2; attempt++) {
    const [log] = await db
      .select({ id: notes.id, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, FUTURE_LOG.path), eq(notes.title, FUTURE_LOG.title)));
    if (!log) return;
    const migrated = migrateFutureLog(log.body, d);
    if (!migrated) return;
    if (migrated.futureLog !== log.body) {
      const baseHash = (await sha256Hex(log.body)) ?? undefined;
      const res = await updateNoteBody(userId, log.id, migrated.futureLog, { relink: false, baseHash });
      if (!res.ok) continue; // mudou no meio: lê de novo
    }
    await updateNoteBody(userId, month.id, withMonthTasks(month.body, migrated.items));
    return;
  }
}
