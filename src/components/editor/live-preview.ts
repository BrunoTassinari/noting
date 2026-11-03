import { syntaxTree } from "@codemirror/language";
import type { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { normalizeState, TASK_LABELS, type TaskState } from "@/lib/tasks";
import { bujoRanges } from "./bujo-widgets";

// Renderização ao vivo, no estilo do Obsidian: fora da linha em edição a
// sintaxe Markdown some e o texto aparece formatado; na linha do cursor a
// sintaxe volta a aparecer (em cinza) para editar.

const hide = Decoration.replace({});

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-bullet";
    el.setAttribute("aria-hidden", "true");
    return el;
  }
}

/** "1." de lista numerada, com largura fixa (o texto alinha depois dele). */
class OrderedWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }
  eq(o: OrderedWidget) {
    return o.label === this.label;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-ol-mark";
    el.textContent = this.label;
    return el;
  }
}

// Listas: recuo por nível, texto quebrado alinhado depois do marcador
// (recuo deslocado) e linhas-guia verticais nos níveis de cima, como no
// Obsidian. Larguras em px do marcador de cada tipo (ver theme.ts).
const LIST_INDENT = 26;
const MARK_W = { bullet: 18, ordered: 26, task: 26 } as const;

function listLineStyle(depth: number, markW: number): string {
  const guides = Array.from({ length: depth }, (_, i) => `${i * LIST_INDENT + 8}px 0`);
  let style = `padding-left:${depth * LIST_INDENT + markW}px;text-indent:-${markW}px;`;
  if (guides.length) {
    style +=
      `background-image:${guides.map(() => "linear-gradient(var(--color-border-strong),var(--color-border-strong))").join(",")};` +
      `background-size:1px 100%;background-repeat:no-repeat;background-position:${guides.join(",")};`;
  }
  return style;
}

const ICONS: Partial<Record<TaskState, string>> = {
  x: '<path d="m5 12 5 5 9-10"/>',
  ">": '<path d="m9 6 6 6-6 6"/>',
  "<": '<path d="m15 6-6 6 6 6"/>',
  "-": '<path d="M6 12h12"/>',
  "/": '<path d="M7 17 17 7"/>',
};

/** Caixinha da tarefa, com um visual por estado. */
class CheckboxWidget extends WidgetType {
  constructor(readonly state: TaskState, readonly pos: number) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.state === this.state && other.pos === this.pos;
  }
  toDOM() {
    const box = document.createElement("span");
    const key = { " ": "open", x: "done", ">": "moved", "<": "moved", "-": "cancelled", o: "event", "/": "doing" }[
      this.state
    ];
    box.className = `cm-task-box cm-task-box-${key}`;
    box.dataset.taskPos = String(this.pos);
    if (this.state === " " || this.state === "x") {
      const checked = this.state === "x";
      box.setAttribute("role", "checkbox");
      box.setAttribute("aria-checked", String(checked));
      box.setAttribute("aria-label", checked ? "Marcar como pendente" : "Marcar como feita");
    } else {
      box.setAttribute("role", "img");
      box.setAttribute("aria-label", TASK_LABELS[this.state]);
      box.title = TASK_LABELS[this.state];
    }
    const icon = ICONS[this.state];
    if (icon) {
      box.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
    }
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

/** Classe da linha conforme o estado (riscado, apagado). */
const TASK_LINE_CLASS: Partial<Record<TaskState, string>> = {
  x: "cm-task-done",
  "-": "cm-task-done",
  ">": "cm-task-moved",
  "<": "cm-task-moved",
};

/** Estados fora do Markdown padrão ([>], [-], [o]...): o parser não os reconhece. */
const EXTRA_TASK_RE = /^\[([><\-o/])\](?=\s|$)/;

class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-hr";
    return el;
  }
}

/** Linhas tocadas pela seleção: nelas a sintaxe fica visível. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    const from = state.doc.lineAt(r.from).number;
    const to = state.doc.lineAt(r.to).number;
    for (let l = from; l <= to; l++) lines.add(l);
  }
  return lines;
}

const WIKILINK_RE = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
const TAG_RE = /(^|[\s(])(#[\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/gu;

function build(view: EditorView, focused: boolean): DecorationSet {
  const { state } = view;
  const active = focused ? activeLines(state) : new Set<number>();
  const isActive = (pos: number) => active.has(state.doc.lineAt(pos).number);
  /** Alguma seleção toca o trecho [from, to]? */
  const cursorIn = (from: number, to: number) =>
    focused && state.selection.ranges.some((r) => r.from <= to && r.to >= from);
  const decos: Range<Decoration>[] = [];
  const lineClass = (pos: number, cls: string) =>
    decos.push(Decoration.line({ class: cls }).range(state.doc.lineAt(pos).from));
  // Frontmatter e blocos ```bujo-*```: tratados em bujo-widgets.ts.
  const skip = bujoRanges(state);
  const codeRanges: [number, number][] = [...skip];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        if (skip.some(([a, b]) => node.from >= a && node.to <= b)) return false;
        const name = node.name;
        const m = /^ATXHeading(\d)$/.exec(name);
        if (m) {
          lineClass(node.from, `cm-h cm-h${m[1]}`);
          return;
        }
        switch (name) {
          case "HeaderMark": {
            if (!isActive(node.from) && node.node.parent?.name.startsWith("ATXHeading")) {
              // Esconde "## " (marca + espaço).
              const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
              decos.push(hide.range(node.from, end));
            }
            return;
          }
          case "StrongEmphasis":
            decos.push(Decoration.mark({ class: "cm-strong" }).range(node.from, node.to));
            return;
          case "Emphasis":
            decos.push(Decoration.mark({ class: "cm-em" }).range(node.from, node.to));
            return;
          case "Strikethrough":
            decos.push(Decoration.mark({ class: "cm-strike" }).range(node.from, node.to));
            return;
          case "EmphasisMark":
          case "StrikethroughMark":
            if (!isActive(node.from)) decos.push(hide.range(node.from, node.to));
            return;
          case "InlineCode":
            codeRanges.push([node.from, node.to]);
            decos.push(Decoration.mark({ class: "cm-inline-code" }).range(node.from, node.to));
            return;
          case "CodeMark":
            if (node.node.parent?.name === "InlineCode" && !isActive(node.from)) {
              decos.push(hide.range(node.from, node.to));
            }
            return;
          case "FencedCode":
          case "CodeBlock": {
            codeRanges.push([node.from, node.to]);
            const first = state.doc.lineAt(node.from).number;
            const last = state.doc.lineAt(node.to).number;
            // Cursor dentro do bloco: mostra as cercas ``` para editar.
            let editing = false;
            for (let l = first; l <= last && !editing; l++) editing = active.has(l);
            for (let l = first; l <= last; l++) {
              const line = state.doc.line(l);
              let cls = "cm-codeblock";
              if (l === first) cls += " cm-codeblock-first";
              if (l === last) cls += " cm-codeblock-last";
              const isFence =
                name === "FencedCode" && (l === first || (l === last && /^\s*(`{3,}|~{3,})/.test(line.text)));
              if (isFence) {
                cls += editing ? " cm-codeblock-fence" : " cm-codeblock-fence-hidden";
                if (!editing && line.length > 0) decos.push(hide.range(line.from, line.to));
              }
              decos.push(Decoration.line({ class: cls }).range(line.from));
            }
            return false;
          }
          case "Blockquote": {
            const first = state.doc.lineAt(node.from).number;
            const last = state.doc.lineAt(node.to).number;
            for (let l = first; l <= last; l++) lineClass(state.doc.line(l).from, "cm-quote");
            return;
          }
          case "QuoteMark":
            if (!isActive(node.from)) {
              const end = Math.min(node.to + 1, state.doc.lineAt(node.from).to);
              decos.push(hide.range(node.from, end));
            }
            return;
          case "ListMark": {
            const item = node.node.parent;
            if (!item || item.name !== "ListItem") return;
            const isBullet = item.parent?.name === "BulletList";
            const line = state.doc.lineAt(node.from);
            const taskMarker = item.getChild("Task")?.getChild("TaskMarker") ?? null;
            // "- [>] texto": tarefa com estado do Bullet Journal.
            const extraFrom = node.to + 1;
            const extra =
              isBullet && !taskMarker && state.doc.sliceString(node.to, extraFrom) === " "
                ? EXTRA_TASK_RE.exec(state.doc.sliceString(extraFrom, line.to))
                : null;
            if (extra) {
              const cls = TASK_LINE_CLASS[normalizeState(extra[1])];
              if (cls) lineClass(node.from, cls);
            }
            const isTask = Boolean(taskMarker || extra);
            // Fim do marcador ("- ", "1. ", "- [ ] ") com o espaço depois.
            const markEnd = Math.min(
              line.to,
              (taskMarker ? taskMarker.to : extra ? extraFrom + 3 : node.to) + 1,
            );
            // Como no Obsidian: a marcação só aparece com o cursor nela (ou
            // na indentação); no resto da linha o item continua desenhado.
            const showRaw = cursorIn(line.from, markEnd);
            if (showRaw) {
              decos.push(Decoration.mark({ class: "cm-list-mark" }).range(node.from, node.to));
              return;
            }
            let depth = 0;
            for (let n = item.parent; n; n = n.parent) if (n.name === "ListItem") depth++;
            const kind = isTask ? "task" : isBullet ? "bullet" : "ordered";
            decos.push(
              Decoration.line({ class: "cm-li", attributes: { style: listLineStyle(depth, MARK_W[kind]) } }).range(
                line.from,
              ),
            );
            if (node.from > line.from) decos.push(hide.range(line.from, node.from)); // indentação
            if (kind === "task") {
              // "- " some; a caixinha (com o espaço depois) vira o widget.
              decos.push(hide.range(node.from, Math.min(node.to + 1, line.to)));
              const boxFrom = taskMarker ? taskMarker.from : extraFrom;
              const st = taskMarker
                ? /\[[xX]\]/.test(state.doc.sliceString(taskMarker.from, taskMarker.to))
                  ? "x"
                  : " "
                : normalizeState(extra![1]);
              decos.push(
                Decoration.replace({ widget: new CheckboxWidget(st as TaskState, boxFrom) }).range(boxFrom, markEnd),
              );
            } else if (kind === "bullet") {
              decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, markEnd));
            } else {
              const label = state.doc.sliceString(node.from, node.to);
              decos.push(Decoration.replace({ widget: new OrderedWidget(label) }).range(node.from, markEnd));
            }
            return;
          }
          case "TaskMarker": {
            // Desenhado junto com o ListMark (acima); aqui só a classe da linha.
            const text = state.doc.sliceString(node.from, node.to);
            const cls = TASK_LINE_CLASS[/\[[xX]\]/.test(text) ? "x" : " "];
            if (cls) lineClass(node.from, cls);
            return;
          }
          case "Link": {
            const active = isActive(node.from);
            const url = node.node.getChild("URL");
            const marks = node.node.getChildren("LinkMark");
            if (!active && url && marks.length >= 2) {
              // [texto](url) → só "texto" com cara de link.
              decos.push(hide.range(node.from, marks[0].to));
              decos.push(
                Decoration.mark({
                  class: "cm-link",
                  attributes: { "data-href": state.doc.sliceString(url.from, url.to) },
                }).range(marks[0].to, marks[1].from),
              );
              decos.push(hide.range(marks[1].from, node.to));
            } else {
              decos.push(Decoration.mark({ class: "cm-link-raw" }).range(node.from, node.to));
            }
            return false;
          }
          case "URL":
            if (node.node.parent?.name !== "Link") {
              decos.push(
                Decoration.mark({
                  class: "cm-link",
                  attributes: { "data-href": state.doc.sliceString(node.from, node.to) },
                }).range(node.from, node.to),
              );
            }
            return;
          case "HorizontalRule":
            if (!isActive(node.from)) {
              decos.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to));
            }
            return;
        }
      },
    });

    // [[links]] e #tags não fazem parte do Markdown padrão: busca por regex,
    // fora de trechos de código.
    const inCode = (pos: number) => codeRanges.some(([a, b]) => pos >= a && pos < b);
    const text = state.doc.sliceString(from, to);

    for (const m of text.matchAll(WIKILINK_RE)) {
      const start = from + m.index;
      const end = start + m[0].length;
      if (inCode(start)) continue;
      const target = m[1].trim();
      const attrs = { "data-wikilink": target };
      if (isActive(start)) {
        decos.push(Decoration.mark({ class: "cm-wikilink-raw", attributes: attrs }).range(start, end));
      } else {
        // [[Nota|apelido]] mostra "apelido"; [[Nota]] mostra "Nota".
        const labelStart = m[2] !== undefined ? start + 2 + m[1].length + 1 : start + 2;
        decos.push(hide.range(start, labelStart));
        decos.push(Decoration.mark({ class: "cm-wikilink", attributes: attrs }).range(labelStart, end - 2));
        decos.push(hide.range(end - 2, end));
      }
    }

    for (const m of text.matchAll(TAG_RE)) {
      const start = from + m.index + m[1].length;
      const end = start + m[2].length;
      if (inCode(start)) continue;
      // "# Título" é heading, não tag (o regex exige caractere após o #).
      decos.push(Decoration.mark({ class: "cm-tag" }).range(start, end));
    }
  }

  return Decoration.set(decos, true); // true = ordena
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = build(view, view.hasFocus);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged) {
        this.decorations = build(u.view, u.view.hasFocus);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * Clique na caixinha: alterna [ ] ↔ [x]. Os outros estados ([>], [-], [o]...)
 * não mudam com clique (use Ctrl/Cmd+L para percorrer os estados).
 */
export const taskToggle = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-task-pos]");
    if (!target) return false;
    const pos = Number(target.dataset.taskPos);
    const current = view.state.doc.sliceString(pos, pos + 3);
    let next: string;
    if (current === "[ ]") next = "[x]";
    else if (/\[[xX]\]/.test(current)) next = "[ ]";
    else return false;
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } });
    event.preventDefault();
    return true;
  },
});
