// #tags das notas: leitura (para o grafo) e troca da "tag da pasta" ao mover
// (ex.: "#BulletJournal/Daily" numa nota de "Bullet Journal/Daily").

/** Mesmo padrão do editor: # seguido de letras/números/_-/, com ao menos uma letra. */
const TAG_RE = /(^|[\s(])#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

/** Texto sem blocos de código, código inline e frontmatter (tags lá não contam aqui). */
function proseOnly(body: string): { text: string; fm: string } {
  let fm = "";
  let text = body;
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  if (m) {
    fm = m[1];
    text = " ".repeat(m[0].length) + text.slice(m[0].length);
  }
  // Mantém o tamanho (as posições continuam valendo).
  text = text
    .replace(/^(\s*)(```|~~~)[\s\S]*?^\s*\2[^\n]*$/gm, (s) => s.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length));
  return { text, fm };
}

/** Tags do frontmatter: "tags: [a, b]", "tags: a" ou lista "- a". */
function frontmatterTags(fm: string): string[] {
  const out: string[] = [];
  const lines = fm.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^tags?:\s*(.*)$/i.exec(lines[i]);
    if (!m) continue;
    const inline = m[1].trim();
    if (inline) {
      for (const t of inline.replace(/^\[|\]$/g, "").split(",")) out.push(t.trim().replace(/^["']|["']$/g, ""));
    } else {
      for (let j = i + 1; j < lines.length && /^\s*-\s*/.test(lines[j]); j++) {
        out.push(lines[j].replace(/^\s*-\s*/, "").trim().replace(/^["']|["']$/g, ""));
      }
    }
  }
  return out.map((t) => t.replace(/^#/, "")).filter((t) => /\p{L}/u.test(t) && !/\s/.test(t));
}

/** Tags da nota, sem "#" e sem repetir (a primeira grafia vale). */
export function findTags(body: string): string[] {
  const { text, fm } = proseOnly(body);
  const seen = new Map<string, string>();
  const add = (t: string) => {
    const key = t.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  };
  frontmatterTags(fm).forEach(add);
  for (const m of text.matchAll(TAG_RE)) add(m[2].replace(/\/+$/, ""));
  return [...seen.values()];
}

/** Tag que espelha a pasta: "Bullet Journal/Daily" → "BulletJournal/Daily". */
export const folderTag = (path: string) =>
  path
    .split("/")
    .map((s) => s.replace(/[^\p{L}\p{N}_\-]/gu, ""))
    .filter(Boolean)
    .join("/");

const norm = (t: string) => t.toLowerCase().replace(/[_\-]/g, "");

/**
 * Ao mover a nota de `from` para `to`: a tag que espelha a pasta antiga vira
 * a da pasta nova (na raiz, sai). Outras tags ficam. null = nada a mudar.
 */
export function retagForMove(body: string, from: string, to: string): string | null {
  const oldTag = folderTag(from);
  if (!oldTag) return null;
  const newTag = folderTag(to);
  const { text } = proseOnly(body);
  const hits: { start: number; end: number }[] = [];
  for (const m of text.matchAll(TAG_RE)) {
    if (norm(m[2].replace(/\/+$/, "")) !== norm(oldTag)) continue;
    const start = m.index + m[1].length;
    hits.push({ start, end: start + 1 + m[2].length });
  }
  if (!hits.length) return null;
  let out = body;
  for (const h of hits.reverse()) {
    if (newTag) {
      out = out.slice(0, h.start) + `#${newTag}` + out.slice(h.end);
    } else {
      // Sem pasta: tira a tag; se a linha ficar vazia, tira a linha.
      const lineStart = out.lastIndexOf("\n", h.start - 1) + 1;
      const nl = out.indexOf("\n", h.end);
      const lineEnd = nl === -1 ? out.length : nl;
      const rest = (out.slice(lineStart, h.start) + out.slice(h.end, lineEnd)).trim();
      if (!rest) out = out.slice(0, lineStart) + out.slice(nl === -1 ? lineEnd : lineEnd + 1);
      else out = out.slice(0, h.start).replace(/[ \t]+$/, "") + out.slice(h.end);
    }
  }
  return out === body ? null : out;
}
