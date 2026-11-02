// Frontmatter YAML simples (o que o Bullet Journal grava): chaves com valor
// escalar ou lista. Lê e reescreve só a chave alterada, sem mexer no resto.
//
//   ---
//   humor: 4
//   habitos:
//     - Exercício
//   ---

export type FmValue = string | string[];

export type Frontmatter = {
  /** Posição do primeiro "---" (sempre 0). */
  from: number;
  /** Fim da linha do "---" de fechamento (sem a quebra de linha). */
  to: number;
  /** Texto entre as cercas (sem elas). */
  inner: string;
  /** Início do texto interno no documento. */
  innerFrom: number;
};

const FM_RE = /^---[ \t]*\n([\s\S]*?\n)?---[ \t]*(?=\n|$)/;

export function findFrontmatter(text: string): Frontmatter | null {
  const m = FM_RE.exec(text);
  if (!m) return null;
  const innerFrom = text.indexOf("\n") + 1;
  return { from: 0, to: m[0].length, inner: m[1] ?? "", innerFrom };
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t[0] === '"' ? t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\") : t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

type Entry = { key: string; start: number; end: number; value: FmValue };

/** Linhas do frontmatter agrupadas por chave (cada uma com suas linhas de lista). */
function entries(inner: string): Entry[] {
  const lines = inner.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const out: Entry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^([^\s#:][^:]*?):(?:\s+(.*))?\s*$/.exec(lines[i]);
    if (!m) continue;
    const start = i;
    let raw = (m[2] ?? "").trim();
    let value: FmValue = "";
    const items: string[] = [];
    while (i + 1 < lines.length && /^(\s+\S|-\s)/.test(lines[i + 1])) {
      i++;
      const item = /^\s*-\s+(.*)$/.exec(lines[i]);
      if (item) items.push(unquote(item[1]));
    }
    if (raw.startsWith("[") && raw.endsWith("]")) {
      value = raw
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s))
        .filter(Boolean);
    } else if (!raw && items.length) {
      value = items;
    } else {
      if (raw.startsWith("#")) raw = "";
      value = unquote(raw.replace(/\s+#.*$/, ""));
    }
    out.push({ key: m[1].trim(), start, end: i, value });
  }
  return out;
}

export function readFrontmatter(text: string): Record<string, FmValue> {
  const fm = findFrontmatter(text);
  if (!fm) return {};
  const out: Record<string, FmValue> = {};
  for (const e of entries(fm.inner)) out[e.key] = e.value;
  return out;
}

function scalar(v: string): string {
  // Simples o bastante para ir sem aspas?
  if (/^[\p{L}\p{N}][\p{L}\p{N} _.,()°%-]*$/u.test(v) && !/[ ]$/.test(v)) return v;
  return JSON.stringify(v);
}

function render(key: string, value: FmValue): string[] {
  if (Array.isArray(value)) return [`${key}:`, ...value.map((v) => `  - ${scalar(v)}`)];
  return [`${key}: ${scalar(value)}`];
}

/**
 * Mudanças no documento para definir (ou remover, com null) uma chave.
 * Cria o frontmatter se não houver; remove-o se ficar vazio.
 */
export function setFrontmatterKey(
  text: string,
  key: string,
  value: FmValue | null,
): { from: number; to: number; insert: string } | null {
  const empty = value === null || (Array.isArray(value) ? value.length === 0 : value === "");
  const fm = findFrontmatter(text);
  if (!fm) {
    if (empty) return null;
    return { from: 0, to: 0, insert: `---\n${render(key, value!).join("\n")}\n---\n` };
  }
  const lines = fm.inner.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const e = entries(fm.inner).find((x) => x.key === key);
  if (e) lines.splice(e.start, e.end - e.start + 1, ...(empty ? [] : render(key, value!)));
  else if (!empty) lines.push(...render(key, value!));
  else return null;

  if (lines.every((l) => l.trim() === "")) {
    // Ficou vazio: tira o frontmatter (e a quebra de linha depois dele).
    const to = text[fm.to] === "\n" ? fm.to + 1 : fm.to;
    return { from: 0, to, insert: "" };
  }
  const closing = text.lastIndexOf("\n", fm.to - 1) + 1; // início da linha "---" final
  return { from: fm.innerFrom, to: closing, insert: lines.join("\n") + "\n" };
}
