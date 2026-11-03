import "server-only";
import { and, asc, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import type { DbLike } from "@/db/link-index";
import { notes, trash } from "@/db/schema";
import { makeExcerpt } from "@/lib/markdown-text";
import { type RelinkChange, rewriteLinks } from "@/lib/relink";
import { linkersOf, mentionersOf, rebuildLinks } from "./links";
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
    .select({ ...metaColumns, head: sql<string>`left(${notes.body}, 600)` })
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(asc(notes.path), asc(notes.title));
  return rows.map((r) => ({ ...toMeta(r), excerpt: makeExcerpt(r.head) }));
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
export async function freeTitle(
  userId: string,
  path: string,
  base: string,
  q: DbLike = db,
): Promise<string> {
  const escaped = base.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await q
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
      // Em paralelo (uma ida ao banco a menos): a nota é nova e vazia, então
      // quem a menciona já menciona antes de ela existir.
      const [[row], mentioners] = await Promise.all([
        db.insert(notes).values({ id: input.id, userId, path, title }).returning(metaColumns),
        mentionersOf(db, userId, title),
      ]);
      // [[links]] que já apontavam para este nome passam a valer.
      await rebuildLinks(db, userId, mentioners);
      return toMeta(row);
    } catch (err) {
      if (uniqueConstraint(err) !== "notes_unique_title_per_folder") throw err;
      // Outro dispositivo criou o mesmo nome: pega o próximo livre.
      title = await freeTitle(userId, path, base);
    }
  }
  throw new NoteError(DUPLICATE_MESSAGE);
}

/** Hash do corpo calculado no banco (igual ao SHA-256 hex do cliente). */
const bodyHash = sql<string>`encode(sha256(convert_to(${notes.body}, 'UTF8')), 'hex')`;

export type SaveBodyResult = { ok: true; meta: NoteMeta } | { ok: false; conflict: true };

/**
 * Salva o corpo. `relink` = os [[links]] mudaram desde o último save (o
 * cliente compara); só então a tabela links é reconstruída.
 *
 * `baseHash` = hash do corpo de onde o cliente partiu. Se o corpo no banco
 * mudou desde então (editado em outro aparelho), NÃO grava e devolve
 * conflito. Sem `baseHash`, sobrescreve.
 */
export async function updateNoteBody(
  userId: string,
  id: string,
  body: string,
  opts: { relink?: boolean; baseHash?: string } = {},
): Promise<SaveBodyResult> {
  if (!isUuid(id)) throw new NoteError("Nota não encontrada.");
  const { relink = true, baseHash } = opts;
  const where = and(
    eq(notes.userId, userId),
    eq(notes.id, id),
    baseHash ? sql`${bodyHash} = ${baseHash}` : undefined,
  );
  const [row] = await db.update(notes).set({ body }).where(where).returning(metaColumns);
  if (!row) {
    if (baseHash && (await getNote(userId, id))) return { ok: false, conflict: true };
    throw new NoteError("Nota não encontrada.");
  }
  if (relink) await rebuildLinks(db, userId, [id]);
  return { ok: true, meta: toMeta(row) };
}

/**
 * Conflito ao sair da nota (não há como perguntar): guarda o texto local
 * numa nota irmã "Título (conflito)" e devolve o nome dela.
 */
export async function saveConflictCopy(userId: string, id: string, body: string): Promise<NoteMeta> {
  const original = await getNote(userId, id);
  if (!original) throw new NoteError("Nota não encontrada.");
  const base = `${original.title.slice(0, 180)} (conflito)`;
  const title = await freeTitle(userId, original.path, base);
  const [row] = await db
    .insert(notes)
    .values({ userId, path: original.path, title, body })
    .returning(metaColumns);
  await rebuildLinks(db, userId, [row.id], [{ id: row.id, path: row.path, body }]);
  return toMeta(row);
}

export type RelinkResult = {
  meta: NoteMeta;
  /** Outras notas cujos [[links]] foram reescritos. */
  updated: string[];
};

/**
 * Renomear ou mover: numa transação, grava o nome/pasta novos, reescreve os
 * [[links]] das outras notas que apontavam para ela (ver lib/relink) e
 * reconstrói os links de quem apontava, de quem menciona o novo nome e dela.
 * Se uma nota reescrita estiver aberta em outro aparelho, o autosave de lá
 * detecta o conflito pelo hash do corpo.
 */
async function updateAndRelink(
  userId: string,
  id: string,
  values: Partial<{ path: string; title: string }>,
  kind: RelinkChange["kind"],
): Promise<RelinkResult> {
  if (!isUuid(id)) throw new NoteError("Nota não encontrada.");
  try {
    return await db.transaction(async (tx) => {
      const before = (
        await tx.select(metaColumns).from(notes).where(eq(notes.userId, userId))
      ).map(toMeta);
      if (!before.some((n) => n.id === id)) throw new NoteError("Nota não encontrada.");
      const linkers = (await linkersOf(tx, userId, id)).filter((x) => x !== id);

      const [row] = await tx
        .update(notes)
        .set(values)
        .where(and(eq(notes.userId, userId), eq(notes.id, id)))
        .returning(metaColumns);
      const meta = toMeta(row);
      const change: RelinkChange = {
        before,
        after: before.map((n) => (n.id === id ? { ...n, path: meta.path, title: meta.title } : n)),
        targetId: id,
        kind,
      };

      const updated: string[] = [];
      const sources = linkers.length
        ? await tx
            .select({ id: notes.id, path: notes.path, body: notes.body })
            .from(notes)
            .where(and(eq(notes.userId, userId), inArray(notes.id, linkers)))
        : [];
      for (const src of sources) {
        const res = rewriteLinks(src.body, src.path, change);
        if (res.count === 0) continue;
        await tx
          .update(notes)
          .set({ body: res.body })
          .where(and(eq(notes.userId, userId), eq(notes.id, src.id)));
        updated.push(src.id);
      }

      const mentioners = await mentionersOf(tx, userId, meta.title);
      await rebuildLinks(tx, userId, [...linkers, ...mentioners, id]);
      return { meta, updated };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new NoteError(DUPLICATE_MESSAGE);
    throw err;
  }
}

export function renameNote(userId: string, id: string, title: string) {
  return updateAndRelink(userId, id, { title: unwrap(validateTitle(title)) }, "rename");
}

export function moveNote(userId: string, id: string, path: string) {
  return updateAndRelink(userId, id, { path: unwrap(validateFolder(path)) }, "move");
}

/** Move a nota para a lixeira (dá para restaurar com o mesmo id). */
export async function deleteNote(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw new NoteError("Nota não encontrada.");
  await db.transaction(async (tx) => {
    const before = await linkersOf(tx, userId, id);
    const [note] = await tx
      .delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, id)))
      .returning();
    if (!note) throw new NoteError("Nota não encontrada.");
    const row = {
      id: note.id,
      userId,
      path: note.path,
      title: note.title,
      body: note.body,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      deletedAt: new Date(),
    };
    await tx.insert(trash).values(row).onConflictDoUpdate({ target: trash.id, set: row });
    // Quem apontava para ela pode passar a apontar para outra de mesmo nome.
    await rebuildLinks(tx, userId, before);
  });
}
