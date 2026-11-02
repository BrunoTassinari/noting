"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import { continueBujoTask, cycleTaskState, type FormatKind, runFormat } from "./commands";
import { bujoNote, bujoWidgets, type NoteInfo } from "./bujo-widgets";
import { livePreview, taskToggle } from "./live-preview";
import { editorHighlight, editorTheme } from "./theme";
import { slashCommandSource } from "./slash-commands";
import { wikilinkAutocomplete } from "./wikilink-autocomplete";

/** O elemento está numa linha onde há cursor? (lá o clique é para editar) */
function onSelectedLine(view: EditorView, el: HTMLElement): boolean {
  if (!view.hasFocus) return false;
  const line = view.state.doc.lineAt(view.posAtDOM(el)).number;
  return view.state.selection.ranges.some((r) => view.state.doc.lineAt(r.head).number === line);
}

export type MarkdownEditorProps = {
  initialValue: string;
  onChange: (value: string) => void;
  /** Clique num [[link]] (alvo = texto antes do "|"). */
  onOpenWikilink: (target: string) => void;
  /** Notas oferecidas no autocomplete de [[ (selfId = a nota aberta). */
  linkTargets: { notes: NoteMeta[]; selfId?: string };
  /** Linha (1…) onde está o cursor, a cada mudança. */
  onCursorLine?: (line: number) => void;
  /** Pasta e título da nota (o formulário do dia descobre a data por eles). */
  note?: NoteInfo;
  /** Chamado quando o editor terminou de montar, com comandos para o pai. */
  onReady?: (api: EditorApi) => void;
};

export type EditorApi = {
  /** Move o cursor para o início da linha e rola até ela. */
  goToLine: (line: number) => void;
  /** Formatação da barra de ferramentas (negrito, lista, link...). */
  format: (kind: FormatKind) => void;
  /** Linhas do texto e as da seleção principal (0…, inclusivo). */
  lineSelection: () => { lines: string[]; from: number; to: number };
  /**
   * Troca as linhas [start, end] (0…) por `replacement` (vazio = remove),
   * se elas ainda forem `expected`. false = o texto mudou; nada foi feito.
   */
  replaceLines: (start: number, end: number, expected: string[], replacement: string[]) => boolean;
};

/**
 * Editor Markdown (CodeMirror 6) com renderização ao vivo. Não controlado:
 * o valor inicial entra uma vez; cada mudança sai por onChange.
 */
export default function MarkdownEditor({
  initialValue,
  onChange,
  onOpenWikilink,
  linkTargets,
  onCursorLine,
  note,
  onReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onOpenWikilink, linkTargets, onCursorLine, note });

  useEffect(() => {
    callbacks.current = { onChange, onOpenWikilink, linkTargets, onCursorLine, note };
  });

  useEffect(() => {
    if (!host.current) return;

    const openLinks = EditorView.domEventHandlers({
      mousedown(event, view) {
        const el = event.target as HTMLElement;
        const modifier = event.metaKey || event.ctrlKey;
        // Link renderizado: clique simples abre. Na linha em edição: Ctrl/Cmd+clique.
        const wiki = el.closest<HTMLElement>(modifier ? "[data-wikilink]" : ".cm-wikilink");
        if (wiki?.dataset.wikilink) {
          event.preventDefault();
          callbacks.current.onOpenWikilink(wiki.dataset.wikilink);
          return true;
        }
        const link = el.closest<HTMLElement>(".cm-link[data-href]");
        if (link?.dataset.href && (modifier || !onSelectedLine(view, link))) {
          event.preventDefault();
          const href = link.dataset.href;
          if (/^(https?:|mailto:)/i.test(href)) window.open(href, "_blank", "noopener,noreferrer");
          return true;
        }
        return false;
      },
    });

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          // Antes do keymap do Markdown: tarefas com estados do Bullet Journal.
          Prec.high(
            keymap.of([
              { key: "Mod-l", run: cycleTaskState },
              { key: "Enter", run: continueBujoTask },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          // Enter continua listas e tarefas; Backspace remove a marcação.
          markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true }),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Conteúdo da nota",
            spellcheck: "true",
            autocapitalize: "sentences",
          }),
          placeholder("Comece a escrever em Markdown…"),
          editorTheme,
          editorHighlight,
          livePreview,
          bujoNote.of(() => callbacks.current.note ?? null),
          bujoWidgets,
          wikilinkAutocomplete(() => callbacks.current.linkTargets, [slashCommandSource]),
          taskToggle,
          openLinks,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
            if (u.docChanged || u.selectionSet) {
              callbacks.current.onCursorLine?.(u.state.doc.lineAt(u.state.selection.main.head).number);
            }
          }),
        ],
      }),
    });

    onReady?.({
      goToLine(line) {
        const target = view.state.doc.line(Math.min(Math.max(1, line), view.state.doc.lines));
        view.dispatch({
          selection: { anchor: target.to },
          effects: EditorView.scrollIntoView(target.from, { y: "start", yMargin: 24 }),
        });
        view.focus();
      },
      format: (kind) => runFormat(view, kind),
      lineSelection() {
        const { doc, selection } = view.state;
        const { from, to } = selection.main;
        const first = doc.lineAt(from);
        let last = doc.lineAt(to);
        // Seleção que termina no começo de uma linha não a inclui.
        if (to > from && to === last.from && last.number > first.number) last = doc.line(last.number - 1);
        return { lines: doc.toString().split("\n"), from: first.number - 1, to: last.number - 1 };
      },
      replaceLines(start, end, expected, replacement) {
        const { doc } = view.state;
        if (start < 0 || end >= doc.lines || end - start + 1 !== expected.length) return false;
        for (let i = start; i <= end; i++) if (doc.line(i + 1).text !== expected[i - start]) return false;
        let from = doc.line(start + 1).from;
        let to = doc.line(end + 1).to;
        if (replacement.length === 0) {
          // Remove as linhas inteiras, com a quebra de linha.
          if (end + 1 < doc.lines) to += 1;
          else if (start > 0) from -= 1;
        }
        view.dispatch({ changes: { from, to, insert: replacement.join("\n") }, scrollIntoView: true });
        return true;
      },
    });
    return () => view.destroy();
    // Não controlado: recria só se o componente remontar (troca de nota).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-h-[50vh]" />;
}
