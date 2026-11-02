"use client";

import { useEffect } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import { NoteView } from "./note-view";
import { adoptOptimisticNote, useOptimisticNote } from "./optimistic-note";

/**
 * Conteúdo de /n/[id]. Se esta nota acabou de ser criada de forma otimista,
 * o editor já está aberto pelo layout: só entrega os dados reais a ele.
 */
export function NoteSlot({ note }: { note: NoteMeta & { body: string } }) {
  const optimistic = useOptimisticNote();
  const adopted = optimistic?.id === note.id;

  useEffect(() => {
    adoptOptimisticNote(note);
  }, [note]);

  if (adopted) return null;
  // key: trocar de nota recria o editor (estado e autosave por nota).
  return <NoteView key={note.id} note={note} />;
}
