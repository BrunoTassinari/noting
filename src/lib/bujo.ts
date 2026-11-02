// Bullet Journal: datas, caminhos, títulos e modelos das notas periódicas,
// no mesmo formato do plugin do Obsidian (locale pt-br).
//
// Datas são "dias de calendário" (sem fuso): use `day(y, m, d)` ou
// `parseDay("2026-11-02")`; "hoje" vem do relógio do navegador (`today()`).

export const BUJO_ROOT = "Bullet Journal";
export const DAILY_FOLDER = `${BUJO_ROOT}/Daily`;
export const WEEKLY_FOLDER = `${BUJO_ROOT}/Weekly`;
export const MONTHLY_FOLDER = `${BUJO_ROOT}/Monthly`;
export const LISTS_FOLDER = `${BUJO_ROOT}/Listas`;
export const BACKLOG = { path: BUJO_ROOT, title: "Pendências" } as const;
export const FUTURE_LOG = { path: BUJO_ROOT, title: "Future Log" } as const;

/** Lista padrão de hábitos (defaultHabits do plugin, sem o "..." de exemplo). */
export const DEFAULT_HABITS = ["Exercício", "Leitura", "Alongamento WU", "Estudar", "Passeio"];

export const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Dia de calendário (meia-noite UTC; só ano/mês/dia importam). */
export type Day = Date;

export const day = (y: number, m: number, d: number): Day => new Date(Date.UTC(y, m - 1, d));
export const addDays = (d: Day, n: number): Day => new Date(d.getTime() + n * 86_400_000);
export const sameDay = (a: Day, b: Day) => a.getTime() === b.getTime();

/** Hoje no relógio local (navegador ou servidor). */
export function today(now = new Date()): Day {
  return day(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** "2026-11-02" → Day (ou null). */
export function parseDay(s: string): Day | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = day(+m[1], +m[2], +m[3]);
  return d.getUTCDate() === +m[3] ? d : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const Y = (d: Day) => d.getUTCFullYear();
const M = (d: Day) => d.getUTCMonth() + 1;
const D = (d: Day) => d.getUTCDate();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-11-02" */
export const isoDay = (d: Day) => `${Y(d)}-${pad(M(d))}-${pad(D(d))}`;
/** "2026-11" */
export const isoMonth = (d: Day) => `${Y(d)}-${pad(M(d))}`;

// ---------- Semana (locale pt-br do moment: começa no domingo; a semana 1
// é a que contém 1º de janeiro) ----------

const sundayOf = (d: Day) => addDays(d, -d.getUTCDay());

/** Ano e número da semana do locale (gggg e ww). */
export function localeWeek(d: Day): { year: number; week: number } {
  const sunday = sundayOf(d);
  // O ano da semana é o do sábado dela (a semana que contém 1º/jan é a 1).
  const year = Y(addDays(sunday, 6));
  const firstSunday = sundayOf(day(year, 1, 1));
  return { year, week: Math.round((sunday.getTime() - firstSunday.getTime()) / (7 * 86_400_000)) + 1 };
}

/** Segunda-feira da semana do locale (a semana começa no domingo anterior). */
export const mondayOf = (d: Day) => addDays(sundayOf(d), 1);

// ---------- Caminhos e títulos (nome do arquivo sem .md) ----------

export type NoteRef = { path: string; title: string };

/** Bullet Journal/Daily/2026.11.02 */
export const dailyRef = (d: Day): NoteRef => ({
  path: DAILY_FOLDER,
  title: `${Y(d)}.${pad(M(d))}.${pad(D(d))}`,
});

/** Bullet Journal/Weekly/2026.W42 */
export function weeklyRef(d: Day): NoteRef {
  const { year, week } = localeWeek(d);
  return { path: WEEKLY_FOLDER, title: `${year}.W${pad(week)}` };
}

/** Bullet Journal/Monthly/2026.novembro */
export const monthlyRef = (d: Day): NoteRef => ({
  path: MONTHLY_FOLDER,
  title: `${Y(d)}.${MONTHS[M(d) - 1]}`,
});

export const refLink = (r: NoteRef) => `${r.path}/${r.title}`;

/** Título da nota "Bullet Journal/Daily/2026.11.02" → Day (ou null). */
export function dayFromDaily(r: NoteRef): Day | null {
  if (r.path !== DAILY_FOLDER) return null;
  const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(r.title);
  return m ? parseDay(`${m[1]}-${m[2]}-${m[3]}`) : null;
}

/** "2026.novembro" na pasta Monthly → 1º dia do mês (ou null). */
export function monthFromMonthly(r: NoteRef): Day | null {
  if (r.path !== MONTHLY_FOLDER) return null;
  const m = /^(\d{4})\.(\p{L}+)$/u.exec(r.title);
  if (!m) return null;
  const i = MONTHS.indexOf(m[2].toLowerCase());
  return i === -1 ? null : day(+m[1], i + 1, 1);
}

export const firstOfMonth = (d: Day) => day(Y(d), M(d), 1);
export const addMonths = (d: Day, n: number) => day(Y(d), M(d) + n, 1);

// ---------- Modelos ----------

/** "Sábado, 31 de outubro de 2026" */
export const dailyHeading = (d: Day) =>
  `${cap(WEEKDAYS[d.getUTCDay()])}, ${D(d)} de ${MONTHS[M(d) - 1]} de ${Y(d)}`;

const ddmm = (d: Day) => `${pad(D(d))}/${pad(M(d))}`;

export function dailyTemplate(d: Day): string {
  const prev = addDays(d, -1);
  const next = addDays(d, 1);
  const month = monthlyRef(d);
  return [
    `# ${dailyHeading(d)}`,
    "#BulletJournal/Daily",
    "",
    `[[${refLink(dailyRef(prev))}|← ${ddmm(prev)}]] · [[${refLink(month)}|${MONTHS[M(d) - 1]} ${Y(d)}]] · [[${refLink(dailyRef(next))}|${ddmm(next)} →]]`,
    "",
    "```bujo-dia",
    "```",
    "",
    "## Log",
    "",
  ].join("\n");
}

export function weeklyTemplate(d: Day): string {
  const ref = weeklyRef(d);
  const monday = mondayOf(d);
  const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
  return [
    `# Semana ${ref.title}`,
    "#BulletJournal/Weekly",
    "",
    days.map((x) => `[[${refLink(dailyRef(x))}|${WEEKDAYS_SHORT[x.getUTCDay()]}]]`).join(" · "),
    "",
    "## Destaques",
    "- ",
    "",
    "## Levar para a weekly",
    "- ",
    "",
    "## Dia a dia",
    ...days.map((x) => `- **${cap(WEEKDAYS_SHORT[x.getUTCDay()])}**: `),
    "",
  ].join("\n");
}

export function monthlyTemplate(d: Day, habits: string[] = DEFAULT_HABITS): string {
  const prev = addMonths(d, -1);
  const next = addMonths(d, 1);
  return [
    `# ${cap(MONTHS[M(d) - 1])} ${Y(d)}`,
    "#BulletJournal/Monthly",
    "",
    `[[${refLink(monthlyRef(prev))}|← ${MONTHS[M(prev) - 1]}]] · [[${refLink(FUTURE_LOG)}|Future Log]] · [[${refLink(monthlyRef(next))}|${MONTHS[M(next) - 1]} →]]`,
    "",
    "## Tarefas",
    "",
    "",
    "## Dias memoráveis",
    "",
    "",
    "## O que vi e li",
    "",
    "",
    "## Hábitos",
    "",
    "```bujo-habits",
    `month: ${isoMonth(d)}`,
    ...habits.map((h) => `- ${h}`),
    "```",
    "",
    "## Humor e temperatura",
    "",
    "```bujo-humor",
    `month: ${isoMonth(d)}`,
    "```",
    "",
  ].join("\n");
}

export const futureLogTemplate = () => ["# Future Log", "#BulletJournal", "", ""].join("\n");

/** Título de seção do Future Log: "## 2026-12 · Dezembro 2026" */
export const futureLogSection = (d: Day) => `## ${isoMonth(d)} · ${cap(MONTHS[M(d) - 1])} ${Y(d)}`;

// ---------- Navegação e Future Log → mês ----------

export type PeriodicKind = "day" | "week" | "month";

/** Caminho e modelo da nota do dia/semana/mês que contém `d`. */
export function periodicNote(kind: PeriodicKind, d: Day): { ref: NoteRef; template: string } {
  if (kind === "week") return { ref: weeklyRef(d), template: weeklyTemplate(d) };
  if (kind === "month") return { ref: monthlyRef(d), template: monthlyTemplate(d) };
  return { ref: dailyRef(d), template: dailyTemplate(d) };
}

/** Nota periódica aberta → tipo e uma data dentro do período (ou null). */
export function periodOf(r: NoteRef): { kind: PeriodicKind; day: Day } | null {
  const daily = dayFromDaily(r);
  if (daily) return { kind: "day", day: daily };
  const week = weekStartFromWeekly(r);
  if (week) return { kind: "week", day: week };
  const month = monthFromMonthly(r);
  if (month) return { kind: "month", day: month };
  return null;
}

/** Mesmo período deslocado `n` vezes (dias, semanas ou meses). */
export function shiftPeriod(kind: PeriodicKind, d: Day, n: number): Day {
  if (kind === "week") return addDays(d, 7 * n);
  if (kind === "month") return addMonths(d, n);
  return addDays(d, n);
}

/** "2026.W45" na pasta Weekly → domingo que começa a semana (ou null). */
export function weekStartFromWeekly(r: NoteRef): Day | null {
  if (r.path !== WEEKLY_FOLDER) return null;
  const m = /^(\d{4})\.W(\d{2})$/.exec(r.title);
  if (!m) return null;
  const start = addDays(sundayOf(day(+m[1], 1, 1)), (+m[2] - 1) * 7);
  // Confere a volta (ex.: W53 que não existe naquele ano).
  return weeklyRef(start).title === r.title ? start : null;
}

/** "- [ ] tarefa" em qualquer indentação: prefixo até o "[" e o estado. */
const TASK_STATE_RE = /^(\s*[-*+]\s+\[)([ xX><\-o/])\](?=\s|$)/;

/**
 * Migra a seção do mês `d` do Future Log ("## 2026-12 · Dezembro 2026"):
 *   - [ ] (e [/]) → copiadas; na origem viram [>];
 *   - [o] e notas soltas → copiadas, origem intacta;
 *   - [x], [>], [<], [-] → ficam (com os sub-itens).
 * Sub-itens acompanham o item de cima. Devolve as linhas copiadas e o Future
 * Log atualizado, ou null se a seção não existe ou não tem nada a copiar.
 */
export function migrateFutureLog(futureLog: string, d: Day): { items: string[]; futureLog: string } | null {
  const lines = futureLog.split("\n");
  const key = `## ${isoMonth(d)}`;
  const start = lines.findIndex((l) => l.trimEnd() === key || l.startsWith(`${key} `));
  if (start === -1) return null;
  const items: string[] = [];
  let changed = false;
  let skipping = false; // dentro dos sub-itens de um item que não é copiado
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,2}\s/.test(line)) break; // próxima seção
    if (line.trim() === "") continue;
    const child = /^\s/.test(line);
    if (child && skipping) continue;
    const m = TASK_STATE_RE.exec(line);
    const state = m?.[2];
    if (state && state !== " " && state !== "/" && state !== "o") {
      if (!child) skipping = true;
      continue;
    }
    if (!child) skipping = false;
    items.push(line);
    if (m && (state === " " || state === "/")) {
      lines[i] = `${m[1]}>]${line.slice(m[0].length)}`;
      changed = true;
    }
  }
  if (items.length === 0) return null;
  return { items, futureLog: changed ? lines.join("\n") : futureLog };
}

/** Põe `items` logo abaixo de "## Tarefas" (corpo do modelo mensal). */
export function withMonthTasks(body: string, items: string[]): string {
  const lines = body.split("\n");
  const i = lines.indexOf("## Tarefas");
  if (i === -1 || items.length === 0) return body;
  let end = i + 1;
  while (end < lines.length && lines[end].trim() === "") end++;
  return [...lines.slice(0, i + 1), "", ...items, "", ...lines.slice(end)].join("\n");
}
