"use client";

import { useEffect, useMemo } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons";
import { ancestorFolders, buildTree, type FolderNode, type NoteMeta } from "@/lib/note-paths";
import { NoteLink } from "./note-link";
import { expandFolders, toggleFolder, useExpandedFolders } from "./expanded-store";
import { useVault } from "./vault-context";

const iconButton =
  "flex size-11 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text md:size-7";

export function Sidebar() {
  const { notes, activeNote, currentFolder, creating, createNote, openNewFolder, openSearch } =
    useVault();

  // Abre as pastas da nota ativa.
  useEffect(() => {
    if (activeNote?.path) expandFolders(ancestorFolders(activeNote.path));
  }, [activeNote?.path]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      <div className="flex h-14 shrink-0 items-center gap-1 pl-4 pr-2 md:h-10 md:pl-3.5">
        <span className="flex-1 text-xl font-semibold text-text-strong md:text-[13px] md:text-text">
          Meu vault
        </span>
        <button
          type="button"
          aria-label="Nova nota"
          title="Nova nota"
          disabled={creating}
          onClick={() => createNote(currentFolder)}
          className={iconButton}
        >
          <PencilIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Nova pasta"
          title="Nova pasta"
          onClick={openNewFolder}
          className={iconButton}
        >
          <FolderPlusIcon size={16} />
        </button>
      </div>

      <div className="shrink-0 px-4 pb-3 md:px-2.5 md:pb-2.5">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-border bg-rail px-3.5 text-left text-muted hover:border-[#3a3d47] md:h-8 md:rounded-lg md:px-2.5"
        >
          <SearchIcon size={14} />
          <span className="flex-1 text-base md:text-[13px]">Buscar notas</span>
          <kbd className="hidden font-mono text-[11px] md:inline">Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="Notas" className="min-h-0 flex-1 overflow-y-auto px-2 pb-24 md:pb-4">
        {notes.length === 0 ? <EmptyVault /> : <Tree notes={notes} activeId={activeNote?.id} />}
      </nav>

    </div>
  );
}

function EmptyVault() {
  return (
    <p className="px-3 py-6 text-center text-[13px] text-muted">
      Nenhuma nota ainda. Crie a primeira com o lápis acima.
    </p>
  );
}

const rowBase =
  "flex w-full items-center gap-1.5 rounded-md pr-2 text-left min-h-11 md:min-h-7 md:h-7 text-[15px] md:text-[13px]";

export function Tree({ notes, activeId }: { notes: NoteMeta[]; activeId?: string }) {
  const tree = useMemo(() => buildTree(notes), [notes]);
  const expanded = useExpandedFolders();

  return (
    <ul className="flex flex-col gap-px">
      {tree.folders.map((f) => (
        <FolderRow key={f.path} node={f} depth={0} expanded={expanded} activeId={activeId} />
      ))}
      {tree.notes.map((n) => (
        <NoteRow key={n.id} note={n} indent={28} active={n.id === activeId} />
      ))}
    </ul>
  );
}

function FolderRow({
  node,
  depth,
  expanded,
  activeId,
}: {
  node: FolderNode;
  depth: number;
  expanded: Set<string>;
  activeId?: string;
}) {
  const { createNote, creating } = useVault();
  const isOpen = expanded.has(node.path);
  const pad = 8 + depth * 14;

  return (
    <li>
      <div className="group relative flex items-center">
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => toggleFolder(node.path)}
          style={{ paddingLeft: pad }}
          className={`${rowBase} text-text-soft hover:bg-card`}
        >
          {isOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
          <span className="truncate">{node.name}</span>
        </button>
        <button
          type="button"
          aria-label={`Nova nota em ${node.name}`}
          title="Nova nota nesta pasta"
          disabled={creating}
          onClick={() => createNote(node.path)}
          className="absolute right-1 flex size-9 items-center justify-center rounded text-muted hover:bg-active hover:text-text focus:opacity-100 md:size-6 md:opacity-0 md:group-hover:opacity-100"
        >
          <PlusIcon size={14} />
        </button>
      </div>
      {isOpen && (
        <ul className="flex flex-col gap-px">
          {node.folders.map((f) => (
            <FolderRow key={f.path} node={f} depth={depth + 1} expanded={expanded} activeId={activeId} />
          ))}
          {node.notes.map((n) => (
            <NoteRow key={n.id} note={n} indent={pad + 28} active={n.id === activeId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function NoteRow({ note, indent, active }: { note: NoteMeta; indent: number; active: boolean }) {
  return (
    <li>
      <NoteLink
        id={note.id}
        aria-current={active ? "page" : undefined}
        style={{ paddingLeft: indent }}
        className={`${rowBase} ${
          active ? "bg-active text-text-strong" : "text-muted hover:bg-card hover:text-text"
        }`}
      >
        <span className="truncate">{note.title}</span>
      </NoteLink>
    </li>
  );
}
