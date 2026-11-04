import { BUJO_ROOT } from "./bujo";
import { TEMPLATES_FOLDER } from "./templates";

// "Virar nota": uma linha do BuJo (ideia, pensamento, anotação com subitens)
// vira uma nota no Acervo. A nota nova leva o texto e um "Surgiu em [[dia]]";
// no BuJo, a linha fica com o link para a nota nova (os subitens vão junto).

export type Space = "bujo" | "acervo";
export const PRIVATE_FOLDER = "Pessoal";

export const spaceOf = (path: string): Space =>
  path === BUJO_ROOT || path.startsWith(`${BUJO_ROOT}/`) ? "bujo" : "acervo";

/** Pasta Pessoal (e subpastas): fora do alcance do Claude, salvo se liberado. */
export const isPrivatePath = (path: string) => {
  const p = path.toLowerCase();
  const root = PRIVATE_FOLDER.toLowerCase();
  return p === root || p.startsWith(`${root}/`);
};

/** Áreas sugeridas do Acervo: as que já existem na raiz + as três de sempre. */
export function acervoAreas(folders: string[]): string[] {
  const top = new Set(["Trabalho", "Pessoal", "Conhecimento"]);
  for (const f of folders) {
    const root = f.split("/")[0];
    if (root && root !== BUJO_ROOT && root !== TEMPLATES_FOLDER) top.add(root);
  }
  return [...top];
}

const indentWidth = (ws: string) => ws.replace(/\t/g, "    ").length;
const leading = (line: string) => /^\s*/.exec(line)![0];

// Prefixo da linha: lista/tarefa e sinalizadores (emojis) do começo.
const PREFIX_RE = /^(\s*(?:[-*+]\s+(?:\[[^\]\n]\]\s+)?|\d+[.)]\s+)?)((?:(?:❗|💼|💡|🔔|🌱|⭐|📌)️?\s*)*)/u;

/** Texto da linha sem marcação de lista, tarefa nem sinalizadores. */
export function lineText(line: string): string {
  const m = PREFIX_RE.exec(line)!;
  return line.slice(m[0].length).trim();
}

/** Título a partir do texto: sem Markdown, sem "/", até ~80 caracteres. */
export function suggestTitle(text: string): string {
  let t = text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~#>]/g, "")
    .replace(/[/\\]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > 80) {
    const cut = t.lastIndexOf(" ", 80);
    t = t.slice(0, cut > 40 ? cut : 80).replace(/[,;:.\s-]+$/, "");
  }
  return t;
}

export type PromotePlan =
  | {
      ok: true;
      /** Linhas [start, end] (0…) da origem que saem. */
      start: number;
      end: number;
      title: string;
      /** Corpo da nota nova (sem o "Surgiu em"). */
      body: string;
      /** Linha que fica no lugar, com {{link}} onde entra o [[link]]. */
      replacement: string;
    }
  | { ok: false; error: string };

/**
 * Linha do cursor (com os subitens) ou seleção de linhas.
 * Uma linha: o texto vira o título e o começo da nota; os subitens vêm abaixo.
 */
export function planPromote(lines: string[], from: number, to: number): PromotePlan {
  if (from > to) [from, to] = [to, from];
  let end = to;
  if (from === to) {
    const width = indentWidth(leading(lines[from] ?? ""));
    for (let i = from + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === "" || indentWidth(leading(l)) <= width) break;
      end = i;
    }
  }
  const first = lines[from] ?? "";
  const head = lineText(first);
  if (!head) return { ok: false, error: "Ponha o cursor numa linha com texto (ou selecione as linhas)." };

  // Subitens: tira o recuo comum, mantém a estrutura.
  const rest = lines.slice(from + 1, end + 1);
  const minIndent = rest.filter((l) => l.trim()).reduce((m, l) => Math.min(m, indentWidth(leading(l))), Infinity);
  const dedent = (l: string) => {
    let n = Number.isFinite(minIndent) ? minIndent : 0;
    let i = 0;
    while (n > 0 && i < l.length && (l[i] === " " || l[i] === "\t")) {
      n -= l[i] === "\t" ? 4 : 1;
      i++;
    }
    return l.slice(i);
  };
  const body = [head, ...(rest.length ? ["", ...rest.map(dedent)] : [])].join("\n").trimEnd();

  const prefix = PREFIX_RE.exec(first)![0];
  return {
    ok: true,
    start: from,
    end,
    title: suggestTitle(head),
    body,
    replacement: `${prefix.trimEnd() ? prefix : `${leading(first)}- `}{{link}}`,
  };
}

/** Corpo final da nota nova, com o rastro de onde veio. */
export function promotedBody(body: string, origin: { path: string; title: string } | null): string {
  if (!origin) return `${body}\n`;
  const target = origin.path ? `${origin.path}/${origin.title}` : origin.title;
  return `${body}\n\n---\nSurgiu em [[${target}|${origin.title}]]\n`;
}
