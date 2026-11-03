import "server-only";
import { and, eq, like, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { isoDay, LISTS_FOLDER, periodOf } from "@/lib/bujo";
import { fold } from "@/lib/fold";
import { resolveWikilink } from "@/lib/note-paths";
import {
  insertListItem,
  itemLabel,
  itemLinkTarget,
  isOpenState,
  type ListItem,
  parseListItems,
  SIGNALS,
  type SignalItem,
  signalItems,
} from "@/lib/lists";
import { sha256Hex } from "@/lib/hash";
import { sameWikilinkTargets } from "@/lib/wikilinks";
import { rebuildLinks } from "./links";
import { NoteError, updateNoteBody } from "./notes";

// Listas ("Bullet Journal/Listas/…") e sinalizadores. As alterações
// identificam o item por (nota, linha, texto exato da linha), com a nota
// travada (FOR UPDATE): se a linha mudou desde a leitura, nada é gravado.

const CONFLICT =
  "Este item mudou desde que a tela foi carregada (editado em outro lugar). A lista foi atualizada; confira e tente de novo.";

const inListsFolder = or(eq(notes.path, LISTS_FOLDER), like(notes.path, `${LISTS_FOLDER}/%`));

/**
 * Edita o corpo de uma nota sem transação: lê, calcula e grava só se o corpo
 * no banco ainda for o lido (hash). Se mudou no meio, lê de novo e tenta outra
 * vez. Duas idas ao banco em vez das ~7 de uma transação com FOR UPDATE, e a
 * tabela links só é refeita se os [[links]] mudaram. `edit` devolve o corpo
 * novo, ou null quando não há nada a mudar (pode lançar NoteError).
 * Devolve o corpo como ficou no banco.
 */
async function editBody(
  userId: string,
  noteId: string,
  where: SQL | undefined,
  notFound: string,
  edit: (body: string) => string | null,
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId), where));
    if (!row) throw new NoteError(notFound);
    const next = edit(row.body);
    if (next === null || next === row.body) return row.body;
    const res = await updateNoteBody(userId, noteId, next, {
      relink: !sameWikilinkTargets(row.body, next),
      baseHash: (await sha256Hex(row.body)) ?? undefined,
    });
    if (res.ok) return next;
  }
  throw new NoteError(CONFLICT);
}

/**
 * Troca a linha `line` da nota se ela ainda for `raw`. `edit` devolve a
 * linha nova (ou null se a linha não serve). `onlyLists`: a nota precisa
 * estar na pasta das listas.
 */
export async function editNoteLine(
  userId: string,
  noteId: string,
  line: number,
  raw: string,
  edit: (raw: string) => string | null,
  opts: { onlyLists?: boolean } = {},
): Promise<string> {
  return editBody(userId, noteId, opts.onlyLists ? inListsFolder : undefined, "Nota não encontrada.", (body) => {
    const lines = body.split("\n");
    if (lines[line] !== raw) throw new NoteError(CONFLICT);
    const next = edit(raw);
    if (next === null) throw new NoteError(CONFLICT);
    if (next === raw) return null;
    lines[line] = next;
    return lines.join("\n");
  });
}

// ---------- Listas ----------

export type ListSummary = {
  id: string;
  /** Nome para mostrar ("Filmes", ou "Leituras/2026" numa subpasta). */
  name: string;
  open: number;
  total: number;
};

export type ListData = { id: string; name: string; items: ListItem[] };

export type ListsPayload = { lists: ListSummary[]; current: ListData | null };

const nameOf = (r: { path: string; title: string }) =>
  r.path === LISTS_FOLDER ? r.title : `${r.path.slice(LISTS_FOLDER.length + 1)}/${r.title}`;

/**
 * Nota sendo alterada ao mesmo tempo que a lista é lida: a leitura não espera
 * a gravação (uma ida ao banco a menos) e usa o corpo que a gravação devolve.
 */
export type PendingEdit = { id: string; body: Promise<string> };

const withEdited = <R extends { id: string; body: string }>(rows: R[], id: string | undefined, body: string | undefined) =>
  id === undefined || body === undefined ? rows : rows.map((r) => (r.id === id ? { ...r, body } : r));

/** Resumo de todas as listas e os itens da escolhida (ou da primeira). */
export async function getLists(userId: string, selected: string | null, edited?: PendingEdit): Promise<ListsPayload> {
  const [read, body] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), inListsFolder)),
    edited?.body,
  ]);
  const rows = withEdited(read, edited?.id, body);
  const parsed = rows
    .map((r) => ({ id: r.id, name: nameOf(r), items: parseListItems(r.body) }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base", numeric: true }));
  const lists = parsed.map((l) => ({
    id: l.id,
    name: l.name,
    open: l.items.filter((i) => isOpenState(i.state)).length,
    total: l.items.length,
  }));
  const current = parsed.find((l) => l.id === selected) ?? parsed[0] ?? null;
  return { lists, current };
}

/** Novo item logo depois do último item da lista. */
export async function addItem(userId: string, noteId: string, line: string): Promise<string> {
  return editBody(userId, noteId, inListsFolder, "Lista não encontrada.", (body) => insertListItem(body, line));
}

// ---------- Sinalizadores ----------

export type SignalSource = {
  noteId: string;
  title: string;
  /** Data da nota periódica ("2026-11-02") ou da última alteração (ISO). */
  date: string;
  /** "day" | "week" | "month" (data da nota) ou "updated" (última alteração). */
  dateKind: "day" | "week" | "month" | "updated";
  items: SignalItem[];
};

/** Notas com tarefas sinalizadas (todas; o cliente filtra abertas/resolvidas). */
export async function listSignals(userId: string, edited?: PendingEdit): Promise<SignalSource[]> {
  const [read, body] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body, updatedAt: notes.updatedAt })
      .from(notes)
      .where(and(eq(notes.userId, userId), or(...SIGNALS.map((s) => like(notes.body, `%${s.emoji}%`))))),
    edited?.body,
  ]);
  const rows = withEdited(read, edited?.id, body).map((r) =>
    r.id === edited?.id ? { ...r, updatedAt: new Date() } : r,
  );
  const out: SignalSource[] = [];
  for (const r of rows) {
    const items = signalItems(r.body);
    if (items.length === 0) continue;
    const period = periodOf(r);
    out.push({
      noteId: r.id,
      title: r.title,
      date: period ? isoDay(period.day) : r.updatedAt.toISOString(),
      dateKind: period ? period.kind : "updated",
      items,
    });
  }
  // Mais recentes primeiro (datas "2026-11-02" e ISO completas se comparam bem).
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** Remove o item (e seus subitens indentados) se a linha ainda for `raw`. */
export async function removeListItem(userId: string, noteId: string, line: number, raw: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId), inListsFolder))
      .for("update");
    if (!row) throw new NoteError("Lista não encontrada.");
    const lines = row.body.split("\n");
    if (lines[line] !== raw) throw new NoteError(CONFLICT);
    const indent = /^\s*/.exec(raw)![0].length;
    let end = line + 1;
    while (end < lines.length && lines[end].trim() !== "" && /^\s*/.exec(lines[end])![0].length > indent) end++;
    lines.splice(line, end - line);
    await tx
      .update(notes)
      .set({ body: lines.join("\n") })
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId)));
    await rebuildLinks(tx, userId, [noteId]);
  });
}

/** Pasta das notas de estudo de uma lista (Livros → Conhecimento/Fichamentos). */
export const studyFolder = (listName: string) =>
  /^livros?$/i.test(listName.trim()) ? "Conhecimento/Fichamentos" : `Conhecimento/${listName.replace(/\//g, " - ")}`;

/**
 * Nota de estudo de um item:
 *  1. se o item é um [[link]], abre a nota do link (se existir);
 *  2. senão, uma nota com o mesmo nome em qualquer pasta (sem diferenciar
 *     maiúsculas/acentos), preferindo a pasta de estudo da lista;
 *  3. senão, cria na pasta de estudo da lista.
 */
export async function studyNoteFor(userId: string, listId: string, itemTitle: string): Promise<string> {
  const [list] = await db
    .select({ path: notes.path, title: notes.title })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, listId), inListsFolder));
  if (!list) throw new NoteError("Lista não encontrada.");
  const listName = nameOf(list);
  const folder = studyFolder(listName);
  const all = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, updatedAt: notes.updatedAt })
    .from(notes)
    .where(eq(notes.userId, userId));
  const metas = all.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString() }));

  const target = itemLinkTarget(itemTitle);
  if (target) {
    const linked = resolveWikilink(metas, target, folder);
    if (linked) return linked.id;
  }

  const title = itemLabel(itemTitle).replace(/\//g, "-").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!title) throw new NoteError("Item sem nome.");
  const key = fold(title);
  const same = metas.filter((n) => fold(n.title) === key);
  const found = same.find((n) => n.path === folder) ?? same[0];
  if (found) return found.id;

  const { getOrCreateNote } = await import("./bujo");
  const note = await getOrCreateNote(
    userId,
    { path: folder, title },
    `# ${title}\n\nLista: [[${list.path}/${list.title}|${listName}]]\n\n## Notas\n\n`,
  );
  return note.id;
}
