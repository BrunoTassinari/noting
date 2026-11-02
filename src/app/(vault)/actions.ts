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
  saveConflictCopy,
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

/**
 * Cria a nota e navega até ela. O cliente já mostra a nota antes (criação
 * otimista) e manda o id e o título que escolheu.
 */
export async function createNoteAction(input: {
  id: string;
  path: string;
  title: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  let id: string;
  try {
    id = (await createNote(user.id, input)).id;
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Não foi possível criar a nota." };
  }
  // Dados novos para a árvore antes de navegar.
  revalidatePath("/", "layout");
  redirect(`/n/${id}`);
}

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string }
  /** A nota mudou em outro aparelho desde `baseHash`; nada foi gravado. */
  | { ok: false; conflict: true }
  /** onConflict "copy": o texto foi guardado numa nota nova com este nome. */
  | { ok: true; copiedTo: string };

/**
 * Salva o corpo. `baseHash` (SHA-256 do corpo de onde o editor partiu)
 * protege contra sobrescrever o que foi escrito em outro aparelho:
 *   - sem baseHash → sobrescreve ("Manter a minha");
 *   - onConflict "report" → devolve { conflict } para o editor perguntar;
 *   - onConflict "copy" → guarda o texto numa nota "(conflito)" (ao sair da nota).
 */
export async function saveNoteBodyAction(
  id: string,
  body: string,
  opts: { linksChanged?: boolean; baseHash?: string; onConflict?: "report" | "copy" } = {},
): Promise<SaveResult> {
  if (typeof body !== "string" || body.length > MAX_BODY_LENGTH) {
    return { ok: false, error: "Nota grande demais para salvar." };
  }
  const user = await requireUser();
  try {
    const res = await updateNoteBody(user.id, id, body, {
      relink: opts.linksChanged ?? true,
      baseHash: opts.baseHash,
    });
    if (res.ok) return { ok: true }; // sem refresh: a árvore não depende do conteúdo
    if (opts.onConflict !== "copy") return { ok: false, conflict: true };
    const copy = await saveConflictCopy(user.id, id, body);
    refresh();
    return { ok: true, copiedTo: copy.title };
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
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
