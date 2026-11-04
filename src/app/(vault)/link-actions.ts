"use server";

import { refresh } from "next/cache";
import type { NoteMeta } from "@/lib/note-paths";
import { promotedBody } from "@/lib/promote";
import { requireUser } from "@/lib/session";
import { linkMentions, getUnlinkedMentions, type UnlinkedMention } from "@/server/mentions";
import { createNote, getNote, NoteError, updateNoteBody } from "@/server/notes";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function loadUnlinkedMentionsAction(noteId: string): Promise<Result<{ mentions: UnlinkedMention[] }>> {
  const user = await requireUser();
  return { ok: true, mentions: await getUnlinkedMentions(user.id, noteId) };
}

export async function linkMentionsAction(sourceId: string, noteId: string): Promise<Result<{ linked: number }>> {
  const user = await requireUser();
  try {
    return { ok: true, linked: await linkMentions(user.id, sourceId, noteId) };
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Não foi possível linkar. Tente de novo." };
  }
}

/**
 * "Virar nota": cria a nota no Acervo com o texto vindo do BuJo e o rastro
 * "Surgiu em [[dia]]". A troca da linha na origem é feita no editor.
 */
export async function promoteAction(input: {
  originId: string;
  folder: string;
  title: string;
  body: string;
}): Promise<Result<{ note: NoteMeta }>> {
  const user = await requireUser();
  try {
    const origin = await getNote(user.id, input.originId);
    const body = typeof input.body === "string" ? input.body.slice(0, 200_000) : "";
    const meta = await createNote(user.id, { path: String(input.folder ?? ""), title: String(input.title ?? "") });
    await updateNoteBody(user.id, meta.id, promotedBody(body, origin));
    refresh();
    return { ok: true, note: meta };
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Não foi possível criar a nota. Tente de novo." };
  }
}
