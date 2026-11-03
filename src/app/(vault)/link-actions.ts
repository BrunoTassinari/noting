"use server";

import { requireUser } from "@/lib/session";
import { linkMentions, getUnlinkedMentions, type UnlinkedMention } from "@/server/mentions";
import { NoteError } from "@/server/notes";

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
