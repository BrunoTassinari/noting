// Extração de [[links]] do Markdown, usada no servidor (tabela links,
// backlinks) e no cliente. Ignora trechos de código.

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n {0,3}\1[^\S\n]*(?=\n|$)|$)/gm;
const INLINE_CODE_RE = /(`+)[^`\n][\s\S]*?\1/g;
export const WIKILINK_RE = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;

/** Troca blocos e trechos de código por espaços (mantém as posições). */
export function blankCode(markdown: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  return markdown.replace(FENCE_RE, blank).replace(INLINE_CODE_RE, blank);
}

export type WikilinkMatch = { target: string; alias?: string; index: number; length: number };

export function findWikilinks(markdown: string): WikilinkMatch[] {
  const text = blankCode(markdown);
  const out: WikilinkMatch[] = [];
  for (const m of text.matchAll(WIKILINK_RE)) {
    const target = m[1].trim();
    if (target) out.push({ target, alias: m[2]?.trim(), index: m.index, length: m[0].length });
  }
  return out;
}

/** Alvos distintos dos [[links]] de uma nota. */
export function extractWikilinkTargets(markdown: string): string[] {
  return [...new Set(findWikilinks(markdown).map((l) => l.target))];
}

/** Nota que aponta para a nota aberta, com o trecho onde o link aparece. */
export type Backlink = { id: string; title: string; path: string; snippet: string };

/** Mesmo conjunto de alvos? (para o autosave saber se precisa reindexar) */
export function sameWikilinkTargets(a: string, b: string): boolean {
  const ta = extractWikilinkTargets(a).sort();
  const tb = extractWikilinkTargets(b).sort();
  return ta.length === tb.length && ta.every((t, i) => t === tb[i]);
}
