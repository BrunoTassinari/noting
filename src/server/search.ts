import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { findTerms, searchTerms } from "@/lib/fold";
import { markdownToPlain } from "@/lib/markdown-text";

export type SearchResult = {
  id: string;
  title: string;
  path: string;
  updatedAt: string;
  /** Trecho do corpo em volta da primeira ocorrência (vazio se só o título bateu). */
  snippet: string;
  /** Onde destacar no trecho e no título. */
  snippetMatches: [number, number][];
  titleMatches: [number, number][];
};

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 160;
const BODY_SCAN = 20_000; // caracteres do corpo usados para montar o trecho

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function makeSnippet(body: string, terms: string[]) {
  const flat = markdownToPlain(body).replace(/\s+/g, " ").trim();
  const hits = findTerms(flat, terms);
  if (hits.length === 0) return { snippet: "", snippetMatches: [] as [number, number][] };
  let start = Math.max(0, hits[0][0] - SNIPPET_BEFORE);
  if (start > 0) {
    const space = flat.lastIndexOf(" ", start);
    if (space > start - 15) start = space + 1;
  }
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const snippet = prefix + flat.slice(start, end) + (end < flat.length ? "…" : "");
  const snippetMatches = hits
    .filter(([a, b]) => a >= start && b <= end)
    .map(([a, b]) => [a - start + prefix.length, b - start + prefix.length] as [number, number]);
  return { snippet, snippetMatches };
}

/**
 * Busca por título e conteúdo, sem diferenciar maiúsculas nem acentos.
 * Todas as palavras precisam aparecer; título que bate vem primeiro.
 */
export async function searchNotes(userId: string, query: string, limit = 30): Promise<SearchResult[]> {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];

  const conditions = terms.map((t) => sql`${notes.searchText} like ${`%${likeEscape(t)}%`}`);
  const titleScore = sql.join(
    terms.map((t) => sql`(f_unaccent(lower(${notes.title})) like ${`%${likeEscape(t)}%`})::int`),
    sql` + `,
  );

  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      path: notes.path,
      updatedAt: notes.updatedAt,
      body: sql<string>`substring(${notes.body}, 1, ${BODY_SCAN})`,
      score: sql<number>`${titleScore}`,
    })
    .from(notes)
    .where(and(eq(notes.userId, userId), ...conditions))
    .orderBy(desc(sql`${titleScore}`), desc(notes.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    path: r.path,
    updatedAt: r.updatedAt.toISOString(),
    titleMatches: findTerms(r.title, terms),
    ...makeSnippet(r.body, terms),
  }));
}
