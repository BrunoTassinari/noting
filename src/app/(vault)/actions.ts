"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import {
  createNote,
  deleteNote,
  moveNote,
  NoteError,
  renameNote,
  updateNoteBody,
} from "@/server/notes";

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_BODY_LENGTH = 1_000_000; // ~1 MB de Markdown por nota

async function run(fn: (userId: string) => Promise<unknown>, opts = { refresh: true }): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await fn(user.id);
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  if (opts.refresh) refresh();
  return { ok: true };
}

/** Cria uma nota na pasta indicada e abre. */
export async function createNoteAction(path: string, title?: string): Promise<ActionResult> {
  const user = await requireUser();
  let id: string;
  try {
    id = (await createNote(user.id, { path, title })).id;
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Não foi possível criar a nota." };
  }
  // Dados novos para a árvore antes de navegar.
  revalidatePath("/", "layout");
  redirect(`/n/${id}`);
}

export async function saveNoteBodyAction(id: string, body: string): Promise<ActionResult> {
  if (typeof body !== "string" || body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: "Nota grande demais para salvar." };
  }
  // Sem refresh: a árvore não depende do conteúdo.
  return run((userId) => updateNoteBody(userId, id, body), { refresh: false });
}

export async function renameNoteAction(id: string, title: string): Promise<ActionResult> {
  return run((userId) => renameNote(userId, id, title));
}

export async function moveNoteAction(id: string, path: string): Promise<ActionResult> {
  return run((userId) => moveNote(userId, id, path));
}

export async function deleteNoteAction(id: string): Promise<ActionResult> {
  const result = await run((userId) => deleteNote(userId, id), { refresh: false });
  if (result.ok) {
    revalidatePath("/", "layout");
    redirect("/");
  }
  return result;
}
