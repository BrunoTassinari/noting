"use client";

import { useParams } from "next/navigation";
import {
  createContext,
  use,
  useCallback,
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
import { displayFolder, listFolders, normalizeFolder, type NoteMeta } from "@/lib/note-paths";
import { ConfirmDialog, PromptDialog } from "./dialogs";

type Vault = {
  notes: NoteMeta[];
  folders: string[];
  activeNote: NoteMeta | null;
  /** Pasta "atual": a da nota aberta, ou a raiz. */
  currentFolder: string;
  creating: boolean;
  createNote: (path: string) => void;
  openNewFolder: () => void;
  openMove: (note: NoteMeta) => void;
  openDelete: (note: NoteMeta) => void;
  showError: (message: string) => void;
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
  const activeNote = useMemo(
    () => notes.find((n) => n.id === params.id) ?? null,
    [notes, params.id],
  );
  const folders = useMemo(() => listFolders(notes), [notes]);
  const currentFolder = activeNote?.path ?? "";

  const [rawDialog, setDialog] = useState<DialogState>({ kind: "none" });
  const dialog: DialogState = rawDialog.at === params.id ? rawDialog : { kind: "none" };
  const close = useCallback(() => setDialog({ kind: "none" }), []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showError = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }, []);

  const [creating, startCreate] = useTransition();
  const createNote = useCallback(
    (path: string) =>
      startCreate(async () => {
        const err = actionError(await createNoteAction(path));
        if (err) showError(err);
      }),
    [showError],
  );

  const value: Vault = {
    notes,
    folders,
    activeNote,
    currentFolder,
    creating,
    createNote,
    openNewFolder: () => setDialog({ kind: "folder", at: params.id }),
    openMove: (note) => setDialog({ kind: "move", note, at: params.id }),
    openDelete: (note) => setDialog({ kind: "delete", note, at: params.id }),
    showError,
  };

  return (
    <VaultContext value={value}>
      {children}

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
          const err = actionError(await createNoteAction(path));
          if (!err) close();
          return err;
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
          const err = actionError(await moveNoteAction(dialog.note.id, value));
          if (!err) close();
          return err;
        }}
      />

      <ConfirmDialog
        open={dialog.kind === "delete"}
        onClose={close}
        title="Excluir nota"
        message={
          dialog.kind === "delete" ? (
            <>
              Excluir <strong className="text-text">{dialog.note.title}</strong> (
              {displayFolder(dialog.note.path)})? Não dá para desfazer.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        onConfirm={async () => {
          if (dialog.kind !== "delete") return null;
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
