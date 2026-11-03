"use client";

import type { ReactNode } from "react";
import type { FormatKind } from "@/components/editor/commands";
import { LinkIcon, ListIcon, TaskIcon, UndoIcon } from "@/components/icons";

const BUTTONS: { kind: FormatKind; label: string; icon: ReactNode; accent?: boolean }[] = [
  { kind: "bold", label: "Negrito", icon: <span className="text-[17px] font-bold">B</span> },
  { kind: "italic", label: "Itálico", icon: <span className="font-serif text-[17px] italic">I</span> },
  { kind: "bullet", label: "Lista", icon: <ListIcon size={20} /> },
  { kind: "task", label: "Tarefa", icon: <TaskIcon size={20} /> },
  { kind: "link", label: "Link para nota", icon: <LinkIcon size={20} />, accent: true },
  { kind: "tag", label: "Tag", icon: <span className="text-lg">#</span> },
  { kind: "undo", label: "Desfazer", icon: <UndoIcon size={20} /> },
];

/** Barra fixa embaixo do editor no celular (artboard Mobile · editor). */
export function MobileToolbar({ onFormat }: { onFormat: (kind: FormatKind) => void }) {
  return (
    <div
      role="toolbar"
      aria-label="Formatação"
      className="flex shrink-0 items-center justify-between bg-panel px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-1.5 md:hidden"
    >
      {BUTTONS.map((b) => (
        <button
          key={b.kind}
          type="button"
          aria-label={b.label}
          title={b.label}
          // Não tira o foco do editor (o teclado continua aberto).
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onFormat(b.kind)}
          className={`flex size-11 items-center justify-center rounded-[10px] active:bg-card ${
            b.accent ? "text-accent" : "text-text"
          }`}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}
