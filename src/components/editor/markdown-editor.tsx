"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";
import type { NoteMeta } from "@/lib/note-paths";
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
  /** Chamado quando o editor terminou de montar. */
  onReady?: () => void;
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
  onReady,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onOpenWikilink, linkTargets });

  useEffect(() => {
    callbacks.current = { onChange, onOpenWikilink, linkTargets };
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
          wikilinkAutocomplete(() => callbacks.current.linkTargets),
          taskToggle,
          openLinks,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });

    onReady?.();
    return () => view.destroy();
    // Não controlado: recria só se o componente remontar (troca de nota).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="min-h-[50vh]" />;
}
