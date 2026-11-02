import "server-only";
import { and, eq, like, or } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { isoDay, LISTS_FOLDER, periodOf } from "@/lib/bujo";
import {
  insertListItem,
  isOpenState,
  type ListItem,
  parseListItems,
  SIGNALS,
  type SignalItem,
  signalItems,
} from "@/lib/lists";
import { rebuildLinks } from "./links";
import { NoteError } from "./notes";

// Listas ("Bullet Journal/Listas/…") e sinalizadores. As alterações
// identificam o item por (nota, linha, texto exato da linha), com a nota
// travada (FOR UPDATE): se a linha mudou desde a leitura, nada é gravado.

const CONFLICT =
  "Este item mudou desde que a tela foi carregada (editado em outro lugar). A lista foi atualizada; confira e tente de novo.";

const inListsFolder = or(eq(notes.path, LISTS_FOLDER), like(notes.path, `${LISTS_FOLDER}/%`));

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
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId), opts.onlyLists ? inListsFolder : undefined))
      .for("update");
    if (!row) throw new NoteError("Nota não encontrada.");
    const lines = row.body.split("\n");
    if (lines[line] !== raw) throw new NoteError(CONFLICT);
    const next = edit(raw);
    if (next === null) throw new NoteError(CONFLICT);
    if (next === raw) return;
    lines[line] = next;
    await tx
      .update(notes)
      .set({ body: lines.join("\n") })
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId)));
    await rebuildLinks(tx, userId, [noteId]);
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

/** Resumo de todas as listas e os itens da escolhida (ou da primeira). */
export async function getLists(userId: string, selected: string | null): Promise<ListsPayload> {
  const rows = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), inListsFolder));
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
export async function addItem(userId: string, noteId: string, line: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId), inListsFolder))
      .for("update");
    if (!row) throw new NoteError("Lista não encontrada.");
    await tx
      .update(notes)
      .set({ body: insertListItem(row.body, line) })
      .where(and(eq(notes.userId, userId), eq(notes.id, noteId)));
    await rebuildLinks(tx, userId, [noteId]);
  });
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
export async function listSignals(userId: string): Promise<SignalSource[]> {
  const rows = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(and(eq(notes.userId, userId), or(...SIGNALS.map((s) => like(notes.body, `%${s.emoji}%`)))));
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
