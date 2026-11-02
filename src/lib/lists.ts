// Listas do Bullet Journal ("Bullet Journal/Listas/Filmes" etc.) e
// sinalizadores: leitura e edição de itens, linha a linha, sem banco.
//
//   - [x] 🛒 Título ★ 9.5 — comentário
//     - subitem ou nota indentada
//
// Depois do checkbox podem vir emojis (sinalizadores e 🛒); o título vai até
// o bloco de avaliação "★", que tem nota e comentário opcionais ("★ 9.5",
// "★ — comentário", "★ 9.5 — comentário"). Sem "★", a linha toda é título.

import { classifyLine, setTaskState } from "./migrate";
import type { TaskState } from "./tasks";

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^\s{0,3}#{1,6}\s+(.*)$/;

// ---------- Sinalizadores ----------

export const SIGNALS = [
  { emoji: "❗", key: "important", label: "Importante" },
  { emoji: "💼", key: "work", label: "Trabalho" },
  { emoji: "💡", key: "idea", label: "Ideia" },
  { emoji: "🔔", key: "reminder", label: "Lembrança" },
  { emoji: "🌱", key: "habit", label: "Hábito" },
] as const;

export type SignalKey = (typeof SIGNALS)[number]["key"];

export const BUY = "🛒";

const KNOWN = [...SIGNALS.map((s) => s.emoji), BUY];

/** Emojis conhecidos logo depois do checkbox (aceita o seletor de variação U+FE0F). */
const LEAD_RE = new RegExp(`^(?:\\s*(?:${KNOWN.join("|")})\\uFE0F?)+`, "u");

export const isSignalKey = (s: unknown): s is SignalKey => SIGNALS.some((x) => x.key === s);

/** Separa os emojis do começo (sinalizadores, 🛒) do texto. */
export function splitLead(text: string): { lead: string; emojis: string[]; rest: string } {
  const m = LEAD_RE.exec(text);
  if (!m) return { lead: "", emojis: [], rest: text };
  const emojis = KNOWN.filter((e) => m[0].includes(e));
  return { lead: m[0], emojis, rest: text.slice(m[0].length) };
}

// ---------- Avaliação (★ nota — comentário) ----------

const RATING = String.raw`\d{1,3}(?:[.,]\d{1,2})?`;
const EVAL_BODY_RE = new RegExp(`^(?:\\s+(${RATING}))?\\s*(?:—\\s*(.*?))?\\s*$`, "u");
export const RATING_RE = new RegExp(`^${RATING}$`);

export type Evaluation = { title: string; rating: string | null; comment: string | null; hasEval: boolean };

/** "Título ★ 9.5 — comentário" → partes (o primeiro "★" que forma um bloco válido). */
export function parseEvaluation(text: string): Evaluation {
  for (let i = text.indexOf("★"); i !== -1; i = text.indexOf("★", i + 1)) {
    if (i > 0 && !/\s/.test(text[i - 1])) continue;
    const m = EVAL_BODY_RE.exec(text.slice(i + 1));
    if (!m) continue;
    return {
      title: text.slice(0, i).trimEnd(),
      rating: m[1] ?? null,
      comment: m[2] ? m[2] : null,
      hasEval: true,
    };
  }
  return { title: text.trimEnd(), rating: null, comment: null, hasEval: false };
}

/** Bloco de avaliação (" ★ 9.5 — comentário"), ou "" se não há nota nem comentário. */
export function evaluationText(rating: string | null, comment: string | null): string {
  const r = rating?.trim() || null;
  const c = comment?.replace(/\s+/g, " ").trim() || null;
  if (!r && !c) return "";
  return ` ★${r ? ` ${r}` : ""}${c ? ` — ${c}` : ""}`;
}

// ---------- Itens ----------

export type ItemParts = {
  /** Até o checkbox, inclusive: "  - [x]". */
  head: string;
  state: TaskState;
  /** Espaço + emojis do começo, como estão: " 🛒 ". */
  lead: string;
  emojis: string[];
  title: string;
} & Omit<Evaluation, "title">;

/** Partes de uma linha de tarefa (null se não for tarefa). */
export function parseItem(raw: string): ItemParts | null {
  const info = classifyLine(raw);
  if (info.kind !== "task") return null;
  const head = raw.slice(0, raw.length - info.rest.length);
  const { lead, emojis, rest } = splitLead(info.rest);
  const ws = /^\s*/.exec(rest)![0];
  const ev = parseEvaluation(rest.slice(ws.length));
  return { head, state: info.state, lead: lead + ws, emojis, ...ev };
}

/** Troca nota e comentário mantendo o resto da linha (null se não for tarefa). */
export function setItemEvaluation(raw: string, rating: string | null, comment: string | null): string | null {
  const p = parseItem(raw);
  if (!p) return null;
  return p.head + p.lead + p.title + evaluationText(rating, comment);
}

/** Troca o estado (null se não for tarefa). */
export const setItemState = (raw: string, state: TaskState) => setTaskState(raw, state);

/** "- [ ] 🛒 Título" */
export function newItemLine(title: string, state: TaskState, buy: boolean, indent = ""): string {
  const t = title.replace(/\s+/g, " ").trim();
  return `${indent}- [${state}] ${buy ? `${BUY} ` : ""}${t}`;
}

// ---------- Leitura da lista ----------

export type ListItem = {
  /** Linha (0…) no corpo. */
  line: number;
  /** Linha exata (para detectar se mudou). */
  raw: string;
  state: TaskState;
  emojis: string[];
  buy: boolean;
  title: string;
  rating: string | null;
  comment: string | null;
  /** Subitens/notas indentadas: colunas além da indentação do item e a linha sem indentação. */
  children: { indent: number; text: string }[];
  /** Título da seção (##) em que o item está, se houver. */
  section: string | null;
};

const leading = (line: string) => /^\s*/.exec(line)![0];

function indentWidth(ws: string): number {
  let w = 0;
  for (const c of ws) w += c === "\t" ? 4 : 1;
  return w;
}

/** Itens (tarefas) da nota; tarefas indentadas sob outro item viram subitens dele. */
export function parseListItems(body: string): ListItem[] {
  const lines = body.split("\n");
  const out: ListItem[] = [];
  let fence = false;
  let section: string | null = null;
  let current: { item: ListItem; width: number } | null = null;
  lines.forEach((raw, line) => {
    if (FENCE_RE.test(raw)) {
      fence = !fence;
      current = null;
      return;
    }
    if (fence) return;
    if (current && raw.trim() !== "" && indentWidth(leading(raw)) > current.width) {
      current.item.children.push({ indent: indentWidth(leading(raw)) - current.width, text: raw.trim() });
      return;
    }
    current = null;
    const h = HEADING_RE.exec(raw);
    if (h) {
      section = h[1].replace(/#+\s*$/, "").trim() || null;
      return;
    }
    const p = parseItem(raw);
    if (!p) return;
    const item: ListItem = {
      line,
      raw,
      state: p.state,
      emojis: p.emojis,
      buy: p.emojis.includes(BUY),
      title: p.title,
      rating: p.rating,
      comment: p.comment,
      children: [],
      section,
    };
    out.push(item);
    current = { item, width: indentWidth(leading(raw)) };
  });
  return out;
}

/** Itens "a fazer" ou "em andamento". */
export const isOpenState = (s: TaskState) => s === " " || s === "/";

/**
 * Põe `line` logo depois do último item (com os subitens) da lista, na
 * indentação dele; sem itens, no fim do arquivo.
 */
export function insertListItem(body: string, line: string): string {
  const items = parseListItems(body);
  const last = items[items.length - 1];
  if (!last) {
    if (body.trim() === "") return line + "\n";
    return (body.endsWith("\n") ? body : body + "\n") + line + "\n";
  }
  const lines = body.split("\n");
  let end = last.line;
  const width = indentWidth(leading(last.raw));
  for (let i = last.line + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === "" || indentWidth(leading(l)) <= width) break;
    end = i;
  }
  lines.splice(end + 1, 0, leading(last.raw) + line.trimStart());
  return lines.join("\n");
}

// ---------- Sinalizadores em todas as notas ----------

export type SignalItem = {
  line: number;
  raw: string;
  state: TaskState;
  signals: SignalKey[];
  /** Texto depois dos emojis do começo. */
  text: string;
};

/** Tarefas com sinalizador logo depois do checkbox (fora de blocos de código). */
export function signalItems(body: string): SignalItem[] {
  const out: SignalItem[] = [];
  let fence = false;
  body.split("\n").forEach((raw, line) => {
    if (FENCE_RE.test(raw)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const info = classifyLine(raw);
    if (info.kind !== "task") return;
    const { emojis, rest } = splitLead(info.rest);
    const signals = SIGNALS.filter((s) => emojis.includes(s.emoji)).map((s) => s.key);
    if (signals.length === 0) return;
    out.push({ line, raw, state: info.state, signals, text: rest.trim() });
  });
  return out;
}
