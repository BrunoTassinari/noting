import { and, eq, sql } from "drizzle-orm";
import { folderName, resolveWikilink } from "@/lib/note-paths";
import { findWikilinks } from "@/lib/wikilinks";
import type { db } from "./index";
import { notes } from "./schema";

// A tabela links é um índice derivado dos [[links]] do corpo das notas:
// sempre pode ser reconstruída a partir do Markdown. Sem "server-only" para
// o script de reindexação poder usar.
//
// Cada ida ao banco custa caro (o Postgres pode estar em outra região), então
// a reconstrução usa no máximo duas consultas: uma leitura e uma escrita.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbLike = typeof db | Tx;

/** Nota de origem já conhecida por quem chama (corpo recém-gravado). */
export type LinkSource = { id: string; path: string; body: string };

/** Literal de array do Postgres para uuids ('{a,b}'); uuids não têm caracteres especiais. */
const uuidArray = (ids: string[]) => `{${ids.join(",")}}`;

/** Título (minúsculo) que um [[alvo]] procura: o nome depois da última "/". */
const targetTitle = (target: string) =>
  folderName(target.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "")).toLowerCase();

/**
 * Reconstrói os links que SAEM das notas indicadas.
 * `known`: origens cujo corpo quem chama já tem (evita relê-las do banco).
 */
export async function rebuildLinks(
  q: DbLike,
  userId: string,
  fromIds: string[],
  known: LinkSource[] = [],
): Promise<void> {
  const ids = [...new Set(fromIds)];
  if (ids.length === 0) return;

  const byId = new Map(known.filter((s) => ids.includes(s.id)).map((s) => [s.id, s]));
  const missing = ids.filter((id) => !byId.has(id));

  type Row = { id: string; path: string; title: string; body: string | null };
  let candidates: Row[];
  if (missing.length === 0) {
    // Corpos já conhecidos: só as notas cujo título algum [[link]] procura.
    const titles = [
      ...new Set([...byId.values()].flatMap((s) => findWikilinks(s.body).map((l) => targetTitle(l.target)))),
    ].filter(Boolean);
    candidates = titles.length
      ? await q
          .select({ id: notes.id, path: notes.path, title: notes.title, body: sql<null>`null` })
          .from(notes)
          .where(and(eq(notes.userId, userId), sql`lower(${notes.title}) in (select json_array_elements_text(${JSON.stringify(titles)}::json))`))
      : [];
  } else {
    // Uma consulta só: todas as notas (para resolver) e o corpo das que faltam.
    candidates = await q
      .select({
        id: notes.id,
        path: notes.path,
        title: notes.title,
        body: sql<string | null>`case when ${notes.id} = any(${uuidArray(missing)}::uuid[]) then ${notes.body} end`,
      })
      .from(notes)
      .where(eq(notes.userId, userId));
    for (const r of candidates) if (r.body !== null) byId.set(r.id, { id: r.id, path: r.path, body: r.body });
  }
  const meta = candidates.map((n) => ({ id: n.id, path: n.path, title: n.title, updatedAt: "" }));

  const from: string[] = [];
  const to: string[] = [];
  for (const src of byId.values()) {
    const seen = new Set<string>();
    for (const { target } of findWikilinks(src.body)) {
      const hit = resolveWikilink(meta, target, src.path);
      if (!hit || hit.id === src.id || seen.has(hit.id)) continue;
      seen.add(hit.id);
      from.push(src.id);
      to.push(hit.id);
    }
  }
  // Uma escrita só: apaga os links que deixaram de existir e insere os novos
  // (os que já existiam ficam: ON CONFLICT DO NOTHING).
  await q.execute(sql`
    with novos(from_id, to_id) as (
      select * from unnest(${uuidArray(from)}::uuid[], ${uuidArray(to)}::uuid[])
    ), apagados as (
      delete from links l
      where l.user_id = ${userId}
        and l.from_id = any(${uuidArray(ids)}::uuid[])
        and not exists (select 1 from novos n where n.from_id = l.from_id and n.to_id = l.to_id)
    )
    insert into links (from_id, to_id, user_id)
    select from_id, to_id, ${userId} from novos
    on conflict do nothing
  `);
}
