"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { renameNoteAction, saveNoteBodyAction } from "@/app/(vault)/actions";
import {
  ArrowLeftIcon,
  CloseIcon,
  CloudAlertIcon,
  CloudCheckIcon,
  LinkIcon,
  ListIcon,
  MoreIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import { displayFolder, folderSegments, type NoteMeta } from "@/lib/note-paths";
import { Menu } from "./menu";
import { actionError, useVault } from "./vault-context";

type SaveStatus = "saved" | "pending" | "saving" | "error";

const SAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 4000;

export function NoteView({ note }: { note: NoteMeta & { body: string } }) {
  const { openMove, openDelete } = useVault();
  const titleRef = useRef<HTMLInputElement>(null);
  const { body, setBody, status, flush } = useAutosave(note.id, note.body);

  const menuItems = [
    { label: "Renomear", icon: <PencilIcon size={15} />, onSelect: () => titleRef.current?.focus() },
    { label: "Mover para…", icon: <MoveIcon size={15} />, onSelect: () => openMove(note) },
    { label: "Excluir", icon: <TrashIcon size={15} />, danger: true, onSelect: () => openDelete(note) },
  ];

  // Ctrl/Cmd+S salva na hora.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flush();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flush]);

  const words = countWords(body);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho do celular */}
      <div className="flex h-[60px] shrink-0 items-center gap-1 border-b border-border bg-panel px-2 md:hidden">
        <Link
          href="/"
          aria-label="Voltar para as notas"
          className="flex size-11 items-center justify-center rounded-[10px] text-text"
        >
          <ArrowLeftIcon size={22} />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold text-text-strong">{note.title}</div>
          <div className="truncate text-xs text-muted">{displayFolder(note.path)}</div>
        </div>
        <Menu
          label="Mais opções"
          trigger={<MoreIcon size={22} />}
          triggerClassName="flex size-11 items-center justify-center rounded-[10px] text-text"
          items={menuItems}
        />
      </div>

      {/* Abas (desktop) */}
      <div className="hidden h-10 shrink-0 items-stretch border-b border-border bg-rail md:flex">
        <div className="flex min-w-0 max-w-[260px] items-center gap-2.5 border-t-2 border-accent bg-surface pl-4 pr-3 text-[13px] text-text-strong">
          <span className="truncate">{note.title}</span>
          <Link
            href="/"
            aria-label={`Fechar aba ${note.title}`}
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-active hover:text-text"
          >
            <CloseIcon size={12} />
          </Link>
        </div>
      </div>

      {/* Caminho + ações (desktop) */}
      <div className="hidden h-9 shrink-0 items-center gap-2 bg-surface px-4 text-xs text-muted md:flex">
        {folderSegments(note.path).map((seg, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>{seg}</span>
            <span aria-hidden="true">/</span>
          </span>
        ))}
        <span className="truncate text-text">{note.title}</span>
        <div className="flex-1" />
        <Menu
          label="Mais opções"
          trigger={<MoreIcon size={16} />}
          triggerClassName="flex size-6 items-center justify-center rounded-md hover:bg-active hover:text-text"
          items={menuItems}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Editor (CodeMirror entra na etapa 3) */}
        <div className="min-w-0 flex-1 overflow-y-auto bg-surface px-5 pb-16 pt-5 md:px-10 md:pt-10">
          <div className="mx-auto max-w-[700px]">
            <TitleInput key={note.title} ref={titleRef} noteId={note.id} title={note.title} />
            <BodyEditor value={body} onChange={setBody} />
          </div>
        </div>

        {/* Painel direito (desktop largo) */}
        <aside className="hidden w-72 shrink-0 flex-col border-l border-border bg-panel lg:flex">
          <div className="flex h-10 items-center gap-1 px-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-active text-accent">
              <LinkIcon size={16} />
            </span>
            <span className="flex size-7 items-center justify-center rounded-md text-muted">
              <ListIcon size={16} />
            </span>
          </div>
          <div className="px-3.5 pb-4 pt-2">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted">Backlinks</h2>
            <p className="text-xs leading-normal text-muted">
              As notas que apontam para esta com [[links]] vão aparecer aqui.
            </p>
            <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-[0.04em] text-muted">Tópicos</h2>
            <p className="text-xs leading-normal text-muted">Os títulos da nota vão aparecer aqui.</p>
          </div>
        </aside>
      </div>

      {/* Barra de status (desktop) */}
      <div className="hidden h-7 shrink-0 items-center gap-4 border-t border-border bg-rail px-4 text-xs text-muted md:flex">
        <div className="flex-1" />
        <SaveIndicator status={status} />
        <span>
          {words} {words === 1 ? "palavra" : "palavras"}
        </span>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "error") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-danger">
        <CloudAlertIcon size={14} />
        Erro ao salvar, tentando de novo
      </span>
    );
  }
  return (
    <span role="status" className="flex items-center gap-1.5">
      <CloudCheckIcon size={14} className={status === "saved" ? "text-accent" : "text-muted"} />
      {status === "saved" ? "Salvo" : "Salvando…"}
    </span>
  );
}

function TitleInput({
  ref,
  noteId,
  title,
}: {
  ref: React.Ref<HTMLInputElement>;
  noteId: string;
  title: string;
}) {
  const { showError } = useVault();
  const [draft, setDraft] = useState(title);

  const commit = async () => {
    if (draft.trim() === title) {
      setDraft(title);
      return;
    }
    const err = actionError(await renameNoteAction(noteId, draft));
    if (err) {
      showError(err);
      setDraft(title);
    }
  };

  return (
    <input
      ref={ref}
      aria-label="Nome da nota"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(title);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="mb-3 w-full bg-transparent text-[28px] font-semibold leading-tight text-text-strong outline-none md:text-[32px]"
    />
  );
}

function BodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Cresce com o conteúdo para a rolagem ser a do painel.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      aria-label="Conteúdo da nota"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Comece a escrever em Markdown…"
      spellCheck
      className="block min-h-[50vh] w-full resize-none overflow-hidden bg-transparent text-base leading-[1.7] text-[#d3d6dd] outline-none placeholder:text-muted"
    />
  );
}

function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/** Salva o corpo com debounce, tenta de novo em caso de erro e não perde nada ao sair. */
function useAutosave(noteId: string, initial: string) {
  const [body, setBodyState] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const latest = useRef(initial);
  const saved = useRef(initial);
  const saving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => void>(() => {});

  const schedule = useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) return; // o save em andamento reagenda se precisar
    const value = latest.current;
    if (value === saved.current) {
      setStatus("saved");
      return;
    }
    saving.current = true;
    setStatus("saving");
    let ok = false;
    try {
      ok = !actionError(await saveNoteBodyAction(noteId, value));
    } catch {
      ok = false;
    }
    saving.current = false;
    if (ok) saved.current = value;
    if (!ok) {
      setStatus("error");
      schedule(RETRY_DELAY_MS);
    } else if (latest.current !== saved.current) {
      schedule(SAVE_DELAY_MS);
    } else {
      setStatus("saved");
    }
  }, [noteId, schedule]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const setBody = useCallback(
    (value: string) => {
      setBodyState(value);
      latest.current = value;
      setStatus((s) => (s === "error" ? s : "pending"));
      schedule(SAVE_DELAY_MS);
    },
    [schedule],
  );

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
      // Saiu da nota com alteração pendente: salva sem esperar.
      if (latest.current !== saved.current) {
        void saveNoteBodyAction(noteId, latest.current);
      }
    };
  }, [noteId]);

  return { body, setBody, status, flush };
}
