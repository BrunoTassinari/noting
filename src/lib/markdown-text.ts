// Markdown → texto corrido, para trechos de busca (sem **, ##, ``` etc.).

export function markdownToPlain(md: string): string {
  return md
    .replace(/^ {0,3}(`{3,}|~{3,}).*$/gm, "") // cercas de bloco de código
    .replace(/^ {0,3}#{1,6}[ \t]+/gm, "") // títulos
    .replace(/^\s*>\s?/gm, "") // citações
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "") // listas e tarefas
    .replace(/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/gm, "") // linhas horizontais
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2") // [[Nota|apelido]]
    .replace(/!?\[\[([^\]]+)\]\]/g, "$1") // [[Nota]]
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // [texto](url)
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1");
}
