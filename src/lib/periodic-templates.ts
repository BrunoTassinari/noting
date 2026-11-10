import {
  addDays,
  addMonths,
  type Day,
  dailyHeading,
  dailyRef,
  FUTURE_LOG,
  isoMonth,
  MONTHS,
  mondayOf,
  monthlyRef,
  type PeriodicKind,
  refLink,
  WEEKDAYS_SHORT,
  weeklyRef,
} from "./bujo";
import { fillTemplate, TEMPLATES_FOLDER } from "./templates";

// Notas do dia/semana/mês personalizáveis: se existir "Templates/Nota do dia"
// (ou da semana / do mês), ela vira o modelo dessas notas. Além das variáveis
// comuns ({{title}}, {{date}}… — aqui a data é a do dia da nota), há as do
// Bullet Journal: {{nav}}, {{registro}}, {{dias}}, {{habitos}}, {{humor}}…

export const PERIODIC_TEMPLATE_TITLE: Record<PeriodicKind, string> = {
  day: "Nota do dia",
  week: "Nota da semana",
  month: "Nota do mês",
};

export const isPeriodicTemplate = (n: { path: string; title: string }, kind: PeriodicKind) =>
  n.path === TEMPLATES_FOLDER && n.title === PERIODIC_TEMPLATE_TITLE[kind];

const pad = (n: number) => String(n).padStart(2, "0");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const Y = (d: Day) => d.getUTCFullYear();
const M = (d: Day) => d.getUTCMonth() + 1;
const D = (d: Day) => d.getUTCDate();
const ddmm = (d: Day) => `${pad(D(d))}/${pad(M(d))}`;

/** Variáveis do Bullet Journal (o que cada nota padrão já tem). */
export const PERIODIC_VARS: Record<PeriodicKind, [string, string][]> = {
  day: [
    ["dia", "“Terça-feira, 10 de novembro de 2026”"],
    ["nav", "← ontem · mês · amanhã →"],
    ["registro", "formulário do dia (humor, hábitos…)"],
    ["ontem", "link para ontem"],
    ["amanha", "link para amanhã"],
    ["mes", "link para o mês"],
    ["semana", "link para a semana"],
  ],
  week: [
    ["semana", "título da semana (2026.W46)"],
    ["nav", "links seg · ter · … · sex"],
    ["dias", "lista “Dia a dia” (seg a sex)"],
  ],
  month: [
    ["mes", "“Novembro 2026”"],
    ["nav", "← mês anterior · Future Log · próximo →"],
    ["habitos", "tabela de hábitos do mês"],
    ["humor", "gráfico de humor e temperatura"],
  ],
};

function vars(kind: PeriodicKind, d: Day, habits: string[]): Record<string, string> {
  if (kind === "day") {
    const prev = addDays(d, -1);
    const next = addDays(d, 1);
    const month = monthlyRef(d);
    const ontem = `[[${refLink(dailyRef(prev))}|← ${ddmm(prev)}]]`;
    const amanha = `[[${refLink(dailyRef(next))}|${ddmm(next)} →]]`;
    const mes = `[[${refLink(month)}|${MONTHS[M(d) - 1]} ${Y(d)}]]`;
    return {
      dia: dailyHeading(d),
      nav: `${ontem} · ${mes} · ${amanha}`,
      registro: "```bujo-dia\n```",
      ontem,
      amanha,
      mes,
      semana: `[[${refLink(weeklyRef(d))}|Semana ${weeklyRef(d).title}]]`,
    };
  }
  if (kind === "week") {
    const monday = mondayOf(d);
    const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
    return {
      semana: weeklyRef(d).title,
      nav: days.map((x) => `[[${refLink(dailyRef(x))}|${WEEKDAYS_SHORT[x.getUTCDay()]}]]`).join(" · "),
      dias: days.map((x) => `- **${cap(WEEKDAYS_SHORT[x.getUTCDay()])}**: `).join("\n"),
    };
  }
  const prev = addMonths(d, -1);
  const next = addMonths(d, 1);
  return {
    mes: `${cap(MONTHS[M(d) - 1])} ${Y(d)}`,
    nav: `[[${refLink(monthlyRef(prev))}|← ${MONTHS[M(prev) - 1]}]] · [[${refLink(FUTURE_LOG)}|Future Log]] · [[${refLink(monthlyRef(next))}|${MONTHS[M(next) - 1]} →]]`,
    habitos: ["```bujo-habits", `month: ${isoMonth(d)}`, ...habits.map((h) => `- ${h}`), "```"].join("\n"),
    humor: ["```bujo-humor", `month: ${isoMonth(d)}`, "```"].join("\n"),
  };
}

/** Preenche o modelo personalizado da nota do dia/semana/mês de `d`. */
export function fillPeriodic(source: string, kind: PeriodicKind, d: Day, habits: string[] = []): string {
  const v = vars(kind, d, habits);
  const withVars = source.replace(/\{\{\s*(\p{L}+)\s*\}\}/gu, (m, name: string) => {
    const key = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    return key in v ? v[key] : m;
  });
  const ref = kind === "day" ? dailyRef(d) : kind === "week" ? weeklyRef(d) : monthlyRef(d);
  return fillTemplate(withVars, { title: ref.title, day: new Date(Y(d), M(d) - 1, D(d), 12) });
}

/** Ponto de partida do modelo personalizado: igual à nota padrão do app. */
export const DEFAULT_PERIODIC_SOURCE: Record<PeriodicKind, string> = {
  day: ["# {{dia}}", "#BulletJournal/Daily", "", "{{nav}}", "", "{{registro}}", "", "## Log", ""].join("\n"),
  week: [
    "# Semana {{semana}}",
    "#BulletJournal/Weekly",
    "",
    "{{nav}}",
    "",
    "## Destaques",
    "- ",
    "",
    "## Levar para a weekly",
    "- ",
    "",
    "## Dia a dia",
    "{{dias}}",
    "",
  ].join("\n"),
  month: [
    "# {{mes}}",
    "#BulletJournal/Monthly",
    "",
    "{{nav}}",
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
    "{{habitos}}",
    "",
    "## Humor e temperatura",
    "",
    "{{humor}}",
    "",
  ].join("\n"),
};

/** Alternativas prontas para começar a personalizar. */
export const PERIODIC_PRESETS: Record<PeriodicKind, { key: string; label: string; hint: string; source: string }[]> = {
  day: [
    { key: "atual", label: "O atual", hint: "Registro do dia e Log", source: DEFAULT_PERIODIC_SOURCE.day },
    {
      key: "prioridades",
      label: "Prioridades e encerramento",
      hint: "3 prioridades, Log e revisão do fim do dia",
      source: [
        "# {{dia}}",
        "#BulletJournal/Daily",
        "",
        "{{nav}}",
        "",
        "{{registro}}",
        "",
        "## Principais prioridades",
        "- [ ] ",
        "- [ ] ",
        "- [ ] ",
        "",
        "## Log",
        "",
        "",
        "## Revisão do fim do dia",
        "- Vitória:",
        "- Levar adiante:",
        "- Primeiro passo de amanhã:",
        "",
      ].join("\n"),
    },
  ],
  week: [
    { key: "atual", label: "O atual", hint: "Destaques e dia a dia", source: DEFAULT_PERIODIC_SOURCE.week },
    {
      key: "revisao",
      label: "Revisão e plano",
      hint: "O que avançou, parar/começar/continuar, 3 resultados",
      source: [
        "# Semana {{semana}}",
        "#BulletJournal/Weekly",
        "",
        "{{nav}}",
        "",
        "## O que avançou?",
        "- ",
        "",
        "## Pendências a encerrar",
        "- [ ] ",
        "",
        "## Projetos que precisam de atenção",
        "- [[Nome do projeto]] — próxima ação:",
        "",
        "## O que devo parar, começar ou continuar?",
        "- Parar:",
        "- Começar:",
        "- Continuar:",
        "",
        "## Três resultados para a próxima semana",
        "1. ",
        "2. ",
        "3. ",
        "",
        "## Dia a dia",
        "{{dias}}",
        "",
      ].join("\n"),
    },
  ],
  month: [{ key: "atual", label: "O atual", hint: "Tarefas, hábitos e humor", source: DEFAULT_PERIODIC_SOURCE.month }],
};
