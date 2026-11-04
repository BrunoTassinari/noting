"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renameNoteAction, saveNoteBodyAction } from "@/app/(vault)/actions";
import {
  CancelTaskIcon,
  CloudAlertIcon,
  CloudCheckIcon,
  LinkIcon,
  MenuIcon,
  MigrateIcon,
  NoteIcon,
  MoreIcon,
  MoveIcon,
  PencilIcon,
  TrashIcon,
} from "@/components/icons";
import {
  displayFolder,
  folderSegments,
  type NoteMeta,
  resolveWikilink,
  wikilinkTitle,
} from "@/lib/note-paths";
import { sameWikilinkTargets, type Backlink } from "@/lib/wikilinks";
import { sha256Hex } from "@/lib/hash";
import { parseHeadings } from "@/lib/outline";
import type { EditorApi } from "@/components/editor/markdown-editor";
import { usePublishEditor } from "./active-editor";
import { Backlinks } from "./backlinks";
import { MobileToolbar } from "./mobile-toolbar";
import { Outline } from "./outline";
import { Sheet } from "./sheet";
import { Menu } from "./menu";
import { cancelTasks, MigrateTaskSheet } from "./migrate-task";
import { PROMOTE_EVENT } from "@/components/editor/slash-commands";
import { type PromoteRequest, PromoteSheet, promoteRequest } from "./promote-note";
import { loadNoteBody, onNotesChanged, updateCachedBody } from "./note-cache";
import { periodOf } from "@/lib/bujo";
import { fillTemplate, isTemplate, listTemplates } from "@/lib/templates";
import { PeriodicArrow, PeriodicNav, usePeriodicMenuItems } from "./periodic-nav";
import { markEdited, whenCreated } from "./optimistic-note";
import { TabHistoryNav } from "./tabs";
import { actionError, useVault } from "./vault-context";

type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";

const NO_BACKLINKS: Backlink[] = [];
const SAVE_DELAY_MS = 700;
const RETRY_DELAY_MS = 4000;

export function NoteView({
  note,
  isNew = false,
}: {
  note: NoteMeta & { body: string; backlinks?: Backlink[] };
  /** Nota acabou de ser criada: foca o título para já renomear. */
  isNew?: boolean;
}) {
  const { openMove, openDelete, touchNote, showError } = useVault();
  const titleRef = useRef<HTMLInputElement>(null);
  const { body, setBody, status, flush, generation, loadServerVersion, keepMine } = useAutosave(
    note.id,
    note.body,
    touchNote,
    showError,
  );
  const editorApi = useRef<EditorApi | null>(null);
  const [cursorLine, setCursorLine] = useState<number | null>(null);
  const headings = useMemo(() => parseHeadings(body), [body]);
  const goToLine = useCallback((line: number) => editorApi.current?.goToLine(line), []);
  // Backlinks e Tópicos ficam nas laterais: entrega os dados desta nota a elas.
  usePublishEditor(note.id, { backlinks: note.backlinks ?? NO_BACKLINKS, headings, cursorLine, goToLine });

  const [sheetOpen, setSheetOpen] = useState(false);
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [promote, setPromote] = useState<PromoteRequest | null>(null);
  const editorBox = useRef<HTMLDivElement>(null);
  const openPromote = useCallback(() => {
    const api = editorApi.current;
    if (!api) return;
    const req = promoteRequest(api);
    if (typeof req === "string") showError(req);
    else setPromote(req);
  }, [showError]);
  // "/Virar nota" no editor avisa por um evento no DOM.
  useEffect(() => {
    const el = editorBox.current;
    if (!el) return;
    el.addEventListener(PROMOTE_EVENT, openPromote);
    return () => el.removeEventListener(PROMOTE_EVENT, openPromote);
  }, [openPromote]);
  const backlinkCount = note.backlinks?.length ?? 0;

  const periodicItems = usePeriodicMenuItems(note);
  const menuItems = [
    ...periodicItems,
    {
      label: `Backlinks (${backlinkCount}) e tópicos`,
      icon: <LinkIcon size={15} />,
      className: "md:hidden",
      onSelect: () => setSheetOpen(true),
    },
    { label: "Migrar tarefa…", icon: <MigrateIcon size={15} />, onSelect: () => setMigrateOpen(true) },
    { label: "Virar nota…", icon: <NoteIcon size={15} />, onSelect: openPromote },
    {
      label: "Cancelar tarefa",
      icon: <CancelTaskIcon size={15} />,
      onSelect: () => {
        const err = editorApi.current && cancelTasks(editorApi.current);
        if (err) showError(err);
      },
    },
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
      <div className="flex h-[60px] shrink-0 items-center gap-1 bg-panel px-2 md:hidden">
        <Link
          href="/"
          aria-label="Abrir arquivos"
          className="flex size-11 items-center justify-center rounded-[10px] text-text"
        >
          <MenuIcon size={22} />
        </Link>
        <PeriodicArrow note={note} dir={-1} />
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[15px] font-semibold text-text-strong">{note.title}</div>
          <div className="truncate text-xs text-muted">{displayFolder(note.path)}</div>
        </div>
        <PeriodicArrow note={note} dir={1} />
        <Menu
          label="Mais opções"
          trigger={<MoreIcon size={22} />}
          triggerClassName="flex size-11 items-center justify-center rounded-[10px] text-text"
          items={menuItems}
        />
      </div>

      {/* Caminho + ações (desktop) */}
      <div className="hidden h-9 shrink-0 items-center gap-2 bg-surface px-3 text-xs text-muted md:flex">
        <TabHistoryNav />
        {folderSegments(note.path).map((seg, i) => (
          <span key={i} className="flex items-center gap-2">
            <span>{seg}</span>
            <span aria-hidden="true">/</span>
          </span>
        ))}
        <span className="truncate text-text">{note.title}</span>
        <div className="flex-1" />
        <PeriodicNav note={note} />
        <Menu
          label="Mais opções"
          trigger={<MoreIcon size={16} />}
          triggerClassName="flex size-6 items-center justify-center rounded-md hover:bg-active hover:text-text"
          items={menuItems}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Editor */}
        <div ref={editorBox} className="min-w-0 flex-1 overflow-y-auto bg-surface px-5 pb-16 pt-5 md:px-10 md:pt-10">
          <div className="w-full">
            <TitleInput
              key={note.title}
              ref={titleRef}
              noteId={note.id}
              title={note.title}
              autoSelect={isNew}
            />
            {status === "conflict" && (
              <ConflictBanner onLoad={loadServerVersion} onKeep={keepMine} />
            )}
            {!body.trim() && (
              <TemplatePicker note={note} onPick={(text) => editorApi.current?.setText(text)} />
            )}
            <BodyEditor
              key={generation.n}
              note={note}
              initialValue={generation.body}
              onChange={setBody}
              onCursorLine={setCursorLine}
              onReady={(api) => (editorApi.current = api)}
            />
          </div>
        </div>

      </div>

      <MobileToolbar onFormat={(kind) => editorApi.current?.format(kind)} />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Backlinks e tópicos">
        <div className="flex flex-col gap-6 pt-2">
          <Backlinks items={note.backlinks ?? []} noteId={note.id} />
          <Outline
            headings={headings}
            cursorLine={cursorLine}
            onSelect={(line) => {
              setSheetOpen(false);
              editorApi.current?.goToLine(line);
            }}
          />
        </div>
      </Sheet>

      <PromoteSheet request={promote} onClose={() => setPromote(null)} noteId={note.id} editor={editorApi} />

      <MigrateTaskSheet
        open={migrateOpen}
        onClose={() => setMigrateOpen(false)}
        noteId={note.id}
        editor={editorApi}
      />

      {/* Barra de status (desktop) */}
      <div className="hidden h-7 shrink-0 items-center gap-4 bg-rail px-4 text-xs text-muted md:flex">
        <span>Ctrl K para buscar</span>
        <div className="flex-1" />
        <SaveIndicator status={status} />
        <span>
          {words} {words === 1 ? "palavra" : "palavras"}
        </span>
      </div>
    </div>
  );
}

function ConflictBanner({ onLoad, onKeep }: { onLoad: () => void; onKeep: () => void }) {
  return (
    <div
      role="alert"
      className="mb-5 rounded-lg border border-danger/40 bg-card px-4 py-3 text-sm text-text"
    >
      <p className="font-medium text-text-strong">Esta nota mudou em outro aparelho.</p>
      <p className="mt-1 text-muted">
        O salvamento automático está pausado. Carregue a versão atual (descarta o que você
        digitou aqui) ou mantenha a sua (substitui a do outro aparelho).
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onLoad}
          className="h-11 rounded-md bg-accent px-3 font-medium text-accent-ink md:h-8"
        >
          Carregar a versão atual
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="h-11 rounded-md border border-border px-3 text-text hover:bg-active md:h-8"
        >
          Manter a minha
        </button>
      </div>
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === "conflict") {
    return (
      <span role="status" className="flex items-center gap-1.5 text-danger">
        <CloudAlertIcon size={14} />
        Conflito: não salvo
      </span>
    );
  }
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
  autoSelect,
}: {
  ref: React.RefObject<HTMLInputElement | null>;
  noteId: string;
  title: string;
  autoSelect: boolean;
}) {
  const { showError, reportRelinked } = useVault();
  const [draft, setDraft] = useState(title);

  // Só na montagem: nota nova já vem com o nome selecionado.
  useEffect(() => {
    if (autoSelect) ref.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = async () => {
    if (draft.trim() === title) {
      setDraft(title);
      return;
    }
    let err: string | null;
    try {
      await whenCreated(noteId);
      const res = await renameNoteAction(noteId, draft);
      err = actionError(res);
      if (res.ok) reportRelinked(res.relinked);
    } catch (e) {
      err = (e as Error).message;
    }
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
        if (e.key === "Enter") {
          // Enter no título: vai para o texto (como no Obsidian).
          e.preventDefault();
          const content = e.currentTarget.parentElement?.querySelector<HTMLElement>(".cm-content");
          if (content) content.focus();
          else e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(title);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      className="mb-3 w-full bg-transparent text-[28px] font-semibold leading-tight text-text-strong outline-none md:text-[32px]"
    />
  );
}

/** Nota vazia: oferece os templates da pasta Templates. */
function TemplatePicker({ note, onPick }: { note: NoteMeta; onPick: (text: string) => void }) {
  const { notes, showError } = useVault();
  const [busy, setBusy] = useState<string | null>(null);
  const templates = listTemplates(notes).filter((t) => t.id !== note.id);
  if (templates.length === 0 || isTemplate(note) || periodOf(note)) return null;
  const pick = async (id: string) => {
    setBusy(id);
    const body = await loadNoteBody(id);
    setBusy(null);
    if (body === null) return showError("Não foi possível abrir o template.");
    onPick(fillTemplate(body, { title: note.title }));
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
      <span className="mr-1">Começar com um template:</span>
      {templates.slice(0, 12).map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={busy !== null}
          onClick={() => void pick(t.id)}
          className="h-9 rounded-lg border border-border px-3 text-text hover:bg-card disabled:opacity-50 md:h-7 md:px-2.5"
        >
          {busy === t.id ? "…" : t.title}
        </button>
      ))}
    </div>
  );
}

// CodeMirror só roda no navegador. Enquanto carrega, mostra o texto puro.
const MarkdownEditor = dynamic(() => import("@/components/editor/markdown-editor"), {
  ssr: false,
});

function BodyEditor({
  note,
  initialValue,
  onChange,
  onCursorLine,
  onReady,
}: {
  note: NoteMeta;
  initialValue: string;
  onChange: (v: string) => void;
  onCursorLine: (line: number) => void;
  onReady: (api: EditorApi) => void;
}) {
  const { notes, createNote, goToNote, prefs } = useVault();
  const [ready, setReady] = useState(false);

  const openWikilink = (target: string, newTab: boolean) => {
    const found = resolveWikilink(notes, target, note.path);
    if (found) {
      if (found.id !== note.id || newTab) goToNote(found.id, newTab);
      return;
    }
    // Como no Obsidian: link para nota inexistente cria a nota (na raiz ou na
    // pasta da nota atual, conforme Configurações › Geral). "Pasta/Nome" usa a pasta.
    const title = wikilinkTitle(target);
    const explicit = target.split("|")[0].split("#")[0];
    const folder = explicit.includes("/")
      ? explicit.slice(0, explicit.lastIndexOf("/"))
      : prefs.newLinkedNoteFolder === "same"
        ? note.path
        : "";
    if (title) createNote(folder, title);
  };

  return (
    <>
      {!ready && (
        <div className="min-h-[50vh] whitespace-pre-wrap break-words text-base leading-[1.7] text-body">
          {initialValue}
        </div>
      )}
      <MarkdownEditor
        initialValue={initialValue}
        onChange={onChange}
        onOpenWikilink={openWikilink}
        linkTargets={{ notes, selfId: note.id }}
        onCursorLine={onCursorLine}
        note={{ path: note.path, title: note.title }}
        onReady={(api) => {
          setReady(true);
          onReady(api);
        }}
      />
    </>
  );
}

function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

/**
 * Salva o corpo com debounce, tenta de novo em caso de erro e não perde nada
 * ao sair. Cada save diz de qual versão partiu (hash); se a nota mudou em
 * outro aparelho, o save é recusado e o editor pergunta o que fazer.
 */
function useAutosave(
  noteId: string,
  initial: string,
  onSaved: (id: string, body: string) => void,
  notify: (message: string) => void,
) {
  const [body, setBodyState] = useState(initial);
  const [status, setStatus] = useState<SaveStatus>("saved");
  // Muda quando o texto é trocado por fora (versão do servidor): remonta o editor.
  const [generation, setGeneration] = useState({ n: 0, body: initial });
  const latest = useRef(initial);
  const saved = useRef(initial); // o que acreditamos estar no banco
  const saving = useRef(false);
  const conflict = useRef(false);
  const force = useRef(false); // próximo save sobrescreve ("Manter a minha")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushRef = useRef<() => void>(() => {});
  const notifyRef = useRef(notify);

  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const schedule = useCallback((delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), delay);
  }, []);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current || conflict.current) return; // o save em andamento reagenda se precisar
    const value = latest.current;
    if (value === saved.current) {
      setStatus("saved");
      return;
    }
    saving.current = true;
    setStatus("saving");
    let result: "ok" | "error" | "conflict" = "error";
    try {
      await whenCreated(noteId); // nota otimista: espera existir no banco
      const linksChanged = !sameWikilinkTargets(saved.current, value);
      const baseHash = force.current ? undefined : ((await sha256Hex(saved.current)) ?? undefined);
      const res = await saveNoteBodyAction(noteId, value, { linksChanged, baseHash, onConflict: "report" });
      result = res.ok ? "ok" : "conflict" in res ? "conflict" : "error";
    } catch {
      result = "error";
    }
    saving.current = false;
    if (result === "ok") {
      force.current = false;
      saved.current = value;
      onSaved(noteId, value);
    }
    if (result === "conflict") {
      conflict.current = true;
      setStatus("conflict");
    } else if (result === "error") {
      setStatus("error");
      schedule(RETRY_DELAY_MS);
    } else if (latest.current !== saved.current) {
      schedule(SAVE_DELAY_MS);
    } else {
      setStatus("saved");
    }
  }, [noteId, schedule, onSaved]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const setBody = useCallback(
    (value: string) => {
      setBodyState(value);
      latest.current = value;
      markEdited(noteId);
      if (conflict.current) return; // espera a escolha no aviso
      setStatus((s) => (s === "error" ? s : "pending"));
      schedule(SAVE_DELAY_MS);
    },
    [schedule, noteId],
  );

  /** Troca o texto do editor pelo do servidor. */
  const replaceWith = useCallback(
    (serverBody: string) => {
      clearTimeout(timer.current);
      conflict.current = false;
      force.current = false;
      latest.current = serverBody;
      saved.current = serverBody;
      setBodyState(serverBody);
      setGeneration((g) => ({ n: g.n + 1, body: serverBody }));
      setStatus("saved");
      updateCachedBody(noteId, serverBody);
    },
    [noteId],
  );

  const fetchServerBody = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/notes/${noteId}`, { headers: { accept: "application/json" } });
      if (!res.ok) return null;
      return ((await res.json()) as { note: { body: string } }).note.body;
    } catch {
      return null;
    }
  }, [noteId]);

  /** Conflito → "Carregar a versão atual" (descarta o texto local). */
  const loadServerVersion = useCallback(async () => {
    const serverBody = await fetchServerBody();
    if (serverBody === null) notifyRef.current("Não foi possível carregar a versão atual.");
    else replaceWith(serverBody);
  }, [fetchServerBody, replaceWith]);

  /** Conflito → "Manter a minha" (sobrescreve a do outro aparelho). */
  const keepMine = useCallback(() => {
    conflict.current = false;
    force.current = true;
    void flush();
  }, [flush]);

  // Voltou para esta aba/app sem nada pendente: pega a versão mais nova do
  // servidor antes que você comece a digitar sobre um texto velho.
  useEffect(() => {
    const refreshFromServer = async () => {
      if (saving.current || conflict.current || latest.current !== saved.current) return;
      const before = saved.current;
      const serverBody = await fetchServerBody();
      if (serverBody === null || serverBody === before) return;
      // Ninguém digitou enquanto buscava?
      if (!saving.current && !conflict.current && latest.current === before && saved.current === before) {
        replaceWith(serverBody);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshFromServer();
    };
    // Uma ação fora do editor (configurações, listas, migração) mudou esta nota.
    const stop = onNotesChanged((ids) => {
      if (ids.includes(noteId)) void refreshFromServer();
    });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchServerBody, replaceWith, noteId]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current !== saved.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      clearTimeout(timer.current);
      // Saiu da nota com alteração pendente: salva sem esperar. Se houver
      // conflito, o texto vai para uma nota "(conflito)" em vez de se perder.
      if (latest.current !== saved.current) {
        const value = latest.current;
        const base = saved.current;
        const forced = force.current;
        const linksChanged = !sameWikilinkTargets(base, value);
        void whenCreated(noteId)
          .then(async () => {
            const baseHash = forced ? undefined : ((await sha256Hex(base)) ?? undefined);
            return saveNoteBodyAction(noteId, value, { linksChanged, baseHash, onConflict: "copy" });
          })
          .then((res) => {
            if (res.ok && "copiedTo" in res) {
              notifyRef.current(
                `A nota mudou em outro aparelho. Seu texto foi guardado em “${res.copiedTo}”.`,
              );
            }
          })
          .catch(() => {});
      }
    };
  }, [noteId]);

  return { body, setBody, status, flush, generation, loadServerVersion, keepMine };
}
