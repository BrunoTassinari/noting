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

/** A fazer / em andamento / concluído / desisti. */
export async function setListItemStateAction(
  ref: LineRef,
  state: TaskState,
): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => {
    const r = refOf(ref);
    if (!LIST_STATES.has(state)) throw new NoteError("Estado inválido.");
    await editNoteLine(userId, r.noteId, r.line, r.raw, (raw) => setItemState(raw, state), { onlyLists: true });
    return { data: await getLists(userId, r.noteId) };
  });
}

/** Nota ★ e comentário (vazios: tira o bloco "★"). */
export async function setListItemEvaluationAction(
  ref: LineRef,
  rating: string | null,
  comment: string | null,
): Promise<Result<{ data: ListsPayload }>> {
  return run(async (userId) => {
    const r = refOf(ref);
    const rt = shortText(rating, "Nota");
    if (rt !== null && !RATING_RE.test(rt)) throw new NoteError("A nota deve ser um número, como 8 ou 9.5.");
    const c = shortText(comment, "Comentário");
    await editNoteLine(userId, r.noteId, r.line, r.raw, (raw) => setItemEvaluation(raw, rt, c), { onlyLists: true });
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
