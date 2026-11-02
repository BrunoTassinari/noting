import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoteView } from "@/components/vault/note-view";
import { requireUser } from "@/lib/session";
import { getNote } from "@/server/notes";

async function load(id: string) {
  const user = await requireUser();
  return getNote(user.id, id);
}

export async function generateMetadata({ params }: PageProps<"/n/[id]">): Promise<Metadata> {
  const note = await load((await params).id);
  return { title: note ? `${note.title} · Noting` : "Noting" };
}

export default async function NotePage({ params }: PageProps<"/n/[id]">) {
  const note = await load((await params).id);
  if (!note) notFound();
  // key: troca de nota recria o editor (estado e autosave por nota).
  return <NoteView key={note.id} note={note} />;
}
