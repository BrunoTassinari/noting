"use client";

import { CalendarIcon, NoteIcon, PlusIcon, SearchIcon, SidebarLeftIcon } from "@/components/icons";
import { toggleSide } from "./layout-store";
import { usePeriodicNotes } from "./use-periodic";
import { useVault } from "./vault-context";

/** Aba vazia (como no Obsidian): atalhos para começar. */
export function EmptyState() {
  const { notes, creating, createNote, openSearch } = useVault();
  const { openPeriodic } = usePeriodicNotes();

  const actions = [
    { label: "Criar nova nota", keys: null, icon: <PlusIcon size={15} />, onClick: () => createNote(""), disabled: creating },
    { label: "Buscar ou abrir nota", keys: "Ctrl K", icon: <SearchIcon size={15} />, onClick: openSearch },
    { label: "Abrir a nota de hoje", keys: null, icon: <CalendarIcon size={15} />, onClick: () => openPeriodic("day") },
    {
      label: "Mostrar/recolher a lateral",
      keys: "Ctrl \\",
      icon: <SidebarLeftIcon size={15} />,
      onClick: () => toggleSide("left"),
      desktop: true,
    },
  ];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-surface p-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
        <NoteIcon size={22} />
      </span>
      <div>
        <p className="text-base font-medium text-text">Nenhuma nota aberta</p>
        <p className="mt-1 text-[13px] text-muted">
          {notes.length === 0 ? "Seu vault está vazio." : `Escolha uma das ${notes.length} notas na lateral, ou:`}
        </p>
      </div>
      <ul className="flex w-full max-w-xs flex-col gap-1">
        {actions.map((a) => (
          <li key={a.label} className={a.desktop ? "hidden md:block" : undefined}>
            <button
              type="button"
              disabled={a.disabled}
              onClick={a.onClick}
              className="flex h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-accent hover:bg-card disabled:opacity-60 md:h-9"
            >
              {a.icon}
              <span className="flex-1">{a.label}</span>
              {a.keys && <kbd className="hidden font-mono text-[11px] text-muted md:inline">{a.keys}</kbd>}
            </button>
          </li>
        ))}
        <li className="hidden px-3 pt-2 text-left text-xs leading-normal text-muted md:block">
          Ctrl+clique num link abre a nota numa aba nova. Ctrl W fecha a aba.
        </li>
      </ul>
    </div>
  );
}
