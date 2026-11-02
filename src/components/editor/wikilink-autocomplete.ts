import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { displayFolder, type NoteMeta } from "@/lib/note-paths";

const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

function inCode(ctx: CompletionContext): boolean {
  for (let n: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return true;
  }
  return false;
}

/**
 * Autocomplete de [[links]]: ao digitar "[[", lista as notas (busca
 * aproximada pelo nome). Enter/Tab insere "Nome]]". Se o nome existir em
 * mais de uma pasta, insere "Pasta/Nome" para não ficar ambíguo.
 */
export function wikilinkAutocomplete(getNotes: () => { notes: NoteMeta[]; selfId?: string }) {
  const source = (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\[\[[^\[\]|#\n]*$/);
    if (!before || inCode(ctx)) return null;

    const { notes, selfId } = getNotes();
    const count = new Map<string, number>();
    for (const n of notes) count.set(n.title.toLowerCase(), (count.get(n.title.toLowerCase()) ?? 0) + 1);

    const options: Completion[] = notes
      .filter((n) => n.id !== selfId)
      .map((n) => {
        const ambiguous = (count.get(n.title.toLowerCase()) ?? 0) > 1;
        const insert = ambiguous && n.path ? `${n.path}/${n.title}` : n.title;
        return {
          label: n.title,
          detail: n.path ? displayFolder(n.path) : undefined,
          apply: (view: EditorView, _c: Completion, from: number, to: number) => {
            // Se já houver "]]" logo depois do cursor, não duplica.
            const end = view.state.sliceDoc(to, to + 2) === "]]" ? to + 2 : to;
            const text = `${insert}]]`;
            view.dispatch({
              changes: { from, to: end, insert: text },
              selection: { anchor: from + text.length },
              userEvent: "input.complete",
            });
          },
        };
      });

    return { from: before.from + 2, options, validFor: /^[^\[\]|#\n]*$/ };
  };

  return autocompletion({
    override: [source],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
    maxRenderedOptions: 50,
  });
}
