"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { NoteMeta } from "@/lib/note-paths";
import { continueBujoTask, cycleTaskState, type FormatKind, runFormat } from "./commands";
import { bujoWidgets } from "./bujo-widgets";
import { livePreview, taskToggle } from "./live-preview";
import { editorHighlight, editorTheme } from "./theme";
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
  /** Chamado quando o editor terminou de montar, com comandos para o pai. */
  onReady?: (api: EditorApi) => void;
};

export type EditorApi = {
  /** Move o cursor para o início da linha e rola até ela. */
  goToLine: (line: number) => void;
  /** Formatação da barra de ferramentas (negrito, lista, link...). */
  format: (kind: FormatKind) => void;
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
  onReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onOpenWikilink, linkTargets, onCursorLine });

  useEffect(() => {
    callbacks.current = { onChange, onOpenWikilink, linkTargets, onCursorLine };
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
          bujoWidgets,
          wikilinkAutocomplete(() => callbacks.current.linkTargets),
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
    });
    return () => view.destroy();
    // Não controlado: recria só se o componente remontar (troca de nota).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-h-[50vh]" />;
}
