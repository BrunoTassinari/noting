"use server";

import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { parseDay, periodicNote, type PeriodicKind } from "@/lib/bujo";
import { isUuid } from "@/lib/note-paths";
import { getOrCreateNote, pullFutureLogIntoMonth } from "@/server/bujo";
import {
  createNote,
  deleteFolder,
  deleteNote,
  moveNote,
  NoteError,
  renameFolder,
  type RelinkResult,
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

/**
 * Abre a nota do dia/semana/mês de `isoDate` ("2026-11-02"), criando com o
 * modelo se não existir. A data vem do relógio do usuário (navegador).
 * `clientId`: id da nota otimista que o cliente já mostra. Se a nota já
 * existia com outro id (criada em outro aparelho), devolve esse id em vez de
 * redirecionar, para o cliente trocar de nota.
 */
export async function openPeriodicNoteAction(
  kind: PeriodicKind,
  isoDate: string,
  clientId?: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const d = typeof isoDate === "string" ? parseDay(isoDate) : null;
  if (!d || (kind !== "day" && kind !== "week" && kind !== "month")) return { ok: false, error: "Data inválida." };
  if (clientId !== undefined && !isUuid(clientId)) return { ok: false, error: "Id inválido." };
  const user = await requireUser();
  let id: string;
  try {
    const { ref, template } = periodicNote(kind, d);
    const note = await getOrCreateNote(user.id, ref, template, clientId);
    if (note.created && kind === "month") await pullFutureLogIntoMonth(user.id, note, d);
    id = note.id;
  } catch (err) {
    console.error(err);
    return { ok: false, error: "Não foi possível abrir a nota." };
  }
  revalidatePath("/", "layout");
  if (clientId && id !== clientId) return { ok: true, id };
  redirect(`/n/${id}`);
}

/** Renomear/mover: `relinked` = ids das outras notas com [[links]] reescritos. */
export type RelinkActionResult = { ok: true; relinked: string[] } | { ok: false; error: string };

async function runRelink(fn: (userId: string) => Promise<Pick<RelinkResult, "updated">>): Promise<RelinkActionResult> {
  const user = await requireUser();
  let relinked: string[];
  try {
    relinked = (await fn(user.id)).updated;
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  refresh();
  return { ok: true, relinked };
}

export async function renameNoteAction(id: string, title: string): Promise<RelinkActionResult> {
  return runRelink((userId) => renameNote(userId, id, title));
}

export async function moveNoteAction(id: string, path: string): Promise<RelinkActionResult> {
  return runRelink((userId) => moveNote(userId, id, path));
}

/** Move a pasta inteira (com subpastas) para a lixeira. */
export async function deleteFolderAction(path: string): Promise<ActionResult> {
  return run((userId) => deleteFolder(userId, path));
}

export async function renameFolderAction(from: string, to: string): Promise<RelinkActionResult> {
  return runRelink((userId) => renameFolder(userId, from, to));
}

const APP_HREF = /^\/(?:n\/[0-9a-f-]{36}|migrar|pendencias|listas|sinalizadores|lixeira)?$/;

/**
 * Move para a lixeira. `goTo`: para onde ir se a nota excluída é a aberta
 * (o cliente decide: a aba vizinha no desktop, a lista no celular). Sem
 * `goTo`, só atualiza a tela atual.
 */
export async function deleteNoteAction(id: string, goTo?: string): Promise<ActionResult> {
  const target = typeof goTo === "string" && APP_HREF.test(goTo) ? goTo : null;
  const result = await run((userId) => deleteNote(userId, id), { refresh: !target });
  if (result.ok && target) {
    revalidatePath("/", "layout");
    redirect(target);
  }
  return result;
}
