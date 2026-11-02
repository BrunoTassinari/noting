// Dados do Bullet Journal guardados no frontmatter das notas diárias
// (mesmo formato do plugin do Obsidian) e as linhas que o formulário do dia
// grava na nota do mês. Funções puras: rodam no navegador e no servidor.
//
//   ---
//   humor: 4          (1–5: Péssimo … Ótimo)
//   stress: 2         (1–5: Tranquilo … Muito alto)
//   clima: sol        (sol, parcial, nublado, …)
//   temperatura: 21.5 (°C)
//   cardio: 30        (minutos)
//   habitos:
//     - Exercício
//   ---

import { type Day, DEFAULT_HABITS, dailyRef, day, refLink, WEEKDAYS_SHORT } from "./bujo";
import type { FmValue } from "./frontmatter";

export const HUMOR = ["Péssimo", "Ruim", "Ok", "Bom", "Ótimo"];
export const STRESS = ["Tranquilo", "Leve", "Moderado", "Alto", "Muito alto"];
export const CLIMA = ["sol", "parcial", "nublado", "chuva", "tempestade", "neblina", "vento", "frio"];

export const asScale = (v: FmValue | undefined | null): number | null => {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

export const asNumber = (v: FmValue | undefined | null): number | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export const asList = (v: FmValue | undefined | null): string[] =>
  Array.isArray(v) ? v.filter(Boolean) : typeof v === "string" && v ? [v] : [];

export const asClima = (v: FmValue | undefined | null): string | null =>
  typeof v === "string" && CLIMA.includes(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null;

export type DayData = {
  humor: number | null;
  stress: number | null;
  clima: string | null;
  temperatura: number | null;
  cardio: number | null;
  habitos: string[];
};

/** Frontmatter da nota diária → dados do dia (o que não for válido fica vazio). */
export function dayData(fm: Record<string, FmValue>): DayData {
  const cardio = asNumber(fm.cardio);
  return {
    humor: asScale(fm.humor),
    stress: asScale(fm.stress),
    clima: asClima(fm.clima),
    temperatura: asNumber(fm.temperatura),
    cardio: cardio !== null && cardio >= 0 ? cardio : null,
    habitos: asList(fm.habitos),
  };
}

/** Chaves de valor único que as telas gravam. */
export const SCALAR_KEYS = ["humor", "stress", "clima", "temperatura", "cardio"] as const;
export type ScalarKey = (typeof SCALAR_KEYS)[number];
export const isScalarKey = (k: unknown): k is ScalarKey => SCALAR_KEYS.includes(k as ScalarKey);

/**
 * Valor digitado → texto a gravar no frontmatter; null = apagar a chave;
 * undefined = valor inválido (não grava nada).
 */
export function normalizeValue(key: ScalarKey, raw: string | null): string | null | undefined {
  if (raw === null || raw.trim() === "") return null;
  switch (key) {
    case "humor":
    case "stress": {
      const n = asScale(raw.trim());
      return n === null ? undefined : String(n);
    }
    case "clima":
      return asClima(raw) ?? undefined;
    case "temperatura": {
      const n = asNumber(raw);
      return n === null || Math.abs(n) > 100 ? undefined : String(n);
    }
    case "cardio": {
      const n = asNumber(raw);
      return n === null || n < 0 || n > 1440 ? undefined : String(n);
    }
  }
}

// ---------- Mês ----------

/** "2026-11" → { y, m } (ou null). */
export function parseMonth(s: string): { y: number; m: number } | null {
  const r = /^(\d{4})-(\d{2})$/.exec(s);
  if (!r) return null;
  const y = +r[1];
  const m = +r[2];
  return m >= 1 && m <= 12 && y >= 1900 && y <= 2999 ? { y, m } : null;
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Conteúdo de ```bujo-habits```: "month: 2026-11" e "- Hábito" por linha
 * (o formato antigo "- Hábito: 1, 2" vale; os números são ignorados).
 * Lista vazia → DEFAULT_HABITS.
 */
export function parseHabitsBlock(inner: string): { month: string | null; habits: string[] } {
  const month = /^\s*month:\s*(\d{4}-\d{2})\s*$/m.exec(inner)?.[1] ?? null;
  const habits: string[] = [];
  for (const line of inner.split("\n")) {
    const m = /^\s*[-*+]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const name = m[1].replace(/\s*:\s*[\d\s,;]*$/, "").trim();
    if (name && !habits.includes(name)) habits.push(name);
  }
  return { month, habits: habits.length ? habits : [...DEFAULT_HABITS] };
}

/** Dados de um mês: dia do mês (1…31) → dados (só dias com nota). */
export type MonthDays = Record<number, DayData>;

export type MonthSummary = {
  humorAvg: number | null;
  stressAvg: number | null;
  tempAvg: number | null;
  tempMin: number | null;
  tempMax: number | null;
  cardioTotal: number;
  cardioDays: number;
  climaTop: { value: string; count: number } | null;
  /** Marcados / (hábitos do mês × dias com nota até hoje); null sem dias. */
  habitsPct: number | null;
  habitsDone: number;
  habitsPossible: number;
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function monthSummary(month: string, days: MonthDays, habits: string[], today: Day): MonthSummary {
  const ym = parseMonth(month);
  const entries = Object.entries(days).map(([d, v]) => [Number(d), v] as const);
  const pick = (f: (v: DayData) => number | null) =>
    entries.map(([, v]) => f(v)).filter((x): x is number => x !== null);

  const temps = pick((v) => v.temperatura);
  const cardios = pick((v) => v.cardio);

  const climaCount = new Map<string, number>();
  for (const [, v] of entries) if (v.clima) climaCount.set(v.clima, (climaCount.get(v.clima) ?? 0) + 1);
  let climaTop: MonthSummary["climaTop"] = null;
  // Empate: o que vem primeiro na lista de climas.
  for (const c of CLIMA) {
    const n = climaCount.get(c) ?? 0;
    if (n > 0 && (!climaTop || n > climaTop.count)) climaTop = { value: c, count: n };
  }

  let habitsDone = 0;
  let daysUntilToday = 0;
  if (ym) {
    for (const [d, v] of entries) {
      if (day(ym.y, ym.m, d).getTime() > today.getTime()) continue;
      daysUntilToday++;
      habitsDone += habits.filter((h) => v.habitos.includes(h)).length;
    }
  }
  const habitsPossible = habits.length * daysUntilToday;

  return {
    humorAvg: avg(pick((v) => v.humor)),
    stressAvg: avg(pick((v) => v.stress)),
    tempAvg: avg(temps),
    tempMin: temps.length ? Math.min(...temps) : null,
    tempMax: temps.length ? Math.max(...temps) : null,
    cardioTotal: cardios.reduce((a, b) => a + b, 0),
    cardioDays: cardios.filter((x) => x > 0).length,
    climaTop,
    habitsPct: habitsPossible ? Math.min(100, (habitsDone / habitsPossible) * 100) : null,
    habitsDone,
    habitsPossible,
  };
}

// ---------- Linhas gravadas na nota do mês ----------

export const MEMORABLE_HEADING = "## Dias memoráveis";
export const MEDIA_HEADING = "## O que vi e li";

const pad = (n: number) => String(n).padStart(2, "0");
/** Texto numa linha só (o item da lista não pode quebrar). */
export const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** "- ⭐ [[Bullet Journal/Daily/2026.11.03|03/11 ter]] — Texto" */
export function memorableLine(d: Day, text: string): string {
  const label = `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${WEEKDAYS_SHORT[d.getUTCDay()]}`;
  return `- ⭐ [[${refLink(dailyRef(d))}|${label}]] — ${oneLine(text)}`;
}

export const MEDIA_KINDS = {
  serie: { icon: "📺", label: "Série" },
  filme: { icon: "🎬", label: "Filme" },
  livro: { icon: "📖", label: "Livro" },
  outro: { icon: "🎧", label: "Outro" },
} as const;
export type MediaKind = keyof typeof MEDIA_KINDS;
export const isMediaKind = (k: unknown): k is MediaKind => typeof k === "string" && k in MEDIA_KINDS;

export type MediaEntry = {
  kind: MediaKind;
  title: string;
  /** 1–5 (opcional). */
  stars?: number | null;
  ongoing?: boolean;
  comment?: string;
};

export const starsText = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);

/** "- 📖 **Título** ★★★★☆ _(em andamento)_ — Comentário" (partes opcionais omitidas). */
export function mediaLine(e: MediaEntry): string {
  const parts = [`- ${MEDIA_KINDS[e.kind].icon} **${oneLine(e.title).replace(/\*\*/g, "")}**`];
  if (e.stars && Number.isInteger(e.stars) && e.stars >= 1 && e.stars <= 5) parts.push(starsText(e.stars));
  if (e.ongoing) parts.push("_(em andamento)_");
  let line = parts.join(" ");
  const comment = e.comment ? oneLine(e.comment) : "";
  if (comment) line += ` — ${comment}`;
  return line;
}

/**
 * Põe `line` no fim da seção `heading` (antes do próximo "# "/"## "),
 * depois do último item. Sem a seção, cria no fim do texto.
 */
export function appendToSection(body: string, heading: string, line: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((l) => l.trimEnd() === heading);
  if (start === -1) {
    const head = body.replace(/\s+$/, "");
    return `${head ? `${head}\n\n` : ""}${heading}\n\n${line}\n`;
  }
  let end = lines.length;
  let fence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (!fence && /^#{1,2}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let last = -1;
  for (let i = end - 1; i > start; i--) {
    if (lines[i].trim() !== "") {
      last = i;
      break;
    }
  }
  if (last !== -1) lines.splice(last + 1, 0, line);
  else lines.splice(start + 1, end - start - 1, "", line, "");
  return lines.join("\n");
}

/** Resposta de GET /api/bujo/month?m=AAAA-MM. */
export type MonthData = {
  month: string;
  /** Dia do mês → dados e id da nota diária (só dias com nota). */
  days: Record<number, DayData & { id: string }>;
  /** Hábitos do bloco ```bujo-habits``` da nota do mês (ou os padrão). */
  habits: string[];
};
