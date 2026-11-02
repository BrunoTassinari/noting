"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/app/login/actions";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderPlusIcon,
  LogoutIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
} from "@/components/icons";
import {
  ancestorFolders,
  buildTree,
  displayFolder,
  type FolderNode,
  type NoteMeta,
} from "@/lib/note-paths";
import { expandFolders, toggleFolder, useExpandedFolders } from "./expanded-store";
import { useVault } from "./vault-context";

const iconButton =
  "flex size-11 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text md:size-7";

export function Sidebar() {
  const { notes, activeNote, currentFolder, creating, createNote, openNewFolder } = useVault();
  const [filter, setFilter] = useState("");

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
        <form action={signOut} className="md:hidden">
          <button type="submit" aria-label="Sair" title="Sair" className={iconButton}>
            <LogoutIcon size={18} />
          </button>
        </form>
      </div>

      <div className="shrink-0 px-4 pb-3 md:px-2.5 md:pb-2.5">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-rail px-3.5 text-muted md:h-8 md:rounded-lg md:px-2.5">
          <SearchIcon size={14} />
          <input
            aria-label="Filtrar notas por nome"
            placeholder="Filtrar por nome"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setFilter("")}
            className="min-w-0 flex-1 bg-transparent text-base text-text outline-none placeholder:text-muted md:text-[13px]"
          />
        </label>
      </div>

      <nav aria-label="Notas" className="min-h-0 flex-1 overflow-y-auto px-2 pb-24 md:pb-4">
        {notes.length === 0 ? (
          <EmptyVault />
        ) : filter.trim() ? (
          <FilteredList notes={notes} query={filter} activeId={activeNote?.id} />
        ) : (
          <Tree notes={notes} activeId={activeNote?.id} />
        )}
      </nav>

      {/* Botão flutuante no celular */}
      <button
        type="button"
        disabled={creating}
        onClick={() => createNote(currentFolder)}
        className="fixed bottom-6 right-5 z-10 flex h-[52px] items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-lg disabled:opacity-60 md:hidden"
      >
        <PlusIcon size={20} />
        Nova nota
      </button>
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

function Tree({ notes, activeId }: { notes: NoteMeta[]; activeId?: string }) {
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
      <Link
        href={`/n/${note.id}`}
        aria-current={active ? "page" : undefined}
        style={{ paddingLeft: indent }}
        className={`${rowBase} ${
          active ? "bg-active text-text-strong" : "text-muted hover:bg-card hover:text-text"
        }`}
      >
        <span className="truncate">{note.title}</span>
      </Link>
    </li>
  );
}

function fold(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function FilteredList({ notes, query, activeId }: { notes: NoteMeta[]; query: string; activeId?: string }) {
  const q = fold(query.trim());
  const matches = notes.filter((n) => fold(n.title).includes(q));

  if (matches.length === 0) {
    return <p className="px-3 py-6 text-center text-[13px] text-muted">Nada encontrado.</p>;
  }

  return (
    <ul className="flex flex-col gap-px">
      {matches.map((n) => (
        <li key={n.id}>
          <Link
            href={`/n/${n.id}`}
            aria-current={n.id === activeId ? "page" : undefined}
            className={`flex flex-col rounded-md px-2 py-1.5 ${
              n.id === activeId ? "bg-active" : "hover:bg-card"
            }`}
          >
            <span className="truncate text-[15px] text-text md:text-[13px]">{n.title}</span>
            <span className="truncate text-xs text-muted">{displayFolder(n.path)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
