// Tópicos (títulos) de uma nota em Markdown, para o painel de outline.

export type Heading = { level: number; text: string; line: number };

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** Limpa a marcação para exibir: [[Nota|apelido]] → apelido, **x** → x. */
function plain(text: string): string {
  return text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__|~~|==|\*|_|`)(.+?)\1/g, "$2")
    .trim();
}

/** Títulos ATX (# a ######), ignorando blocos de código. line começa em 1. */
export function parseHeadings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  markdown.split("\n").forEach((raw, i) => {
    const f = FENCE_RE.exec(raw);
    if (f) {
      if (!fence) fence = f[1][0].repeat(f[1].length);
      else if (raw.trim().startsWith(fence)) fence = null;
      return;
    }
    if (fence) return;
    const m = HEADING_RE.exec(raw);
    if (m) out.push({ level: m[1].length, text: plain(m[2]) || m[2], line: i + 1 });
  });
  return out;
}

/** Índice do título em que o cursor está (o último antes da linha). */
export function activeHeadingIndex(headings: Heading[], cursorLine: number | null): number {
  if (cursorLine === null) return -1;
  let idx = -1;
  for (let i = 0; i < headings.length && headings[i].line <= cursorLine; i++) idx = i;
  return idx;
}
