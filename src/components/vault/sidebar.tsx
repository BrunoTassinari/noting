"use client";

import { filterSpace, useSpace } from "./space-store";
import { SpaceSwitch } from "./space-switch";
import { useEffect, useMemo, useRef, useState } from "react";
import { renameNoteAction } from "@/app/(vault)/actions";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CollapseIcon,
  FolderPlusIcon,
  MoreIcon,
  MoveIcon,
  PencilIcon,
  PlusIcon,
  TabNewIcon,
  TrashIcon,
} from "@/components/icons";
import { ancestorFolders, buildTree, type FolderNode, type NoteMeta } from "@/lib/note-paths";
import { openContextMenu, openMenuAt, useLongPress } from "./context-menu";
import type { MenuItem } from "./menu";
import { NoteLink } from "./note-link";
import { whenCreated } from "./optimistic-note";
import { collapseAllFolders, expandFolders, toggleFolder, useExpandedFolders } from "./expanded-store";
import { actionError, useVault } from "./vault-context";

export const panelIconButton =
  "flex size-11 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text disabled:opacity-50 md:size-7";

/** Painel "Arquivos": a árvore de pastas e notas. */
export function FilesPanel() {
  const { notes: allNotes, activeNote, currentFolder, creating, createNote, openNewFolder } = useVault();
  const space = useSpace();
  const notes = useMemo(() => filterSpace(space, allNotes), [space, allNotes]);

  // Abre as pastas da nota ativa.
  useEffect(() => {
    if (activeNote?.path) expandFolders(ancestorFolders(activeNote.path));
  }, [activeNote?.path]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-0.5 px-2.5">
        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-[0.04em] text-muted">
          Arquivos
        </span>
        <button
          type="button"
          aria-label="Nova nota"
          title="Nova nota"
          disabled={creating}
          onClick={() => createNote(currentFolder)}
          className={panelIconButton}
        >
          <PencilIcon size={15} />
        </button>
        <button type="button" aria-label="Nova pasta" title="Nova pasta" onClick={openNewFolder} className={panelIconButton}>
          <FolderPlusIcon size={15} />
        </button>
        <button
          type="button"
          aria-label="Recolher pastas"
          title="Recolher pastas"
          onClick={collapseAllFolders}
          className={panelIconButton}
        >
          <CollapseIcon size={15} />
        </button>
      </div>
      <SpaceSwitch className="mx-2.5 mb-1.5 shrink-0" />
      <nav aria-label="Notas" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted">
            {allNotes.length === 0 ? "Nenhuma nota ainda. Crie a primeira com o lápis acima." : "Nenhuma nota neste espaço."}
          </p>
        ) : (
          <Tree notes={notes} activeId={activeNote?.id} />
        )}
      </nav>
    </div>
  );
}

const rowBase =
  "flex w-full items-center gap-1.5 rounded-md pr-2 text-left min-h-11 md:min-h-7 md:h-7 text-[15px] md:text-[13px] select-none [-webkit-touch-callout:none]";

const moreButton =
  "absolute right-1 hidden size-6 items-center justify-center rounded text-muted hover:bg-active hover:text-text focus:opacity-100 md:flex md:opacity-0 md:group-hover:opacity-100";

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
  const { createNote, creating, openRenameFolder, openDeleteFolder } = useVault();
  const isOpen = expanded.has(node.path);
  const pad = 8 + depth * 14;
  const items: MenuItem[] = [
    { label: "Nova nota aqui", icon: <PlusIcon size={15} />, onSelect: () => createNote(node.path) },
    { label: "Renomear pasta…", icon: <PencilIcon size={15} />, onSelect: () => openRenameFolder(node.path) },
    { label: "Excluir pasta…", icon: <TrashIcon size={15} />, danger: true, onSelect: () => openDeleteFolder(node.path) },
  ];
  const press = useLongPress((at) => openContextMenu(at, items, `Pasta ${node.name}`));

  return (
    <li>
      <div
        className="group relative flex items-center"
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu({ x: e.clientX, y: e.clientY }, items, `Pasta ${node.name}`);
        }}
      >
        <button
          type="button"
          aria-expanded={isOpen}
          onClick={() => {
            if (!press.consumed()) toggleFolder(node.path);
          }}
          {...press.handlers}
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
          className="absolute right-1 flex size-9 items-center justify-center rounded text-muted hover:bg-active hover:text-text focus:opacity-100 md:right-7 md:size-6 md:opacity-0 md:group-hover:opacity-100"
        >
          <PlusIcon size={14} />
        </button>
        <button
          type="button"
          aria-label={`Opções da pasta ${node.name}`}
          title="Mais opções"
          onClick={(e) => openMenuAt(e.currentTarget, items, `Pasta ${node.name}`)}
          className={moreButton}
        >
          <MoreIcon size={14} />
        </button>
      </div>
      {isOpen && (
        <ul className="relative flex flex-col gap-px">
          {/* Linha-guia do nível, alinhada com a seta da pasta (como no Obsidian). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-px bg-border-strong"
            style={{ left: pad + 7 }}
          />
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

/** Ações de uma nota (menu de contexto da árvore e da lista do celular). */
export function useNoteMenu(note: NoteMeta, onRename?: () => void): MenuItem[] {
  const { goToNote, openMove, openDelete } = useVault();
  return [
    {
      label: "Abrir em nova aba",
      icon: <TabNewIcon size={15} />,
      desktopOnly: true,
      onSelect: () => goToNote(note.id, true),
    },
    ...(onRename ? [{ label: "Renomear", icon: <PencilIcon size={15} />, onSelect: onRename }] : []),
    { label: "Mover para…", icon: <MoveIcon size={15} />, onSelect: () => openMove(note) },
    { label: "Excluir", icon: <TrashIcon size={15} />, danger: true, onSelect: () => openDelete(note) },
  ];
}

function NoteRow({ note, indent, active }: { note: NoteMeta; indent: number; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const items = useNoteMenu(note, () => setRenaming(true));
  const press = useLongPress((at) => openContextMenu(at, items, note.title));

  return (
    <li
      className="group relative flex items-center"
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu({ x: e.clientX, y: e.clientY }, items, note.title);
      }}
    >
      {renaming ? (
        <RenameInput note={note} indent={indent} onDone={() => setRenaming(false)} />
      ) : (
        <>
          <NoteLink
            id={note.id}
            aria-current={active ? "page" : undefined}
            style={{ paddingLeft: indent }}
            {...press.handlers}
            onClick={(e) => {
              if (press.consumed()) e.preventDefault();
            }}
            className={`${rowBase} md:pr-8 ${
              active ? "bg-active text-text-strong" : "text-muted hover:bg-card hover:text-text"
            }`}
          >
            <span className="truncate">{note.title}</span>
          </NoteLink>
          <button
            type="button"
            aria-label={`Opções de ${note.title}`}
            title="Mais opções"
            onClick={(e) => openMenuAt(e.currentTarget, items, note.title)}
            className={moreButton}
          >
            <MoreIcon size={14} />
          </button>
        </>
      )}
    </li>
  );
}

/** Renomear direto na árvore: Enter salva, Esc cancela. */
function RenameInput({ note, indent, onDone }: { note: NoteMeta; indent: number; onDone: () => void }) {
  const { showError, reportRelinked } = useVault();
  const [draft, setDraft] = useState(note.title);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.select();
  }, []);

  const commit = async () => {
    if (done.current) return;
    done.current = true;
    onDone();
    const title = draft.trim();
    if (!title || title === note.title) return;
    try {
      await whenCreated(note.id);
      const res = await renameNoteAction(note.id, title);
      const err = actionError(res);
      if (err) showError(err);
      else if (res.ok) reportRelinked(res.relinked);
    } catch (e) {
      showError((e as Error).message);
    }
  };

  return (
    <input
      ref={ref}
      aria-label="Novo nome da nota"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          void commit();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onDone();
        }
      }}
      style={{ paddingLeft: indent - 6 }}
      className="mx-0 h-11 w-full rounded-md border border-accent bg-surface pr-2 text-[15px] text-text-strong outline-none md:h-7 md:text-[13px]"
    />
  );
}
