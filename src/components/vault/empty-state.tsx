"use client";

import { NoteIcon, PlusIcon } from "@/components/icons";
import { useVault } from "./vault-context";

export function EmptyState() {
  const { notes, creating, createNote } = useVault();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-surface p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
        <NoteIcon size={22} />
      </span>
      <div>
        <p className="text-base font-medium text-text">Nenhuma nota aberta</p>
        <p className="mt-1 text-[13px] text-muted">
          {notes.length === 0
            ? "Seu vault está vazio."
            : `Escolha uma das ${notes.length} notas na barra lateral.`}
        </p>
      </div>
      <button
        type="button"
        disabled={creating}
        onClick={() => createNote("")}
        className="flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        <PlusIcon size={16} />
        Nova nota
      </button>
    </div>
  );
}
