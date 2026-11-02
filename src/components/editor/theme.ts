import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// Cores e medidas do design (artefato "Notas v1").
const c = {
  text: "#d3d6dd",
  strong: "#ffffff",
  muted: "#8d92a0",
  accent: "#7fd1c4",
  border: "#2a2c33",
  code: "#15161a",
  codeText: "#c8ccd6",
  quoteBar: "#3a3d47",
  quoteText: "#a3a8b5",
  box: "#6a6f7d",
};

export const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent", color: c.text },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-sans)", lineHeight: "1.7", overflow: "visible" },
    ".cm-content": {
      padding: "0 0 40vh",
      fontSize: "16px",
      caretColor: c.accent,
      minHeight: "50vh",
    },
    ".cm-line": { padding: "0" },
    ".cm-cursor, .cm-dropCursor": { borderLeft: `2px solid ${c.accent}` },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(127, 209, 196, 0.22) !important",
    },
    ".cm-placeholder": { color: c.muted },

    // Títulos
    ".cm-h": { color: c.strong, fontWeight: "600", lineHeight: "1.3" },
    ".cm-h1": { fontSize: "28px", paddingTop: "12px", paddingBottom: "4px" },
    ".cm-h2": { fontSize: "24px", paddingTop: "10px", paddingBottom: "2px" },
    ".cm-h3": { fontSize: "20px", paddingTop: "8px" },
    ".cm-h4, .cm-h5, .cm-h6": { fontSize: "17px", paddingTop: "6px" },

    // Inline
    ".cm-strong": { fontWeight: "600", color: c.strong },
    ".cm-em": { fontStyle: "italic" },
    ".cm-strike": { textDecoration: "line-through", color: c.muted },
    ".cm-inline-code": {
      fontFamily: "var(--font-mono)",
      fontSize: "0.86em",
      backgroundColor: c.code,
      border: `1px solid ${c.border}`,
      borderRadius: "4px",
      padding: "1px 4px",
      color: c.codeText,
    },
    ".cm-link, .cm-wikilink": {
      color: c.accent,
      cursor: "pointer",
      textDecoration: "underline",
      textDecorationColor: "rgba(127, 209, 196, 0.35)",
      textUnderlineOffset: "3px",
    },
    ".cm-wikilink-raw, .cm-link-raw": { color: c.accent },
    ".cm-tag": {
      color: c.accent,
      backgroundColor: "rgba(127, 209, 196, 0.14)",
      borderRadius: "999px",
      padding: "1px 8px",
      fontSize: "0.85em",
    },

    // Blocos de código
    ".cm-codeblock": {
      fontFamily: "var(--font-mono)",
      fontSize: "13.5px",
      backgroundColor: c.code,
      color: c.codeText,
      padding: "0 16px !important",
      borderLeft: `1px solid ${c.border}`,
      borderRight: `1px solid ${c.border}`,
    },
    ".cm-codeblock-first": {
      borderTop: `1px solid ${c.border}`,
      borderTopLeftRadius: "8px",
      borderTopRightRadius: "8px",
      paddingTop: "8px !important",
    },
    ".cm-codeblock-last": {
      borderBottom: `1px solid ${c.border}`,
      borderBottomLeftRadius: "8px",
      borderBottomRightRadius: "8px",
      paddingBottom: "8px !important",
    },
    ".cm-codeblock-fence": { color: c.muted, fontSize: "12px" },
    // Cerca escondida vira só o respiro de cima/baixo do bloco.
    ".cm-codeblock-fence-hidden": { lineHeight: "6px", fontSize: "6px" },

    // Citação
    ".cm-quote": {
      borderLeft: `3px solid ${c.quoteBar}`,
      paddingLeft: "16px !important",
      color: c.quoteText,
      fontStyle: "italic",
    },

    // Listas e tarefas
    ".cm-bullet": { color: c.muted, display: "inline-block", minWidth: "0.9em" },
    ".cm-list-mark": { color: c.muted },
    ".cm-task-box": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      marginRight: "8px",
      verticalAlign: "-2px",
      borderRadius: "4px",
      border: `1.5px solid ${c.box}`,
      cursor: "pointer",
      boxSizing: "border-box",
    },
    ".cm-task-box-done": { backgroundColor: c.accent, borderColor: c.accent, color: "#16171b" },
    ".cm-task-done": { color: c.muted, textDecoration: "line-through" },

    // Autocomplete de [[links]]
    ".cm-tooltip.cm-tooltip-autocomplete": {
      backgroundColor: "#23262d",
      border: `1px solid ${c.border}`,
      borderRadius: "8px",
      padding: "4px",
      boxShadow: "0 12px 32px rgba(0, 0, 0, 0.45)",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "var(--font-sans) !important",
      maxHeight: "260px",
      minWidth: "240px",
      maxWidth: "min(420px, 90vw)",
    },
    ".cm-tooltip-autocomplete > ul > li": {
      display: "flex",
      alignItems: "baseline",
      gap: "8px",
      padding: "6px 10px !important",
      borderRadius: "6px",
      color: c.text,
      fontSize: "14px",
      lineHeight: "1.4",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#2a2d35",
      color: c.strong,
    },
    ".cm-completionMatchedText": { textDecoration: "none", color: c.accent, fontWeight: "600" },
    ".cm-completionDetail": {
      marginLeft: "auto",
      fontStyle: "normal",
      fontSize: "12px",
      color: c.muted,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },

    ".cm-hr": {
      display: "inline-block",
      width: "100%",
      height: "1px",
      verticalAlign: "middle",
      backgroundColor: c.border,
    },
  },
  { dark: true },
);

// Sintaxe visível (na linha em edição) e código dentro de blocos.
const highlight = HighlightStyle.define([
  { tag: [t.processingInstruction, t.contentSeparator], color: c.muted },
  { tag: t.url, color: c.muted },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: "#7fd1c4" },
  { tag: [t.string, t.special(t.string)], color: "#e6c07b" },
  { tag: [t.number, t.bool, t.null], color: "#f2a272" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "#6a6f7d", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#8fb8ff" },
  { tag: [t.typeName, t.className], color: "#f0c674" },
  { tag: [t.propertyName, t.attributeName], color: "#b4b8c4" },
  { tag: [t.tagName], color: "#f08c8c" },
]);

export const editorHighlight = syntaxHighlighting(highlight);
