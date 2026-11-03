import { foldWithMap, fold } from "./fold";
import { blankCode, WIKILINK_RE } from "./wikilinks";

// Menções sem link: o nome de uma nota escrito como texto comum em outra
// nota (sem [[ ]]). Mostradas no painel de backlinks, com botão para linkar.

const MD_LINK_RE = /\[[^\]\n]*\]\([^)\n]*\)/g;
const URL_RE = /https?:\/\/\S+/g;
const WORD = /[\p{L}\p{N}_]/u;

/** Intervalos [início, fim) do nome como palavra inteira, fora de links e código. */
export function findMentions(body: string, title: string): [number, number][] {
  const needle = fold(title.trim());
  if (needle.length < 3) return [];
  const blank = (m: string) => m.replace(/[^\n]/g, " ");
  // Trechos que não contam: código, [[links]], [links](url), URLs, frontmatter e títulos #.
  let text = blankCode(body).replace(WIKILINK_RE, blank).replace(MD_LINK_RE, blank).replace(URL_RE, blank);
  text = text.replace(/^---\n[\s\S]*?\n---(?=\n|$)/, blank);
  const { folded, map } = foldWithMap(text);
  const out: [number, number][] = [];
  for (let at = folded.indexOf(needle); at !== -1; at = folded.indexOf(needle, at + needle.length)) {
    const before = folded[at - 1];
    const after = folded[at + needle.length];
    if ((before && WORD.test(before)) || (after && WORD.test(after))) continue;
    out.push([map[at], map[at + needle.length]]);
  }
  return out;
}

/** Trecho em volta de uma menção. */
export function mentionSnippet(body: string, [a, b]: [number, number]): { text: string; hit: [number, number] } {
  let start = Math.max(0, a - 50);
  let end = Math.min(body.length, b + 70);
  const ls = body.lastIndexOf("\n", a - 1);
  if (ls >= start) start = ls + 1;
  const le = body.indexOf("\n", b);
  if (le !== -1 && le < end) end = le;
  const prefix = start > 0 && body[start - 1] !== "\n" ? "…" : "";
  const text = prefix + body.slice(start, end) + (end < body.length && body[end] !== "\n" ? "…" : "");
  return { text, hit: [a - start + prefix.length, b - start + prefix.length] };
}

/** Texto do link que entra no lugar da menção (mantém o texto se a grafia difere). */
export function mentionLink(target: string, title: string, written: string): string {
  return written === title && target === title ? `[[${title}]]` : `[[${target}|${written}]]`;
}
