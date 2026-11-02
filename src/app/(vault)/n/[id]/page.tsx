import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { NoteSlot } from "@/components/vault/note-slot";
import { isUuid } from "@/lib/note-paths";
import { requireUser } from "@/lib/session";
import { getBacklinkRows, toBacklinks } from "@/server/links";
import { getNote } from "@/server/notes";

// cache: metadata e página compartilham a mesma leitura.
const load = cache(async (id: string) => {
  const user = await requireUser();
  return getNote(user.id, id);
});

export async function generateMetadata({ params }: PageProps<"/n/[id]">): Promise<Metadata> {
  const note = await load((await params).id);
  return { title: note ? `${note.title} · Noting` : "Noting" };
}

export default async function NotePage({ params }: PageProps<"/n/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requireUser();
  // Em paralelo: a nota e quem aponta para ela.
  const [note, rows] = await Promise.all([load(id), getBacklinkRows(user.id, id)]);
  if (!note) notFound();
  return <NoteSlot note={{ ...note, backlinks: toBacklinks(rows, note.title) }} />;
}
