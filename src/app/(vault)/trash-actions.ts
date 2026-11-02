"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/session";
import type { NoteMeta } from "@/lib/note-paths";
import { NoteError } from "@/server/notes";
import {
  deleteForever,
  emptyTrash,
  listTrash,
  purgeOldTrash,
  restoreNote,
  type TrashItem,
} from "@/server/trash";

// Ações da tela Lixeira (/lixeira).

export type TrashResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(
  fn: (userId: string) => Promise<T>,
  opts = { refresh: false },
): Promise<TrashResult<T>> {
  const user = await requireUser();
  let value: T;
  try {
    value = await fn(user.id);
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  // Restaurar muda a árvore de notas.
  if (opts.refresh) refresh();
  return { ok: true, ...value };
}

/** Lista a lixeira; antes, apaga de vez o que passou de 30 dias. */
export async function loadTrashAction(): Promise<TrashResult<{ items: TrashItem[] }>> {
  return run(async (userId) => {
    await purgeOldTrash(userId);
    return { items: await listTrash(userId) };
  });
}

export async function restoreNoteAction(
  id: string,
): Promise<TrashResult<{ note: NoteMeta; items: TrashItem[] }>> {
  return run(
    async (userId) => {
      const note = await restoreNote(userId, id);
      return { note, items: await listTrash(userId) };
    },
    { refresh: true },
  );
}

export async function deleteForeverAction(id: string): Promise<TrashResult<{ items: TrashItem[] }>> {
  return run(async (userId) => {
    await deleteForever(userId, id);
    return { items: await listTrash(userId) };
  });
}

export async function emptyTrashAction(): Promise<TrashResult<{ removed: number }>> {
  return run(async (userId) => ({ removed: await emptyTrash(userId) }));
}
