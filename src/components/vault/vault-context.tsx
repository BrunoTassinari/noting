"use client";

import { useParams, useRouter } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  createNoteAction,
  deleteNoteAction,
  moveNoteAction,
  type ActionResult,
} from "@/app/(vault)/actions";
import {
  displayFolder,
  listFolders,
  nextFreeTitle,
  normalizeFolder,
  type NoteMeta,
} from "@/lib/note-paths";
import { makeExcerpt } from "@/lib/markdown-text";
import { isoMonth, monthFromMonthly } from "@/lib/bujo";
import { loadMonth } from "@/components/editor/bujo-month-store";
import { ConfirmDialog, PromptDialog } from "./dialogs";
import { forgetCachedNote, getCachedNote, onNotesChanged, updateCachedBody } from "./note-cache";
import { SearchPalette } from "./search-palette";
import {
  clearOptimisticNote,
  failOptimisticNote,
  startOpeningNote,
  startOptimisticNote,
  useOptimisticNote,
  whenCreated,
  type OptimisticNote,
} from "./optimistic-note";

type Vault = {
  notes: NoteMeta[];
  folders: string[];
  activeNote: NoteMeta | null;
  /** Nota recém-criada que o layout mostra antes da página real chegar. */
  optimisticNote: OptimisticNote | null;
  /** Pasta "atual": a da nota aberta, ou a raiz. */
  currentFolder: string;
  creating: boolean;
  /** Cria e abre uma nota. Sem título → "Sem título", "Sem título 2"... */
  createNote: (path: string, title?: string) => void;
  openNewFolder: () => void;
  openSearch: () => void;
  openMove: (note: NoteMeta) => void;
  openDelete: (note: NoteMeta) => void;
  showError: (message: string) => void;
  /** Renomear/mover reescreveu [[links]] nestas notas: limpa o cache e avisa. */
  reportRelinked: (ids: string[]) => void;
  /** Mostra a nota na hora (do cache, ou um esqueleto). Chame no clique de um link. */
  openNote: (id: string) => void;
  /** openNote + navega (para quem não usa <Link>). */
  goToNote: (id: string) => void;
  /** Uma nota foi salva: atualiza resumo e data na lista sem ir ao servidor. */
  touchNote: (id: string, body: string) => void;
};

const VaultContext = createContext<Vault | null>(null);

export function useVault(): Vault {
  const v = use(VaultContext);
  if (!v) throw new Error("useVault fora do VaultProvider");
  return v;
}

/** Erro de uma action, ou null. Actions que redirecionam podem não retornar nada. */
export function actionError(res: ActionResult | undefined): string | null {
  return res && !res.ok ? res.error : null;
}

// `at` = nota aberta quando o diálogo abriu. Se a action navegar para outra
// nota (criar, excluir), o diálogo some sozinho.
type DialogState = { at?: string } & (
  | { kind: "none" }
  | { kind: "folder" }
  | { kind: "move"; note: NoteMeta }
  | { kind: "delete"; note: NoteMeta }
);

export function VaultProvider({ notes, children }: { notes: NoteMeta[]; children: ReactNode }) {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const optimistic = useOptimisticNote();
  const optimisticNote =
    optimistic && (optimistic.pending || optimistic.opening || optimistic.id === params.id)
      ? optimistic
      : null;
  const activeId = optimisticNote?.id ?? params.id;

  // Saiu da nota: daqui em diante ela vem do servidor.
  useEffect(() => {
    if (optimistic && !optimistic.pending && !optimistic.opening && optimistic.id !== params.id) {
      clearOptimisticNote();
    }
  }, [optimistic, params.id]);

  // Saves recentes (o layout não é recarregado a cada autosave) e notas
  // alteradas por ações fora do editor (listas, migração…), que também não
  // recarregam o layout: só a data muda na lista local.
  const [touched, setTouched] = useState<Record<string, { updatedAt: string; excerpt?: string }>>({});
  const touchNote = useCallback((id: string, body: string) => {
    updateCachedBody(id, body);
    setTouched((t) => ({ ...t, [id]: { updatedAt: new Date().toISOString(), excerpt: makeExcerpt(body) } }));
  }, []);
  useEffect(
    () =>
      onNotesChanged((ids) => {
        const updatedAt = new Date().toISOString();
        setTouched((t) => {
          const next = { ...t };
          for (const id of ids) next[id] = t[id]?.excerpt === undefined ? { updatedAt } : { ...t[id], updatedAt };
          return next;
        });
      }),
    [],
  );

  // Árvore inclui a nota otimista enquanto o servidor não confirma.
  const allNotes = useMemo(() => {
    const base =
      optimisticNote && !notes.some((n) => n.id === optimisticNote.id)
        ? [...notes, optimisticNote]
        : notes;
    return base.map((n) => {
      const t = touched[n.id];
      return t && t.updatedAt > n.updatedAt ? { ...n, ...t } : n;
    });
  }, [notes, optimisticNote, touched]);
  const activeNote = useMemo(
    () => allNotes.find((n) => n.id === activeId) ?? null,
    [allNotes, activeId],
  );
  const folders = useMemo(() => listFolders(allNotes), [allNotes]);
  const currentFolder = activeNote?.path ?? "";

  const [rawDialog, setDialog] = useState<DialogState>({ kind: "none" });
  const dialog: DialogState = rawDialog.at === activeId ? rawDialog : { kind: "none" };
  const close = useCallback(() => setDialog({ kind: "none" }), []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showError = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const reportRelinked = useCallback(
    (ids: string[]) => {
      ids.forEach(forgetCachedNote);
      if (ids.length > 0) {
        showError(`Links atualizados em ${ids.length} ${ids.length === 1 ? "nota" : "notas"}.`);
      }
    },
    [showError],
  );

  // Busca: Ctrl/Cmd+K de qualquer lugar (inclusive de dentro do editor).
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  const [creating, startCreate] = useTransition();
  // Criação otimista: a nota aparece na hora; o servidor grava em seguida e
  // navega para /n/<id>, onde a página real "adota" o editor já aberto.
  const createNote = useCallback(
    (path: string, base?: string) => {
      const id = crypto.randomUUID();
      const title = nextFreeTitle(
        allNotes.filter((n) => n.path === path).map((n) => n.title),
        base,
      );
      startOptimisticNote({ id, path, title, updatedAt: new Date().toISOString() });
      startCreate(async () => {
        const err = actionError(await createNoteAction({ id, path, title }));
        if (err) {
          failOptimisticNote(id, err);
          showError(err);
        }
      });
    },
    [allNotes, showError],
  );

  const openNote = useCallback(
    (id: string) => {
      if (id === activeId) return;
      const meta = allNotes.find((n) => n.id === id);
      if (!meta) return;
      startOpeningNote(meta, getCachedNote(id));
      // Nota do mês: os dados da tabela de hábitos/gráfico vêm de outra
      // requisição; começa já, junto com a nota, em vez de depois do editor.
      const month = monthFromMonthly(meta);
      if (month) void loadMonth(isoMonth(month));
    },
    [activeId, allNotes],
  );
  const goToNote = useCallback(
    (id: string) => {
      openNote(id);
      router.push(`/n/${id}`);
    },
    [openNote, router],
  );

  const value: Vault = {
    notes: allNotes,
    folders,
    activeNote,
    optimisticNote,
    currentFolder,
    creating,
    createNote,
    openNewFolder: () => setDialog({ kind: "folder", at: activeId }),
    openSearch: () => setSearchOpen(true),
    touchNote,
    openNote,
    goToNote,
    openMove: (note) => setDialog({ kind: "move", note, at: activeId }),
    openDelete: (note) => setDialog({ kind: "delete", note, at: activeId }),
    showError,
    reportRelinked,
  };

  return (
    <VaultContext value={value}>
      {children}

      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        notes={allNotes}
        onCreate={(title) => createNote(currentFolder, title)}
      />

      <PromptDialog
        open={dialog.kind === "folder"}
        onClose={close}
        title="Nova pasta"
        label="Caminho da pasta"
        initialValue={currentFolder ? `${currentFolder}/` : ""}
        placeholder="Ex.: Projetos/app-notas"
        hint="Use / para criar subpastas. Uma nota “Sem título” é criada dentro dela."
        confirmLabel="Criar"
        onSubmit={async (value) => {
          const path = normalizeFolder(value);
          if (!path) return "Informe o nome da pasta.";
          close();
          createNote(path);
          return null;
        }}
      />

      <PromptDialog
        open={dialog.kind === "move"}
        onClose={close}
        title={dialog.kind === "move" ? `Mover “${dialog.note.title}”` : "Mover"}
        label="Pasta de destino"
        initialValue={dialog.kind === "move" ? dialog.note.path : ""}
        placeholder="Vazio = raiz do vault"
        hint="Escolha uma pasta existente ou digite uma nova."
        suggestions={folders}
        confirmLabel="Mover"
        onSubmit={async (value) => {
          if (dialog.kind !== "move") return null;
          await whenCreated(dialog.note.id).catch(() => {});
          const res = await moveNoteAction(dialog.note.id, value);
          if (!res.ok) return res.error;
          close();
          reportRelinked(res.relinked);
          return null;
        }}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={close}
        title="Excluir nota"
        message={
          dialog.kind === "delete" ? (
            <>
              Mover <strong className="text-text">{dialog.note.title}</strong> (
              {displayFolder(dialog.note.path)}) para a lixeira? Dá para restaurar em até 30 dias.
            </>
          ) : null
        }
        confirmLabel="Mover para a lixeira"
        onConfirm={async () => {
          if (dialog.kind !== "delete") return null;
          await whenCreated(dialog.note.id).catch(() => {});
          const err = actionError(await deleteNoteAction(dialog.note.id));
          if (!err) close();
          return err;
        }}
      />

      {toast && (
        <div
          role="alert"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-lg border border-border bg-card px-4 py-3 text-sm text-text shadow-lg"
        >
          {toast}
        </div>
      )}
    </VaultContext>
  );
}
