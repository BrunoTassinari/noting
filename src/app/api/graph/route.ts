import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { links, notes } from "@/db/schema";
import { auth } from "@/lib/auth";
import { LISTS_FOLDER } from "@/lib/bujo";
import { fold } from "@/lib/fold";
import { itemLabel, itemLinkTarget, parseListItems } from "@/lib/lists";
import { resolveWikilink, wikilinkTitle } from "@/lib/note-paths";
import { findWikilinks } from "@/lib/wikilinks";

// GET /api/graph: ligações entre notas para o grafo.
//  - edges: [[links]] resolvidos + itens de lista que têm nota com o mesmo
//    nome (ex.: o livro na lista "Livros" e o fichamento dele);
//  - ghosts: [[links]] para notas que não existem e itens de lista sem nota
//    (o grafo mostra como pontos apagados, como no Obsidian).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const userId = session.user.id;

  const [rows, linkRows] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body, updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.userId, userId)),
    db.select({ from: links.fromId, to: links.toId }).from(links).where(and(eq(links.userId, userId))),
  ]);
  const metas = rows.map((r) => ({ id: r.id, path: r.path, title: r.title, updatedAt: r.updatedAt.toISOString() }));
  const byFold = new Map<string, string>();
  for (const m of metas) if (!byFold.has(fold(m.title))) byFold.set(fold(m.title), m.id);

  const edges: [string, string][] = linkRows.map((r) => [r.from, r.to]);
  const seen = new Set(edges.map(([a, b]) => `${a}>${b}`));
  const ghosts: [string, string, "link" | "item"][] = [];

  for (const r of rows) {
    for (const l of findWikilinks(r.body)) {
      if (l.target.startsWith("#")) continue;
      if (!resolveWikilink(metas, l.target, r.path)) ghosts.push([r.id, wikilinkTitle(l.target), "link"]);
    }
    if (r.path !== LISTS_FOLDER && !r.path.startsWith(`${LISTS_FOLDER}/`)) continue;
    for (const item of parseListItems(r.body)) {
      if (itemLinkTarget(item.title)) continue; // já contado como [[link]]
      const label = itemLabel(item.title).replace(/^(?:🛒\s*)+/u, "").trim();
      if (label.length < 2) continue;
      const target = byFold.get(fold(label));
      if (target && target !== r.id) {
        if (!seen.has(`${r.id}>${target}`)) {
          seen.add(`${r.id}>${target}`);
          edges.push([r.id, target]);
        }
      } else if (!target) ghosts.push([r.id, label, "item"]);
    }
  }

  return NextResponse.json({ edges, ghosts }, { headers: { "Cache-Control": "private, no-store" } });
}
