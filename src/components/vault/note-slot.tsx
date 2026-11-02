"use client";

import { useEffect } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import type { Backlink } from "@/lib/wikilinks";
import { putCachedNote } from "./note-cache";
import { NoteView } from "./note-view";
import { adoptOptimisticNote, useOptimisticNote } from "./optimistic-note";

/**
 * Conteúdo de /n/[id]. Se a nota já foi aberta antes da página chegar
 * (criada agora, ou aberta do cache), o editor já está no layout: só entrega
 * os dados reais a ele.
 */
export function NoteSlot({ note }: { note: NoteMeta & { body: string; backlinks: Backlink[] } }) {
  const optimistic = useOptimisticNote();
  const adopted = optimistic?.id === note.id && optimistic.mode !== "skeleton";

  useEffect(() => {
    putCachedNote(note);
    adoptOptimisticNote(note);
  }, [note]);

  if (adopted) return null;
  // key: trocar de nota recria o editor (estado e autosave por nota).
  return <NoteView key={note.id} note={note} />;
}
