// Estados de tarefa do Bullet Journal (além do [ ] / [x] do Markdown):
//   [ ] aberta   [x] concluída   [>] migrada   [<] agendada
//   [-] cancelada   [o] evento   [/] em andamento

export type TaskState = " " | "x" | ">" | "<" | "-" | "o" | "/";

/** Qualquer caractere de estado aceito entre colchetes. */
export const TASK_CHARS = " xX><\\-o/";

/** "- [>] texto": indentação, marcador da lista, estado. */
export const TASK_LINE_RE = /^(\s*)([-*+])\s+\[([ xX><\-o/])\](?=\s|$)/;

/** Ciclo do atalho (como o plugin): ` ` → x → > → < → - → ` `. `o` e `/` ficam fora. */
const CYCLE: TaskState[] = [" ", "x", ">", "<", "-"];

export function normalizeState(c: string): TaskState {
  return (c === "X" ? "x" : c) as TaskState;
}

export function nextInCycle(state: TaskState): TaskState | null {
  const i = CYCLE.indexOf(state);
  return i === -1 ? null : CYCLE[(i + 1) % CYCLE.length];
}

export const TASK_LABELS: Record<TaskState, string> = {
  " ": "Aberta",
  x: "Concluída",
  ">": "Migrada",
  "<": "Agendada",
  "-": "Cancelada",
  o: "Evento",
  "/": "Em andamento",
};
