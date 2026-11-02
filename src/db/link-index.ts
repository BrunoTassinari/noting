import { and, eq, inArray } from "drizzle-orm";
import { resolveWikilink } from "@/lib/note-paths";
import { findWikilinks } from "@/lib/wikilinks";
import type { db } from "./index";
import { links, notes } from "./schema";

// A tabela links é um índice derivado dos [[links]] do corpo das notas:
// sempre pode ser reconstruída a partir do Markdown. Sem "server-only" para
// o script de reindexação poder usar.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = typeof db | Tx;


/** Reconstrói os links que SAEM das notas indicadas. */
export async function rebuildLinks(q: DbLike, userId: string, fromIds: string[]): Promise<void> {
  const ids = [...new Set(fromIds)];
  if (ids.length === 0) return;

  const [all, sources] = await Promise.all([
    q
      .select({ id: notes.id, path: notes.path, title: notes.title, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.userId, userId)),
    q
      .select({ id: notes.id, path: notes.path, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.id, ids))),
  ]);
  const meta = all.map((n) => ({ ...n, updatedAt: n.updatedAt.toISOString() }));

  const rows: { fromId: string; toId: string; userId: string }[] = [];
  for (const src of sources) {
    const seen = new Set<string>();
    for (const { target } of findWikilinks(src.body)) {
      const to = resolveWikilink(meta, target, src.path);
      if (!to || to.id === src.id || seen.has(to.id)) continue;
      seen.add(to.id);
      rows.push({ fromId: src.id, toId: to.id, userId });
    }
  }

  await q.delete(links).where(and(eq(links.userId, userId), inArray(links.fromId, ids)));
  // Em lotes: o Postgres limita parâmetros por consulta (vaults grandes).
  for (let i = 0; i < rows.length; i += 1000) {
    await q.insert(links).values(rows.slice(i, i + 1000)).onConflictDoNothing();
  }
}

