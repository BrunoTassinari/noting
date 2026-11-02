import { startCompletion } from "@codemirror/autocomplete";
import { undo } from "@codemirror/commands";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { nextInCycle, normalizeState, TASK_LINE_RE } from "@/lib/tasks";

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

const LIST_PREFIX = /^(\s*)(?:[-*+]\s+(?:\[[ xX><\-o/]\]\s+)?|\d+[.)]\s+)?/;
const IS_TASK = /^\s*[-*+]\s+\[[ xX><\-o/]\]\s/;
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

/**
 * Ctrl/Cmd+L: percorre o estado da tarefa nas linhas selecionadas
 * ([ ] → [x] → [>] → [<] → [-] → [ ]). Linha que não é tarefa vira "- [ ] ".
 * [o] e [/] não mudam.
 */
export function cycleTaskState(view: EditorView): boolean {
  const { state } = view;
  const seen = new Set<number>();
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const r of state.selection.ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (seen.has(line.number)) continue;
      seen.add(line.number);
      const m = TASK_LINE_RE.exec(line.text);
      if (m) {
        const next = nextInCycle(normalizeState(m[3]));
        if (next === null) continue;
        const at = line.from + m[0].length - 2; // caractere entre os colchetes
        changes.push({ from: at, to: at + 1, insert: next });
      } else {
        const p = LIST_PREFIX.exec(line.text)!;
        changes.push({ from: line.from + p[1].length, to: line.from + p[0].length, insert: "- [ ] " });
      }
    }
  }
  if (changes.length) view.dispatch({ changes });
  return true;
}

/**
 * Enter numa tarefa com estado do Bullet Journal ("- [>] x") continua com
 * "- [ ] " (o Markdown padrão só conhece [ ] e [x]). Tarefa vazia: Enter
 * tira a marcação, como nas listas.
 */
export function continueBujoTask(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty || state.selection.ranges.length > 1) return false;
  const line = state.doc.lineAt(range.head);
  const m = /^(\s*)([-*+])\s+\[([><\-o/])\]\s?/.exec(line.text);
  if (!m || range.head < line.from + m[0].length) return false;
  if (line.text.slice(m[0].length).trim() === "" && range.head === line.to) {
    view.dispatch({ changes: { from: line.from, to: line.to, insert: m[1] } });
    return true;
  }
  const insert = `\n${m[1]}${m[2]} [ ] `;
  view.dispatch({
    changes: { from: range.head, to: range.head, insert },
    selection: { anchor: range.head + insert.length },
    scrollIntoView: true,
  });
  return true;
}
