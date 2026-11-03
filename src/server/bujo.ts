import "server-only";
import { and, eq, sql } from "drizzle-orm";
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
  // Uma ida ao banco: insere se faltar, senão devolve a existente (o SELECT
  // não enxerga a linha inserida pelo mesmo comando, então só um dos dois vem).
  // Com `id` (o cliente já mostra a nota nova) é quase certo que vai criar:
  // procura quem menciona o nome ao mesmo tempo, em vez de depois.
  const early = id ? mentionersOf(db, userId, ref.title) : null;
  early?.catch(() => {}); // se a nota já existia, ninguém espera por ela
  const found = await db.execute<{ id: string; body: string; created: boolean }>(sql`
    with ins as (
      insert into notes (id, user_id, path, title, body)
      values (${id ?? sql`gen_random_uuid()`}, ${userId}, ${ref.path}, ${ref.title}, ${template})
      on conflict do nothing
      returning id, body
    )
    select id, body, true as created from ins
    union all
    select id, body, false from notes
    where user_id = ${userId} and path = ${ref.path} and title = ${ref.title}
  `);
  let row = found.rows[0];
  if (!row) {
    // Outro aparelho criou a mesma nota no mesmo instante (fora da foto do SELECT).
    [row] = await db
      .select({ id: notes.id, body: notes.body, created: sql<boolean>`false` })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, ref.path), eq(notes.title, ref.title)));
  }
  if (row.created) {
    // Links do modelo e quem já apontava para este nome.
    const mentioners = await (early ?? mentionersOf(db, userId, ref.title));
    await rebuildLinks(db, userId, [row.id, ...mentioners], [{ id: row.id, path: ref.path, body: row.body }]);
  }
  return { id: row.id, body: row.body, created: row.created };
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
