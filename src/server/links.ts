import "server-only";
import { and, eq, ilike, like } from "drizzle-orm";
import { db } from "@/db";
import { links, notes } from "@/db/schema";
import { type DbLike, rebuildLinks } from "@/db/link-index";
import { folderName } from "@/lib/note-paths";
import { type Backlink, findWikilinks } from "@/lib/wikilinks";

export { rebuildLinks };

/** Notas que hoje apontam para noteId. */
export async function linkersOf(q: DbLike, userId: string, noteId: string): Promise<string[]> {
  const rows = await q
    .select({ id: links.fromId })
    .from(links)
    .where(and(eq(links.userId, userId), eq(links.toId, noteId)));
  return rows.map((r) => r.id);
}

/**
 * Notas que podem ter um [[link]] para este título (ainda sem resolver,
 * ou resolvido para outra nota de mesmo nome). Filtro amplo; a resolução
 * exata acontece em rebuildLinks.
 */
export async function mentionersOf(q: DbLike, userId: string, title: string): Promise<string[]> {
  const escaped = title.replace(/[\\%_]/g, (c) => `\\${c}`);
  const rows = await q
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(eq(notes.userId, userId), like(notes.body, "%[[%"), ilike(notes.body, `%${escaped}%`)),
    );
  return rows.map((r) => r.id);
}

const SNIPPET_MAX = 160;

/** Trecho da linha que contém o link para `title`. */
function snippetFor(body: string, title: string): string {
  const wanted = title.toLowerCase();
  for (const line of body.split("\n")) {
    const hit = findWikilinks(line).find(
      (l) => folderName(l.target.split("#")[0].trim()).toLowerCase() === wanted,
    );
    if (!hit) continue;
    let text = line.replace(/^\s*(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|#{1,6}\s+|>\s*)/, "").trim();
    if (text.length <= SNIPPET_MAX) return text;
    // Corta em volta do link.
    const at = Math.max(0, text.indexOf("[[") - 50);
    text = text.slice(at, at + SNIPPET_MAX).trim();
    return `${at > 0 ? "…" : ""}${text}…`;
  }
  return "";
}

/** Notas que apontam para noteId (com corpo, para montar o trecho). */
export function getBacklinkRows(userId: string, noteId: string) {
  return db
    .select({ id: notes.id, title: notes.title, path: notes.path, body: notes.body })
    .from(links)
    .innerJoin(notes, eq(notes.id, links.fromId))
    .where(and(eq(links.userId, userId), eq(links.toId, noteId)))
    .orderBy(notes.title);
}

export function toBacklinks(
  rows: { id: string; title: string; path: string; body: string }[],
  title: string,
): Backlink[] {
  return rows.map((r) => ({ id: r.id, title: r.title, path: r.path, snippet: snippetFor(r.body, title) }));
}
