// Migração de tarefas do Bullet Journal: transformações de linhas puras
// (sem banco, sem editor), no formato do plugin do Obsidian.
//
//   - "[ ]" migrada fica na origem como "[>]" (ou "[<]" se foi para um mês
//     ou para o Future Log); o destino recebe "- [ ] texto".
//   - "[o]" (evento) sai da origem e vai igual para o destino.
//   - "[x]", "[-]", "[>]", "[<]", "[/]" não se movem.
//   - Item de lista sem checkbox sai da origem e vira "- texto";
//     texto solto sai da origem e vira "- [ ] texto".

import {
  addDays,
  addMonths,
  BACKLOG,
  type Day,
  dailyRef,
  dailyTemplate,
  FUTURE_LOG,
  futureLogSection,
  futureLogTemplate,
  isoMonth,
  monthlyRef,
  monthlyTemplate,
  type NoteRef,
} from "./bujo";
import { normalizeState, TASK_LINE_RE, type TaskState } from "./tasks";

// ---------- Classificação de linhas ----------

const BULLET_RE = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s/;
const FENCE_RE = /^\s*(```|~~~)/;

export type LineInfo =
  | { kind: "task"; indent: string; state: TaskState; rest: string }
  | { kind: "bullet"; indent: string; text: string }
  | { kind: "text"; indent: string; text: string }
  | { kind: "heading" }
  | { kind: "blank" };

export function classifyLine(line: string): LineInfo {
  if (line.trim() === "") return { kind: "blank" };
  if (HEADING_RE.test(line)) return { kind: "heading" };
  const t = TASK_LINE_RE.exec(line);
  if (t) return { kind: "task", indent: t[1], state: normalizeState(t[3]), rest: line.slice(t[0].length) };
  const b = BULLET_RE.exec(line);
  if (b) return { kind: "bullet", indent: b[1], text: b[2] };
  const indent = /^\s*/.exec(line)![0];
  return { kind: "text", indent, text: line.slice(indent.length) };
}

/** Largura da indentação (tab = 4 colunas). */
function indentWidth(ws: string): number {
  let w = 0;
  for (const c of ws) w += c === "\t" ? 4 : 1;
  return w;
}

const leading = (line: string) => /^\s*/.exec(line)![0];

/** Tira a indentação base, mantendo a relativa. */
function relIndent(line: string, base: string): string {
  const ws = leading(line);
  if (ws.startsWith(base)) return ws.slice(base.length);
  return ws.slice(Math.min(ws.length, base.length));
}

/** "texto" depois do checkbox, sem o espaço inicial (preserva o sinalizador). */
const taskText = (rest: string) => rest.replace(/^\s/, "");

/** "- [ ] texto" a partir do resto da linha depois do checkbox. */
export const openTaskLine = (rest: string) => `- [ ] ${taskText(rest)}`;

/** Troca o estado da tarefa na linha (null se não for tarefa). */
export function setTaskState(line: string, state: TaskState): string | null {
  const m = TASK_LINE_RE.exec(line);
  if (!m) return null;
  const at = m[0].length - 2;
  return line.slice(0, at) + state + line.slice(at + 1);
}

/** Linha do destino para uma tarefa aberta (só a linha, sem indentação). */
export function destLineForTask(line: string): string | null {
  const info = classifyLine(line);
  return info.kind === "task" ? openTaskLine(info.rest) : null;
}

// ---------- Mover a partir da nota (editor) ----------

export type MovePlan =
  | {
      ok: true;
      /** Linhas [start, end] da origem (0…) trocadas por `origin`. */
      start: number;
      end: number;
      origin: string[];
      /** Linhas a gravar no destino. */
      dest: string[];
    }
  | { ok: false; error: string };

type Step = { origin: string | null; dest: string | null };

/** O que fazer com uma linha "principal" (a do cursor ou uma selecionada). */
function mainStep(line: string, scheduled: boolean, base: string): Step | null {
  const info = classifyLine(line);
  const ind = relIndent(line, base);
  switch (info.kind) {
    case "task":
      if (info.state === " ") {
        if (taskText(info.rest).trim() === "") return null;
        return { origin: setTaskState(line, scheduled ? "<" : ">"), dest: ind + openTaskLine(info.rest) };
      }
      if (info.state === "o") return { origin: null, dest: ind + line.trimStart() };
      return null; // resolvida: não se move
    case "bullet":
      if (info.text.trim() === "") return null;
      return { origin: null, dest: `${ind}- ${info.text}` };
    case "text":
      return { origin: null, dest: `${ind}- [ ] ${info.text}` };
    default:
      return null;
  }
}

/** Subitem que acompanha a linha do cursor. */
function childStep(line: string, scheduled: boolean, base: string): Step {
  const info = classifyLine(line);
  const ind = relIndent(line, base);
  if (info.kind === "task") {
    if (info.state === " " || info.state === "o") return mainStep(line, scheduled, base) ?? { origin: line, dest: null };
    return { origin: line, dest: null }; // resolvida: fica e não vai
  }
  // Notas soltas indentadas: copiadas, e também ficam na origem.
  return { origin: line, dest: ind + line.trimStart() };
}

/**
 * Plano para mover as linhas [fromLine, toLine] (0…) de `lines`.
 * Uma linha só (cursor): os subitens indentados vão junto.
 * `scheduled`: o destino é um mês/Future Log ("[<]" em vez de "[>]").
 */
export function planMove(lines: string[], fromLine: number, toLine: number, scheduled: boolean): MovePlan {
  if (fromLine > toLine) [fromLine, toLine] = [toLine, fromLine];
  const steps: Step[] = [];

  if (fromLine === toLine) {
    const line = lines[fromLine] ?? "";
    const base = leading(line);
    const head = mainStep(line, scheduled, base);
    if (!head) {
      const info = classifyLine(line);
      return {
        ok: false,
        error:
          info.kind === "task"
            ? "Esta tarefa já foi resolvida (concluída, migrada ou cancelada)."
            : "Não há tarefa nesta linha para migrar.",
      };
    }
    steps.push(head);
    const width = indentWidth(base);
    let end = fromLine;
    for (let i = fromLine + 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.trim() === "" || indentWidth(leading(l)) <= width) break;
      steps.push(childStep(l, scheduled, base));
      end = i;
    }
    toLine = end;
  } else {
    // Seleção: cada linha por si; indentação relativa à menor das que vão.
    const candidates = lines.slice(fromLine, toLine + 1);
    const movable = candidates.filter((l) => mainStep(l, scheduled, "") !== null);
    if (movable.length === 0) return { ok: false, error: "Não há tarefas na seleção para migrar." };
    const base = movable.map(leading).reduce((a, b) => (indentWidth(b) < indentWidth(a) ? b : a));
    for (const l of candidates) steps.push(mainStep(l, scheduled, base) ?? { origin: l, dest: null });
  }

  return {
    ok: true,
    start: fromLine,
    end: toLine,
    origin: steps.flatMap((s) => (s.origin === null ? [] : [s.origin])),
    dest: steps.flatMap((s) => (s.dest === null ? [] : [s.dest])),
  };
}

// ---------- Onde escrever no destino ----------

/** No fim do arquivo. */
export function appendLines(body: string, add: string[]): string {
  if (body === "") return add.join("\n") + "\n";
  return (body.endsWith("\n") ? body : body + "\n") + add.join("\n") + "\n";
}

/** Títulos fora de blocos de código: índice e nível. */
function headings(lines: string[]): { i: number; level: number }[] {
  const out: { i: number; level: number }[] = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (FENCE_RE.test(l)) fence = !fence;
    else if (!fence) {
      const m = HEADING_RE.exec(l);
      if (m) out.push({ i, level: m[1].length });
    }
  });
  return out;
}

/**
 * No fim da seção `heading` (antes do próximo título de nível igual ou
 * maior), logo depois do último item, sem linhas em branco entre itens.
 * null se a seção não existe.
 */
export function insertInSection(body: string, heading: string, add: string[]): string | null {
  const lines = body.split("\n");
  const hs = headings(lines);
  const h = hs.find((x) => lines[x.i].trim() === heading.trim());
  if (!h) return null;
  const next = hs.find((x) => x.i > h.i && x.level <= h.level);
  const end = next ? next.i : lines.length;
  let last = h.i;
  for (let i = h.i + 1; i < end; i++) if (lines[i].trim() !== "") last = i;
  const block = [...add];
  // Encostado no próximo título: deixa uma linha em branco antes dele.
  if (next && last + 1 === next.i) block.push("");
  lines.splice(last + 1, 0, ...block);
  return lines.join("\n");
}

/** Bloco novo no fim do arquivo, separado por uma linha em branco. */
function appendBlock(body: string, block: string[]): string {
  const t = body.replace(/\s+$/, "");
  return (t ? t + "\n\n" : "") + block.join("\n") + "\n";
}

export const TASKS_SECTION = "## Tarefas";

/** Nota do mês: fim da seção "## Tarefas" (criada antes do 1º "## " se faltar). */
export function insertInMonthly(body: string, add: string[]): string {
  const done = insertInSection(body, TASKS_SECTION, add);
  if (done !== null) return done;
  const lines = body.split("\n");
  const first = headings(lines).find((x) => x.level === 2);
  if (!first) return appendBlock(body, [TASKS_SECTION, ...add]);
  lines.splice(first.i, 0, TASKS_SECTION, ...add, "");
  return lines.join("\n");
}

/** Future Log: seção "## 2026-12 · Dezembro 2026", criada na ordem das datas. */
export function insertInFutureLog(body: string, month: Day, add: string[]): string {
  const heading = futureLogSection(month);
  const done = insertInSection(body, heading, add);
  if (done !== null) return done;
  const key = isoMonth(month);
  const lines = body.split("\n");
  const after = headings(lines).find((x) => {
    const m = /^##\s+(\d{4}-\d{2})\b/.exec(lines[x.i]);
    return x.level === 2 && m !== null && m[1] > key;
  });
  if (!after) return appendBlock(body, [heading, ...add]);
  lines.splice(after.i, 0, heading, ...add, "");
  return lines.join("\n");
}

// ---------- Destinos ----------

export type Destination = "today" | "tomorrow" | "month" | "nextMonth" | "backlog";

export const DESTINATIONS: { key: Destination; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "tomorrow", label: "Amanhã" },
  { key: "month", label: "Mês atual" },
  { key: "nextMonth", label: "Próximo mês" },
  { key: "backlog", label: "Pendências" },
];

export const isDestination = (s: unknown): s is Destination =>
  DESTINATIONS.some((d) => d.key === s);

export const BACKLOG_TEMPLATE = "# Pendências\n#BulletJournal\n\n";

export type DestinationSpec = {
  ref: NoteRef;
  template: string;
  /** Vai para um mês/Future Log: a origem fica "[<]". */
  scheduled: boolean;
  insert: (body: string, add: string[]) => string;
};

export function destinationSpec(dest: Destination, today: Day, habits: string[] = []): DestinationSpec {
  switch (dest) {
    case "today":
    case "tomorrow": {
      const d = dest === "today" ? today : addDays(today, 1);
      return { ref: dailyRef(d), template: dailyTemplate(d), scheduled: false, insert: appendLines };
    }
    case "month":
      return {
        ref: monthlyRef(today),
        template: monthlyTemplate(today, habits),
        scheduled: true,
        insert: insertInMonthly,
      };
    case "nextMonth": {
      const next = addMonths(today, 1);
      return {
        ref: FUTURE_LOG,
        template: futureLogTemplate(),
        scheduled: true,
        insert: (body, add) => insertInFutureLog(body, next, add),
      };
    }
    case "backlog":
      return { ref: BACKLOG, template: BACKLOG_TEMPLATE, scheduled: false, insert: appendLines };
  }
}

// ---------- Listas de tarefas (migração e pendências) ----------

export type OpenTask = {
  /** Linha (0…) no corpo. */
  line: number;
  /** Linha exata (para detectar se mudou). */
  raw: string;
  /** Texto para mostrar. */
  text: string;
};

/** Tarefas "[ ]" com texto, fora de blocos de código. */
export function openTasks(body: string): OpenTask[] {
  const out: OpenTask[] = [];
  let fence = false;
  body.split("\n").forEach((raw, line) => {
    if (FENCE_RE.test(raw)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    const info = classifyLine(raw);
    if (info.kind !== "task" || info.state !== " ") return;
    const text = taskText(info.rest).trim();
    if (text) out.push({ line, raw, text });
  });
  return out;
}

export type BacklogGroup = { heading: string | null; level: number; tasks: OpenTask[] };

/** Itens abertos das Pendências, agrupados pelos títulos "##".."######". */
export function backlogGroups(body: string): BacklogGroup[] {
  const lines = body.split("\n");
  const hs = headings(lines).filter((h) => h.level >= 2);
  const groups: BacklogGroup[] = [{ heading: null, level: 0, tasks: [] }];
  const byLine = new Map(hs.map((h) => [h.i, h.level]));
  const tasks = new Map(openTasks(body).map((t) => [t.line, t]));
  lines.forEach((l, i) => {
    const level = byLine.get(i);
    if (level !== undefined) {
      groups.push({ heading: l.replace(/^\s*#+\s+/, "").trim(), level, tasks: [] });
      return;
    }
    const t = tasks.get(i);
    if (t) groups[groups.length - 1].tasks.push(t);
  });
  return groups.filter((g) => g.tasks.length > 0);
}

const RESOLVED: TaskState[] = ["x", "-", ">", "<"];

/** Tira as linhas resolvidas ([x], [-], [>], [<]); [o] e o resto ficam. */
export function cleanResolved(body: string): { body: string; removed: number } {
  let removed = 0;
  let fence = false;
  const kept = body.split("\n").filter((l) => {
    if (FENCE_RE.test(l)) fence = !fence;
    if (fence) return true;
    const info = classifyLine(l);
    if (info.kind === "task" && RESOLVED.includes(info.state)) {
      removed++;
      return false;
    }
    return true;
  });
  return { body: kept.join("\n"), removed };
}
