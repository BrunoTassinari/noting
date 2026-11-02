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
    el.textContent = "•";
    return el;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM() {
    const box = document.createElement("span");
    box.className = `cm-task-box${this.checked ? " cm-task-box-done" : ""}`;
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.setAttribute("aria-label", this.checked ? "Marcar como pendente" : "Marcar como feita");
    box.dataset.taskPos = String(this.pos);
    if (this.checked) {
      box.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
    }
    return box;
  }
  ignoreEvent() {
    return false;
  }
}

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
  const decos: Range<Decoration>[] = [];
  const lineClass = (pos: number, cls: string) =>
    decos.push(Decoration.line({ class: cls }).range(state.doc.lineAt(pos).from));
  const codeRanges: [number, number][] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
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
            const isBullet = node.node.parent?.parent?.name === "BulletList";
            const item = node.node.parent;
            const hasTask = item?.getChild("Task");
            if (hasTask && !isActive(node.from)) {
              // "- [ ] tarefa": some o "- ", fica só a caixinha.
              decos.push(hide.range(node.from, Math.min(node.to + 1, state.doc.lineAt(node.from).to)));
            } else if (isBullet && !isActive(node.from)) {
              decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to));
            } else {
              decos.push(Decoration.mark({ class: "cm-list-mark" }).range(node.from, node.to));
            }
            return;
          }
          case "TaskMarker": {
            const text = state.doc.sliceString(node.from, node.to);
            const checked = /\[[xX]\]/.test(text);
            if (checked) lineClass(node.from, "cm-task-done");
            if (!isActive(node.from)) {
              decos.push(
                Decoration.replace({ widget: new CheckboxWidget(checked, node.from) }).range(
                  node.from,
                  node.to,
                ),
              );
            }
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

/** Clique na caixinha de tarefa alterna [ ] ↔ [x]. */
export const taskToggle = EditorView.domEventHandlers({
  mousedown(event, view) {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-task-pos]");
    if (!target) return false;
    const pos = Number(target.dataset.taskPos);
    const current = view.state.doc.sliceString(pos, pos + 3);
    const next = /\[[xX]\]/.test(current) ? "[ ]" : "[x]";
    view.dispatch({ changes: { from: pos, to: pos + 3, insert: next } });
    event.preventDefault();
    return true;
  },
});
