// Capturas rápidas feitas offline (public/capture-queue.js) e enviadas
// depois para POST /api/capture. Cada uma vira um item "- texto" no fim
// da nota diária do dia em que foi escrita.

export const CAPTURE_MAX_LENGTH = 5000;
export const CAPTURE_MAX_BATCH = 100;

export type CaptureInput = { id: string; day: string; text: string };

/** Texto da captura → item de lista (linhas seguintes indentadas sob o item). */
export function captureToItem(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split("\n")
    .map((l) => l.trimEnd());
  return lines.map((l, i) => (i === 0 ? `- ${l}` : l ? `  ${l}` : "")).join("\n");
}

/**
 * Acrescenta os itens no fim do corpo. Depois de uma lista, continua a lista;
 * depois de um título ou parágrafo, deixa uma linha em branco antes.
 */
export function appendCaptures(body: string, texts: string[]): string {
  if (texts.length === 0) return body;
  const items = texts.map(captureToItem).join("\n");
  const trimmed = body.replace(/\s+$/, "");
  if (trimmed === "") return `${items}\n`;
  const last = trimmed.slice(trimmed.lastIndexOf("\n") + 1);
  const inList = /^\s*([-*+]|\d+[.)])\s/.test(last) || /^\s{2,}\S/.test(last);
  return `${trimmed}${inList ? "\n" : "\n\n"}${items}\n`;
}
