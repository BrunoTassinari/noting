"use client";

import { useState } from "react";
import { promoteAction } from "@/app/(vault)/link-actions";
import type { EditorApi } from "@/components/editor/markdown-editor";
import { acervoAreas, planPromote, type PromotePlan, spaceOf } from "@/lib/promote";
import { buttonBase } from "./dialogs";
import { whenCreated } from "./optimistic-note";
import { Sheet } from "./sheet";
import { useVault } from "./vault-context";

export type PromoteRequest = { plan: Extract<PromotePlan, { ok: true }>; expected: string[] };

/** Monta o pedido a partir da linha do cursor (ou seleção); string = erro. */
export function promoteRequest(api: EditorApi): PromoteRequest | string {
  const sel = api.lineSelection();
  const plan = planPromote(sel.lines, sel.from, sel.to);
  if (!plan.ok) return plan.error;
  return { plan, expected: sel.lines.slice(plan.start, plan.end + 1) };
}

/** "Virar nota…": escolhe título e área; cria a nota e troca a linha pelo link. */
export function PromoteSheet({
  request,
  onClose,
  noteId,
  editor,
}: {
  request: PromoteRequest | null;
  onClose: () => void;
  noteId: string;
  editor: React.RefObject<EditorApi | null>;
}) {
  return (
    <Sheet open={request !== null} onClose={onClose} title="Virar nota">
      {request && <PromoteForm key={request.plan.start} request={request} onClose={onClose} noteId={noteId} editor={editor} />}
    </Sheet>
  );
}

const LAST_FOLDER_KEY = "noting-promote-folder";

function PromoteForm({
  request,
  onClose,
  noteId,
  editor,
}: {
  request: PromoteRequest;
  onClose: () => void;
  noteId: string;
  editor: React.RefObject<EditorApi | null>;
}) {
  const { folders, notes, showError, goToNote, prefs } = useVault();
  const { plan, expected } = request;
  const [title, setTitle] = useState(plan.title);
  const [folder, setFolder] = useState(() => {
    try {
      return localStorage.getItem(LAST_FOLDER_KEY) ?? "Conhecimento";
    } catch {
      return "Conhecimento";
    }
  });
  const [open, setOpen] = useState(prefs.openPromotedNote);
  const [busy, setBusy] = useState(false);
  const areas = acervoAreas(folders);
  const acervoFolders = folders.filter((f) => spaceOf(f) === "acervo");
  const preview = plan.body.split("\n").slice(0, 6).join("\n");

  const submit = async () => {
    const api = editor.current;
    if (!api || !title.trim()) return;
    setBusy(true);
    try {
      await whenCreated(noteId);
      const res = await promoteAction({ originId: noteId, folder: folder.trim(), title: title.trim(), body: plan.body });
      if (!res.ok) {
        showError(res.error);
        return;
      }
      try {
        localStorage.setItem(LAST_FOLDER_KEY, folder.trim());
      } catch {
        // ok
      }
      const { note } = res;
      const sameName = notes.some((n) => n.title.toLowerCase() === note.title.toLowerCase() && n.id !== note.id);
      const link = `[[${sameName && note.path ? `${note.path}/${note.title}` : note.title}]]`;
      const replaced = api.replaceLines(plan.start, plan.end, expected, [plan.replacement.replace("{{link}}", link)]);
      onClose();
      if (!replaced) showError(`Nota “${note.title}” criada, mas o texto mudou aqui: ponha o link à mão.`);
      else if (!open) showError(`Virou a nota “${note.title}” em ${note.path || "raiz"}.`);
      if (open) goToNote(note.id);
    } finally {
      setBusy(false);
    }
  };

  const input =
    "h-11 w-full rounded-lg border border-border bg-rail px-3 text-base text-text outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm";

  return (
    <form
      className="flex flex-col gap-3 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted">Título</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} autoFocus maxLength={200} />
      </label>

      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Onde guardar</span>
        <div className="flex flex-wrap gap-1.5">
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setFolder(a)}
              className={`h-9 rounded-lg px-3 text-[13px] md:h-8 ${
                folder === a ? "bg-active text-text-strong" : "border border-border text-text hover:bg-card"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          list="promote-folders"
          placeholder="Pasta (ex.: Conhecimento/Psicologia)"
          aria-label="Pasta"
          className={input}
        />
        <datalist id="promote-folders">
          {acervoFolders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>

      <pre className="max-h-32 overflow-hidden whitespace-pre-wrap rounded-lg bg-card px-3 py-2 font-sans text-xs leading-relaxed text-text-soft">
        {preview}
        {plan.body.split("\n").length > 6 ? "\n…" : ""}
      </pre>
      <p className="text-xs text-muted">
        A nota leva este texto e “Surgiu em” com o link para cá; aqui a linha vira um link para a nota.
      </p>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-text-soft md:min-h-0">
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        Abrir a nota nova
      </label>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={`${buttonBase} text-text-soft hover:bg-card`}>
          Cancelar
        </button>
        <button type="submit" disabled={busy || !title.trim()} className={`${buttonBase} bg-accent text-accent-ink`}>
          {busy ? "Criando…" : "Virar nota"}
        </button>
      </div>
    </form>
  );
}
