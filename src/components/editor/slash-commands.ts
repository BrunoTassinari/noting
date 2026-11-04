import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
  startCompletion,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { loadNoteBody } from "@/components/vault/note-cache";
import { dailyRef, refLink, today } from "@/lib/bujo";
import type { NoteMeta } from "@/lib/note-paths";
import { fillTemplate, TEMPLATES_FOLDER } from "@/lib/templates";

// Menu do "/": digite "/" no começo da linha (ou depois de um espaço) para
// ver comandos; continue digitando para filtrar ("/tar" → Tarefa).

const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

function inCode(ctx: CompletionContext): boolean {
  for (let n: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return true;
  }
  return false;
}

/** Prefixo de bloco no começo da linha: título, citação, lista, tarefa. */
const BLOCK_PREFIX = /^(\s*)(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[^\]\n]\]\s+)?|\d+[.)]\s+)?/;
const TASK_PREFIX = /^(\s*[-*+]\s+\[[^\]\n]\]\s+)/;

/**
 * Remove o "/comando" digitado e troca o prefixo da linha. `make` recebe o
 * texto da linha (sem o comando e sem o prefixo antigo) e devolve a linha nova
 * e onde o cursor fica (relativo ao início da linha).
 */
function rewriteLine(
  view: EditorView,
  from: number,
  to: number,
  make: (indent: string, rest: string, oldPrefix: string) => { text: string; cursor: number },
) {
  const line = view.state.doc.lineAt(from);
  const raw = line.text.slice(0, from - line.from) + line.text.slice(to - line.from);
  const m = BLOCK_PREFIX.exec(raw)!;
  const { text, cursor } = make(m[1], raw.slice(m[0].length), m[0].slice(m[1].length));
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor: line.from + cursor },
    userEvent: "input.complete",
  });
}

const setPrefix = (prefix: string) => (view: EditorView, _c: Completion, from: number, to: number) =>
  rewriteLine(view, from, to, (indent, rest) => {
    const head = indent + prefix;
    return { text: head + rest, cursor: (head + rest).length };
  });

/** Insere texto no lugar do comando; `cursor` = posição dentro do texto inserido. */
const insert = (text: string | (() => string), cursor?: number, then?: (v: EditorView) => void) =>
  (view: EditorView, _c: Completion, from: number, to: number) => {
    const t = typeof text === "function" ? text() : text;
    view.dispatch({
      changes: { from, to, insert: t },
      selection: { anchor: from + (cursor ?? t.length) },
      userEvent: "input.complete",
    });
    then?.(view);
  };

/** Insere um bloco em linhas próprias (se a linha tiver texto, vai na de baixo). */
const insertBlock = (lines: string[], cursorLine: number, cursorCol = 0) =>
  (view: EditorView, _c: Completion, from: number, to: number) => {
    const line = view.state.doc.lineAt(from);
    const rest = (line.text.slice(0, from - line.from) + line.text.slice(to - line.from)).trimEnd();
    const block = lines.join("\n");
    const before = rest ? `${rest}\n` : "";
    const offset = before.length + lines.slice(0, cursorLine).reduce((n, l) => n + l.length + 1, 0) + cursorCol;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: before + block },
      selection: { anchor: line.from + offset },
      userEvent: "input.complete",
    });
  };

/** Sinalizador logo após a caixinha; linha que não é tarefa vira "- [ ] ". */
const flag = (emoji: string) => (view: EditorView, _c: Completion, from: number, to: number) =>
  rewriteLine(view, from, to, (indent, rest, oldPrefix) => {
    const isTask = TASK_PREFIX.test(oldPrefix);
    const head = indent + (isTask ? oldPrefix : "- [ ] ");
    const body = rest.replace(/^(?:❗|💼|💡|🔔|🌱)\s*/u, "");
    const text = `${head}${emoji} ${body}`;
    return { text, cursor: text.length };
  });

/** Estado da tarefa ([x], [-], [o]...) na linha. */
const taskState = (state: string) => (view: EditorView, _c: Completion, from: number, to: number) =>
  rewriteLine(view, from, to, (indent, rest) => {
    const text = `${indent}- [${state}] ${rest}`;
    return { text, cursor: text.length };
  });

const pad = (n: number) => String(n).padStart(2, "0");
const dateText = () => {
  const d = new Date();
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const timeText = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const todayLink = () => {
  const d = new Date();
  return `[[${refLink(dailyRef(today()))}|${pad(d.getDate())}/${pad(d.getMonth() + 1)}]]`;
};

/** Pedido de "Virar nota" (a tela da nota abre o formulário). */
export const PROMOTE_EVENT = "noting-promote";

const BLOCKS: CompletionSection = { name: "Formatação", rank: 0 };
const BUJO: CompletionSection = { name: "Bullet Journal", rank: 1 };
const INSERT: CompletionSection = { name: "Inserir", rank: 2 };
const TEMPLATES: CompletionSection = { name: "Templates", rank: 3 };

/** Troca o "/comando" pelo template (variáveis preenchidas). */
const insertTemplate = (id: string, title: () => string) =>
  (view: EditorView, _c: Completion, from: number, to: number) => {
    const typed = view.state.sliceDoc(from, to);
    void loadNoteBody(id).then((body) => {
      if (body === null) return;
      // Só insere se o "/comando" ainda está lá (a pessoa não seguiu digitando).
      if (view.state.sliceDoc(from, to) !== typed) return;
      const text = fillTemplate(body, { title: title() });
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        userEvent: "input.complete",
        scrollIntoView: true,
      });
      view.focus();
    });
  };

type Cmd = { label: string; detail?: string; keywords?: string; section: CompletionSection; apply: Completion["apply"] };

const COMMANDS: Cmd[] = [
  { label: "Tarefa", detail: "- [ ]", keywords: "todo checkbox", section: BLOCKS, apply: setPrefix("- [ ] ") },
  { label: "Lista", detail: "-", keywords: "bullet marcador", section: BLOCKS, apply: setPrefix("- ") },
  { label: "Lista numerada", detail: "1.", keywords: "numero ordenada", section: BLOCKS, apply: setPrefix("1. ") },
  { label: "Título 1", detail: "#", keywords: "heading h1", section: BLOCKS, apply: setPrefix("# ") },
  { label: "Título 2", detail: "##", keywords: "heading h2", section: BLOCKS, apply: setPrefix("## ") },
  { label: "Título 3", detail: "###", keywords: "heading h3", section: BLOCKS, apply: setPrefix("### ") },
  { label: "Citação", detail: ">", keywords: "quote", section: BLOCKS, apply: setPrefix("> ") },
  { label: "Texto", detail: "sem marcação", keywords: "paragrafo normal", section: BLOCKS, apply: setPrefix("") },
  { label: "Bloco de código", detail: "```", keywords: "code", section: BLOCKS, apply: insertBlock(["```", "", "```"], 1) },
  { label: "Linha divisória", detail: "---", keywords: "separador hr", section: BLOCKS, apply: insertBlock(["---", ""], 1) },
  {
    label: "Tabela",
    detail: "2 colunas",
    keywords: "table",
    section: BLOCKS,
    apply: insertBlock(["| Coluna 1 | Coluna 2 |", "| --- | --- |", "|  |  |"], 2, 2),
  },

  { label: "Evento", detail: "- [o]", keywords: "compromisso", section: BUJO, apply: taskState("o") },
  { label: "Concluir tarefa", detail: "[x]", keywords: "feita done", section: BUJO, apply: taskState("x") },
  { label: "Em andamento", detail: "[/]", keywords: "fazendo", section: BUJO, apply: taskState("/") },
  { label: "Cancelar tarefa", detail: "[-]", keywords: "desisti", section: BUJO, apply: taskState("-") },
  { label: "Importante", detail: "❗", keywords: "sinalizador urgente", section: BUJO, apply: flag("❗") },
  { label: "Trabalho", detail: "💼", keywords: "sinalizador", section: BUJO, apply: flag("💼") },
  { label: "Ideia", detail: "💡", keywords: "sinalizador", section: BUJO, apply: flag("💡") },
  { label: "Lembrança", detail: "🔔", keywords: "sinalizador lembrete", section: BUJO, apply: flag("🔔") },
  { label: "Hábito", detail: "🌱", keywords: "sinalizador", section: BUJO, apply: flag("🌱") },
  {
    label: "Virar nota",
    detail: "levar para o Acervo",
    keywords: "promover extrair nota acervo ideia",
    section: BUJO,
    apply: (view, _c, from, to) => {
      view.dispatch({ changes: { from, to, insert: "" }, userEvent: "input.complete" });
      view.dom.dispatchEvent(new CustomEvent(PROMOTE_EVENT, { bubbles: true }));
    },
  },
  {
    label: "Registro do dia",
    detail: "humor, hábitos…",
    keywords: "bujo-dia formulario",
    section: BUJO,
    apply: insertBlock(["```bujo-dia", "```", ""], 2),
  },

  {
    label: "Link para nota",
    detail: "[[ ]]",
    keywords: "wikilink",
    section: INSERT,
    apply: insert("[[]]", 2, (v) => startCompletion(v)),
  },
  { label: "Link para hoje", detail: "nota do dia", keywords: "data diario", section: INSERT, apply: insert(todayLink) },
  { label: "Data de hoje", detail: "dd/mm/aaaa", keywords: "dia", section: INSERT, apply: insert(dateText) },
  { label: "Hora", detail: "hh:mm", keywords: "agora horario", section: INSERT, apply: insert(timeText) },
  { label: "Tag", detail: "#", keywords: "etiqueta", section: INSERT, apply: insert("#") },
];

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export type SlashContext = () => { templates: NoteMeta[]; title: string };

/** Fonte do menu "/" (com os templates da pasta Templates no fim). */
export function slashCommandSource(get: SlashContext) {
  return (ctx: CompletionContext) => slashCommands(ctx, get);
}

function slashCommands(ctx: CompletionContext, get: SlashContext): CompletionResult | null {
  const m = ctx.matchBefore(/(?:^|[\s(])\/[\p{L}\p{N} ]{0,24}$/u);
  if (!m || inCode(ctx)) return null;
  const slash = m.from + m.text.indexOf("/");
  const query = fold(ctx.state.sliceDoc(slash + 1, ctx.pos).trim());
  // "/ " seguido de espaço sem nada: não é comando.
  if (/^\/\s/.test(ctx.state.sliceDoc(slash, ctx.pos))) return null;

  const words = query.split(/\s+/).filter(Boolean);
  const { templates } = get();
  const title = () => get().title;
  const templateCmds: Cmd[] = templates.length
    ? templates.map((t) => ({
        label: t.title,
        detail: "template",
        keywords: `template modelo ${t.path}`,
        section: TEMPLATES,
        apply: insertTemplate(t.id, title),
      }))
    : [
        {
          label: "Template",
          detail: `crie notas na pasta ${TEMPLATES_FOLDER}`,
          keywords: "modelo",
          section: TEMPLATES,
          apply: insert(""),
        },
      ];
  const options: Completion[] = [...COMMANDS, ...templateCmds].filter((c) => {
    const hay = fold(`${c.label} ${c.keywords ?? ""}`);
    return words.every((w) => hay.includes(w));
  }).map((c) => ({
    label: c.label,
    detail: c.detail,
    section: c.section,
    apply: c.apply,
    type: "slash",
  }));
  if (!options.length) return null;

  // filter: false — já filtramos (por palavras e sem acento).
  return { from: slash, options, filter: false };
}
