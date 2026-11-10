import { codeFolding, foldable, foldedRanges, foldEffect, foldKeymap, syntaxTree, unfoldEffect } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view";

// Recolher seções pelo título (como no Obsidian): uma setinha à esquerda de
// cada # / ## / ### esconde tudo até o próximo título de mesmo nível ou maior.
// A seção recolhida fica guardada no navegador, por nota.

const STORE = "noting-folds:";

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

/** Seção de um título na linha que começa em `lineFrom` (ou null). */
function sectionAt(state: EditorState, lineFrom: number) {
  const line = state.doc.lineAt(lineFrom);
  return foldable(state, line.from, line.to);
}

function foldedAt(state: EditorState, at: number) {
  let found: { from: number; to: number } | null = null;
  foldedRanges(state).between(at, at, (from, to) => {
    if (from === at) found = { from, to };
  });
  return found as { from: number; to: number } | null;
}

class FoldMarker extends WidgetType {
  constructor(
    readonly folded: boolean,
    readonly lineFrom: number,
  ) {
    super();
  }
  eq(other: FoldMarker) {
    return other.folded === this.folded && other.lineFrom === this.lineFrom;
  }
  toDOM(view: EditorView) {
    const b = document.createElement("span");
    b.className = `cm-heading-fold${this.folded ? " cm-heading-folded" : ""}`;
    b.setAttribute("role", "button");
    b.setAttribute("aria-label", this.folded ? "Mostrar seção" : "Recolher seção");
    b.title = this.folded ? "Mostrar seção" : "Recolher seção";
    b.innerHTML = CHEVRON;
    b.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSection(view, view.state.doc.lineAt(view.posAtDOM(b)).from);
    });
    return b;
  }
  ignoreEvent() {
    return true;
  }
}

function toggleSection(view: EditorView, lineFrom: number) {
  const range = sectionAt(view.state, lineFrom);
  if (!range) return;
  const open = foldedAt(view.state, range.from);
  view.dispatch({ effects: open ? unfoldEffect.of(open) : foldEffect.of(range) });
}

function markers(view: EditorView): DecorationSet {
  const out: import("@codemirror/state").Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node) => {
        if (!/^ATXHeading\d$/.test(node.name)) return node.name === "Document" ? undefined : false;
        const line = view.state.doc.lineAt(node.from);
        const range = foldable(view.state, line.from, line.to);
        if (!range) return false;
        out.push(Decoration.widget({ widget: new FoldMarker(!!foldedAt(view.state, range.from), line.from), side: -1 }).range(line.from));
        return false;
      },
    });
  }
  return Decoration.set(out, true);
}

/** Títulos recolhidos (texto da linha) → guardados por nota. */
function saveFolds(state: EditorState, noteId: string) {
  const heads: string[] = [];
  foldedRanges(state).between(0, state.doc.length, (from) => {
    const line = state.doc.lineAt(from);
    if (/^#{1,6}\s/.test(line.text) && line.to === from) heads.push(line.text);
  });
  try {
    if (heads.length) localStorage.setItem(STORE + noteId, JSON.stringify(heads));
    else localStorage.removeItem(STORE + noteId);
  } catch {
    // sem armazenamento: só nesta sessão
  }
}

function restoreFolds(view: EditorView, noteId: string) {
  let heads: string[] = [];
  try {
    heads = JSON.parse(localStorage.getItem(STORE + noteId) ?? "[]") as string[];
  } catch {
    return;
  }
  if (!Array.isArray(heads) || !heads.length) return;
  const want = new Set(heads);
  const effects = [];
  for (let i = 1; i <= view.state.doc.lines; i++) {
    const line = view.state.doc.line(i);
    if (!want.has(line.text)) continue;
    const range = foldable(view.state, line.from, line.to);
    if (range) effects.push(foldEffect.of(range));
  }
  if (effects.length) view.dispatch({ effects });
}

export function headingFold(noteId: () => string | undefined): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = markers(view);
        // Depois da análise do Markdown (o título precisa estar na árvore).
        setTimeout(() => {
          const id = noteId();
          if (id && view.dom.isConnected) restoreFolds(view, id);
        }, 0);
      }
      update(u: ViewUpdate) {
        const foldsChanged = foldedRanges(u.state) !== foldedRanges(u.startState);
        if (u.docChanged || u.viewportChanged || foldsChanged || syntaxTree(u.state) !== syntaxTree(u.startState)) {
          this.decorations = markers(u.view);
        }
        const id = noteId();
        if (id && foldsChanged) saveFolds(u.state, id);
      }
    },
    { decorations: (v) => v.decorations },
  );
  return [
    codeFolding({
      placeholderDOM: (_view, onclick) => {
        const el = document.createElement("span");
        el.className = "cm-fold-pill";
        el.textContent = "…";
        el.title = "Mostrar seção";
        el.setAttribute("aria-label", "Mostrar seção");
        el.onclick = onclick;
        return el;
      },
    }),
    plugin,
    keymap.of(foldKeymap),
  ];
}
