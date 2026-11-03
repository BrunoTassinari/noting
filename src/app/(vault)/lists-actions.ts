"use server";

import { refresh } from "next/cache";
import { isOpenState, newItemLine, parseItem, RATING_RE, setItemEvaluation, setItemState } from "@/lib/lists";
import { isUuid } from "@/lib/note-paths";
import { requireUser } from "@/lib/session";
import type { TaskState } from "@/lib/tasks";
import {
  addItem,
  editNoteLine,
  getLists,
  listSignals,
  type ListsPayload,
  removeListItem,
  studyNoteFor,
  type SignalSource,
} from "@/server/lists";
import { NoteError } from "@/server/notes";

// Ações das telas Listas e Sinalizadores. Cada alteração devolve os dados
// atualizados; num conflito (linha mudou), o cliente recarrega.

export type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_LINE = 10_000;
const MAX_TEXT = 500;

const isLine = (s: unknown): s is string => typeof s === "string" && s.length <= MAX_LINE && !s.includes("\n");

/** Texto curto de uma linha (título, comentário); "" vira null. */
function shortText(s: unknown, what: string): string | null {
  if (s === null || s === undefined) return null;
  if (typeof s !== "string" || s.length > MAX_TEXT || /[\r\n]/.test(s)) throw new NoteError(`${what} inválido.`);
  return s.trim() || null;
}

type LineRef = { noteId: string; line: number; raw: string };

function refOf(ref: unknown): LineRef {
  const r = (typeof ref === "object" && ref !== null ? ref : {}) as Record<string, unknown>;
  if (!isUuid(String(r.noteId)) || !Number.isInteger(r.line) || (r.line as number) < 0 || !isLine(r.raw)) {
    throw new NoteError("Item inválido.");
  }
  return { noteId: String(r.noteId), line: r.line as number, raw: r.raw };
}

async function run<T>(fn: (userId: string) => Promise<T>, opts = { refresh: true }): Promise<Result<T>> {
  const user = await requireUser();
  let value: T;
  try {
    value = await fn(user.id);
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  if (opts.refresh) refresh();
  return { ok: true, ...value };
}

const selectedOf = (id: unknown) => (typeof id === "string" && isUuid(id) ? id : null);

// ---------- Listas ----------

const LIST_STATES = new Set<TaskState>([" ", "/", "x", "-"]);

export async function loadListsAction(selected: string | null): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => ({ data: await getLists(userId, selectedOf(selected)) }), { refresh: false });
}

export type ItemPatch = {
  /** A fazer / em andamento / concluído / desisti. */
  state?: TaskState;
  /** Nota ★ e comentário; os dois vazios tiram o bloco "★". Ausentes: não mexe. */
  evaluation?: { rating: string | null; comment: string | null };
};

/** Muda estado e/ou avaliação de um item, mantendo o resto da linha. */
export async function updateListItemAction(ref: LineRef, patch: ItemPatch): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => {
    const r = refOf(ref);
    const { state, evaluation } = (typeof patch === "object" && patch !== null ? patch : {}) as ItemPatch;
    if (state !== undefined && !LIST_STATES.has(state)) throw new NoteError("Estado inválido.");
    let rating: string | null = null;
    let comment: string | null = null;
    if (evaluation !== undefined) {
      rating = shortText(evaluation?.rating, "Nota");
      if (rating !== null && !RATING_RE.test(rating)) throw new NoteError("A nota deve ser um número, como 8 ou 9.5.");
      comment = shortText(evaluation?.comment, "Comentário");
    }
    await editNoteLine(
      userId,
      r.noteId,
      r.line,
      r.raw,
      (raw) => {
        let line: string | null = raw;
        if (state !== undefined) line = setItemState(line, state);
        if (line !== null && evaluation !== undefined) line = setItemEvaluation(line, rating, comment);
        return line;
      },
      { onlyLists: true },
    );
    return { data: await getLists(userId, r.noteId) };
  });
}

export async function addListItemAction(
  noteId: string,
  title: string,
  state: TaskState,
  buy: boolean,
): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => {
    if (!isUuid(String(noteId))) throw new NoteError("Lista não encontrada.");
    const t = shortText(title, "Título");
    if (!t) throw new NoteError("Escreva o nome do item.");
    if (!LIST_STATES.has(state)) throw new NoteError("Estado inválido.");
    const line = newItemLine(t, state, buy === true);
    // O título não pode virar outra coisa (ex.: começar com outro checkbox).
    if (parseItem(line)?.state !== state) throw new NoteError("Título inválido.");
    await addItem(userId, noteId, line);
    return { data: await getLists(userId, noteId) };
  });
}

/** Exclui o item da lista (com subitens). */
export async function deleteListItemAction(ref: LineRef): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => {
    const r = refOf(ref);
    await removeListItem(userId, r.noteId, r.line, r.raw);
    return { data: await getLists(userId, r.noteId) };
  });
}

/** Abre (ou cria) a nota de estudo do item. Devolve o id da nota. */
export async function studyNoteAction(listId: string, itemTitle: string): Promise<Result<{ id: string }>> {
  return run(async (userId) => {
    if (!isUuid(String(listId))) throw new NoteError("Lista não encontrada.");
    const t = shortText(itemTitle, "Título");
    if (!t) throw new NoteError("Item sem nome.");
    return { id: await studyNoteFor(userId, listId, t) };
  });
}

// ---------- Sinalizadores ----------

export async function loadSignalsAction(): Promise<Result<{ sources: SignalSource[] }>> {
  return run(async (userId) => ({ sources: await listSignals(userId) }), { refresh: false });
}

/** Conclui ([x]) ou cancela ([-]) uma tarefa sinalizada ainda aberta. */
export async function resolveSignalAction(
  ref: LineRef,
  action: "done" | "cancel",
): Promise<Result<{ sources: SignalSource[] }>> {
  return run(async (userId) => {
    const r = refOf(ref);
    if (action !== "done" && action !== "cancel") throw new NoteError("Ação inválida.");
    await editNoteLine(userId, r.noteId, r.line, r.raw, (raw) => {
      const p = parseItem(raw);
      return p && isOpenState(p.state) ? setItemState(raw, action === "done" ? "x" : "-") : null;
    });
    return { sources: await listSignals(userId) };
  });
}
