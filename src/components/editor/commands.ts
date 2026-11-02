import { startCompletion } from "@codemirror/autocomplete";
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

// Comandos da barra de ferramentas (celular). Alternam: aplicar de novo desfaz.

export type FormatKind = "bold" | "italic" | "bullet" | "task" | "link" | "tag" | "undo";

/** **negrito** / *itálico*: envolve a seleção ou tira se já estiver envolvida. */
function toggleWrap(view: EditorView, marker: string) {
  const { state } = view;
  const len = marker.length;
  view.dispatch(
    state.changeByRange((range) => {
      const before = state.sliceDoc(range.from - len, range.from);
      const after = state.sliceDoc(range.to, range.to + len);
      if (before === marker && after === marker) {
        return {
          changes: [
            { from: range.from - len, to: range.from },
            { from: range.to, to: range.to + len },
          ],
          range: EditorSelection.range(range.from - len, range.to - len),
        };
      }
      if (range.empty) {
        return {
          changes: { from: range.from, insert: marker + marker },
          range: EditorSelection.cursor(range.from + len),
        };
      }
      return {
        changes: [
          { from: range.from, insert: marker },
          { from: range.to, insert: marker },
        ],
        range: EditorSelection.range(range.from + len, range.to + len),
      };
    }),
  );
}

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)?/;
const IS_TASK = /^\s*[-*+]\s+\[[ xX]\]\s/;
const IS_BULLET = /^\s*[-*+]\s/;

/** Liga/desliga "- " ou "- [ ] " no começo das linhas selecionadas. */
function toggleLinePrefix(view: EditorView, kind: "bullet" | "task") {
  const { state } = view;
  const lines = new Map<number, { from: number; text: string }>();
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos);
      lines.set(line.number, { from: line.from, text: line.text });
      pos = line.to + 1;
    }
  }
  const has = (t: string) => (kind === "task" ? IS_TASK.test(t) : IS_BULLET.test(t) && !IS_TASK.test(t));
  const allHave = [...lines.values()].every((l) => has(l.text));
  const prefix = kind === "task" ? "- [ ] " : "- ";

  const changes = [...lines.values()].map(({ from, text }) => {
    const m = LIST_PREFIX.exec(text)!;
    const indent = m[1].length;
    return { from: from + indent, to: from + m[0].length, insert: allHave ? "" : prefix };
  });
  view.dispatch({ changes, scrollIntoView: true });
}

function insertText(view: EditorView, text: string, cursorOffset = text.length) {
  const { state } = view;
  view.dispatch(
    state.changeByRange((range) => ({
      changes: { from: range.from, to: range.to, insert: text },
      range: EditorSelection.cursor(range.from + cursorOffset),
    })),
  );
}

export function runFormat(view: EditorView, kind: FormatKind) {
  switch (kind) {
    case "bold":
      toggleWrap(view, "**");
      break;
    case "italic":
      toggleWrap(view, "*");
      break;
    case "bullet":
    case "task":
      toggleLinePrefix(view, kind);
      break;
    case "link":
      insertText(view, "[[]]", 2);
      startCompletion(view);
      break;
    case "tag": {
      const pos = view.state.selection.main.from;
      const prev = view.state.sliceDoc(pos - 1, pos);
      insertText(view, prev && !/\s/.test(prev) ? " #" : "#");
      break;
    }
    case "undo":
      undo(view);
      break;
  }
  view.focus();
}
