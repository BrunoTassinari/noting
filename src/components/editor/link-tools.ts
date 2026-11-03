import { RangeSetBuilder, StateEffect } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { type NoteMeta, resolveWikilink } from "@/lib/note-paths";
import { blankCode, WIKILINK_RE } from "@/lib/wikilinks";

// Ajudas para ligar notas no editor:
//  - [[links]] para notas que ainda não existem aparecem apagados (como no
//    Obsidian); clicar cria a nota;
//  - com texto selecionado, digitar "[" envolve a seleção: "[[" vira link.

/** Avisa o editor que a lista de notas mudou (recalcula os links "sem nota"). */
export const refreshLinks = StateEffect.define<null>();

const missing = Decoration.mark({ class: "cm-wikilink-missing", attributes: { title: "Nota ainda não existe: clique para criar" } });

export function missingLinks(get: () => { notes: NoteMeta[]; fromPath: string }) {
  const build = (view: EditorView): DecorationSet => {
    const { notes, fromPath } = get();
    const b = new RangeSetBuilder<Decoration>();
    for (const { from, to } of view.visibleRanges) {
      const text = blankCode(view.state.doc.sliceString(from, to));
      for (const m of text.matchAll(WIKILINK_RE)) {
        const target = m[1].trim();
        if (!target || target.startsWith("#")) continue;
        if (!resolveWikilink(notes, target, fromPath)) b.add(from + m.index, from + m.index + m[0].length, missing);
      }
    }
    return b.finish();
  };
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || u.transactions.some((t) => t.effects.some((e) => e.is(refreshLinks)))) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}

/** "[" com seleção: envolve em vez de apagar ("[[" seguido = [[link]]). */
export const wrapSelectionInBrackets = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== "[" || from === to || view.state.selection.ranges.length > 1) return false;
  view.dispatch({
    changes: [
      { from, insert: "[" },
      { from: to, insert: "]" },
    ],
    selection: { anchor: from + 1, head: to + 1 },
    userEvent: "input",
  });
  return true;
});
