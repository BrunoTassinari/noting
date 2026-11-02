import { CheckIcon } from "@/components/icons";
import type { TaskState } from "@/lib/tasks";

/** Caixa de estado da tarefa: vazia, em andamento, concluída, cancelada… */
export function StateBox({ state }: { state: TaskState }) {
  const base = "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]";
  switch (state) {
    case "x":
      return (
        <span aria-hidden="true" className={`${base} border-accent bg-accent text-accent-ink`}>
          <CheckIcon size={13} strokeWidth={3} />
        </span>
      );
    case "/":
      return (
        <span aria-hidden="true" className={`${base} overflow-hidden border-accent`}>
          <span className="h-full w-1/2 self-start bg-accent/70" />
          <span className="h-full w-1/2" />
        </span>
      );
    case "-":
      return (
        <span aria-hidden="true" className={`${base} border-muted text-muted`}>
          <span className="h-[1.5px] w-2.5 rounded bg-current" />
        </span>
      );
    case ">":
    case "<":
      return (
        <span aria-hidden="true" className={`${base} border-muted text-[11px] font-bold leading-none text-muted`}>
          {state === ">" ? "›" : "‹"}
        </span>
      );
    case "o":
      return (
        <span aria-hidden="true" className={`${base} rounded-full border-muted`}>
          <span className="size-1.5 rounded-full bg-muted" />
        </span>
      );
    default:
      return <span aria-hidden="true" className={`${base} border-muted`} />;
  }
}
