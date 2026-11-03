import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { fold } from "@/lib/fold";
import { sha256Hex } from "@/lib/hash";
import { findMentions, mentionLink, mentionSnippet } from "@/lib/mentions";
import { NoteError, updateNoteBody } from "./notes";

export type UnlinkedMention = {
  id: string;
  title: string;
  path: string;
  count: number;
  snippet: string;
  hit: [number, number];
};

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function target(userId: string, noteId: string) {
  const [row] = await db
    .select({ id: notes.id, title: notes.title, path: notes.path })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.id, noteId)));
  if (!row) return null;
  // Mesmo nome em outra pasta: o link leva o caminho para não ficar ambíguo.
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notes)
    .where(and(eq(notes.userId, userId), sql`lower(${notes.title}) = lower(${row.title})`));
  return { ...row, linkTarget: n > 1 && row.path ? `${row.path}/${row.title}` : row.title };
}

/** Notas que citam o nome da nota sem [[link]]. */
export async function getUnlinkedMentions(userId: string, noteId: string): Promise<UnlinkedMention[]> {
  const t = await target(userId, noteId);
  if (!t || fold(t.title).trim().length < 3) return [];
  const rows = await db
    .select({ id: notes.id, title: notes.title, path: notes.path, body: notes.body })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        ne(notes.id, noteId),
        sql`${notes.searchText} like ${`%${likeEscape(fold(t.title).trim())}%`}`,
      ),
    )
    .limit(80);
  const out: UnlinkedMention[] = [];
  for (const r of rows) {
    const hits = findMentions(r.body, t.title);
    if (hits.length === 0) continue;
    const { text, hit } = mentionSnippet(r.body, hits[0]);
    out.push({ id: r.id, title: r.title, path: r.path, count: hits.length, snippet: text, hit });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, 30);
}

/** Troca as menções em `sourceId` por [[links]] para `noteId`. */
export async function linkMentions(userId: string, sourceId: string, noteId: string): Promise<number> {
  const t = await target(userId, noteId);
  if (!t) throw new NoteError("Nota não encontrada.");
  for (let attempt = 0; attempt < 3; attempt++) {
    const [src] = await db
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.id, sourceId)));
    if (!src) throw new NoteError("Nota não encontrada.");
    const hits = findMentions(src.body, t.title);
    if (hits.length === 0) return 0;
    let body = src.body;
    for (const [a, b] of [...hits].reverse()) body = body.slice(0, a) + mentionLink(t.linkTarget, t.title, body.slice(a, b)) + body.slice(b);
    const res = await updateNoteBody(userId, sourceId, body, { baseHash: (await sha256Hex(src.body))! });
    if (res.ok) return hits.length;
  }
  throw new NoteError("A nota mudou enquanto eu linkava. Tente de novo.");
}
