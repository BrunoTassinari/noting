import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { displayFolder, type NoteMeta, resolveWikilink } from "@/lib/note-paths";
import { parseHeadings } from "@/lib/outline";
import { getCachedNote, prefetchNote } from "@/components/vault/note-cache";

const CODE_NODES = new Set(["InlineCode", "FencedCode", "CodeBlock", "CodeText"]);

function inCode(ctx: CompletionContext): boolean {
  for (let n: ReturnType<typeof syntaxTree>["topNode"] | null = syntaxTree(ctx.state).resolveInner(ctx.pos, -1); n; n = n.parent) {
    if (CODE_NODES.has(n.name)) return true;
  }
  return false;
}

/** Insere `text` + "]]" (sem duplicar um "]]" que já esteja depois do cursor). */
const insertLink = (text: string) => (view: EditorView, _c: Completion, from: number, to: number) => {
  const end = view.state.sliceDoc(to, to + 2) === "]]" ? to + 2 : to;
  const full = `${text}]]`;
  view.dispatch({
    changes: { from, to: end, insert: full },
    selection: { anchor: from + full.length },
    userEvent: "input.complete",
  });
};

/** Corpo de uma nota (do cache, ou buscado no servidor). */
async function noteBody(id: string): Promise<string | null> {
  const cached = getCachedNote(id);
  if (cached) return cached.body;
  await prefetchNote(id).catch(() => undefined);
  return getCachedNote(id)?.body ?? null;
}

/**
 * Autocomplete de [[links]]:
 *  - "[[" lista as notas (busca aproximada pelo nome). Se o nome existir em
 *    mais de uma pasta, insere "Pasta/Nome" para não ficar ambíguo;
 *  - nome que não existe ganha a opção "Criar link para nova nota";
 *  - "[[Nota#" lista os títulos (##) dessa nota.
 */
export function wikilinkAutocomplete(
  getNotes: () => { notes: NoteMeta[]; selfId?: string },
  /** Outras fontes no mesmo menu (ex.: comandos do "/"). */
  extra: CompletionSource[] = [],
) {
  const source = (ctx: CompletionContext): CompletionResult | null => {
    const before = ctx.matchBefore(/\[\[[^\[\]|#\n]*$/);
    if (!before || inCode(ctx)) return null;

    const { notes, selfId } = getNotes();
    const typed = before.text.slice(2).trim();
    const count = new Map<string, number>();
    for (const n of notes) count.set(n.title.toLowerCase(), (count.get(n.title.toLowerCase()) ?? 0) + 1);

    const options: Completion[] = notes
      .filter((n) => n.id !== selfId)
      .map((n) => {
        const ambiguous = (count.get(n.title.toLowerCase()) ?? 0) > 1;
        return {
          label: n.title,
          detail: n.path ? displayFolder(n.path) : undefined,
          apply: insertLink(ambiguous && n.path ? `${n.path}/${n.title}` : n.title),
        };
      });

    // Nome novo: link para uma nota que ainda não existe (clicar cria).
    if (typed && !resolveWikilink(notes, typed)) {
      options.push({
        label: typed,
        detail: "criar nota nova",
        boost: -99,
        apply: insertLink(typed),
        type: "new-note",
      });
    }

    return { from: before.from + 2, options, validFor: /^[^\[\]|#\n]*$/ };
  };

  const headingSource = async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const before = ctx.matchBefore(/\[\[[^\[\]|#\n]*#[^\[\]|#\n]*$/);
    if (!before || inCode(ctx)) return null;
    const hash = before.text.indexOf("#");
    const target = before.text.slice(2, hash).trim();
    const { notes, selfId } = getNotes();
    const note = target ? resolveWikilink(notes, target) : notes.find((n) => n.id === selfId);
    if (!note) return null;
    const body = await noteBody(note.id);
    if (body === null || ctx.aborted) return null;
    const options: Completion[] = parseHeadings(body).map((h) => ({
      label: h.text,
      detail: "#".repeat(h.level),
      apply: insertLink(h.text),
    }));
    return options.length ? { from: before.from + hash + 1, options, validFor: /^[^\[\]|#\n]*$/ } : null;
  };

  return autocompletion({
    override: [source, headingSource, ...extra],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
    maxRenderedOptions: 50,
  });
}
