"use client";

import { useCallback, useState } from "react";
import {
  addListItemAction,
  deleteListItemAction,
  loadListsAction,
  studyNoteAction,
  updateListItemAction,
} from "@/app/(vault)/lists-actions";
import {
  BookIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MoreIcon,
  NoteIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
} from "@/components/icons";
import { LISTS_FOLDER } from "@/lib/bujo";
import type { ListItem } from "@/lib/lists";
import type { TaskState } from "@/lib/tasks";
import type { ListsPayload } from "@/server/lists";
import { openContextMenu, openMenuAt } from "./context-menu";
import type { MenuItem } from "./menu";
import { StateBox } from "./list-state";
import { useReloadOnFocus } from "./sidebar-quick";
import { useVault } from "./vault-context";

// Painel de Listas da barra lateral: escolher a lista, adicionar item com
// Enter, marcar e agir em cada item (estado, avaliação, notas de estudo,
// excluir) pelo menu "…" ou clique direito — sem sair da nota.

const LIST_KEY = "noting-sidebar-list";

type Ref = { noteId: string; line: number; raw: string };

export function ListsPanel() {
  const { showError, goToNote, createNote } = useVault();
  const [data, setData] = useState<ListsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(LIST_KEY);
    } catch {
      return null;
    }
  });
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // linha com avaliação aberta
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void loadListsAction(selected).then((r) => {
      if (r.ok) {
        setData(r.data);
        setError(null);
      } else setError(r.error);
    });
  }, [selected]);
  useReloadOnFocus(load);

  const choose = (id: string) => {
    setSelected(id);
    setEditing(null);
    try {
      localStorage.setItem(LIST_KEY, id);
    } catch {
      // ok
    }
  };

  /** Roda uma ação e aplica a lista devolvida (ou mostra o erro e recarrega). */
  const apply = async (p: Promise<{ ok: true; data: ListsPayload } | { ok: false; error: string }>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) setData(r.data);
    else {
      showError(r.error);
      load();
    }
    return r.ok;
  };

  if (error) return <p className="px-3 py-4 text-[13px] text-muted">{error}</p>;
  if (!data) return <p className="px-3 py-4 text-[13px] text-muted">Carregando…</p>;

  const newList = () => {
    const name = window.prompt("Nome da nova lista (ex.: Livros, Filmes, Compras)");
    if (name?.trim()) createNote(LISTS_FOLDER, name.trim());
  };

  if (data.lists.length === 0) {
    return (
      <div className="px-3 py-4 text-[13px] text-muted">
        <p>Nenhuma lista ainda.</p>
        <button type="button" onClick={newList} className="mt-2 font-medium text-accent hover:underline">
          Criar a primeira lista
        </button>
      </div>
    );
  }

  const current = data.current;
  const refOf = (i: ListItem): Ref => ({ noteId: current!.id, line: i.line, raw: i.raw });
  const setState = (i: ListItem, state: TaskState) => apply(updateListItemAction(refOf(i), { state }));

  const add = async () => {
    const title = draft.trim();
    if (!title || !current || busy) return;
    // "🛒 pão" ou "pão 🛒" marca como compra.
    const buy = /🛒/u.test(title);
    const clean = title.replace(/🛒/gu, "").trim();
    if (await apply(addListItemAction(current.id, clean || title, " ", buy))) setDraft("");
  };

  const openStudy = async (i: ListItem, newTab = false) => {
    const r = await studyNoteAction(current!.id, i.title);
    if (r.ok) goToNote(r.id, newTab);
    else showError(r.error);
  };

  const menuFor = (i: ListItem): MenuItem[] => {
    const states: [TaskState, string][] = [
      [" ", "Na fila"],
      ["/", "Em andamento"],
      ["x", "Concluído"],
      ["-", "Desisti"],
    ];
    return [
      ...states
        .filter(([s]) => s !== i.state)
        .map(([s, label]) => ({
          label,
          icon: <StateBox state={s} />,
          onSelect: () => void setState(i, s),
        })),
      { label: i.rating || i.comment ? "Editar avaliação" : "Avaliar (★ e comentário)", icon: <StarIcon size={15} />, onSelect: () => setEditing(i.line) },
      { label: "Notas de estudo", icon: <BookIcon size={15} />, onSelect: () => void openStudy(i) },
      { label: "Notas de estudo em nova aba", icon: <BookIcon size={15} />, desktopOnly: true, onSelect: () => void openStudy(i, true) },
      { label: "Abrir a lista", icon: <NoteIcon size={15} />, onSelect: () => goToNote(current!.id) },
      {
        label: "Excluir item",
        icon: <TrashIcon size={15} />,
        danger: true,
        onSelect: () => {
          if (window.confirm(`Excluir “${i.title}” da lista?`)) void apply(deleteListItemAction(refOf(i)));
        },
      },
    ];
  };

  const items = current?.items ?? [];
  const doing = items.filter((i) => i.state === "/");
  const queue = items.filter((i) => i.state === " ");
  const done = items.filter((i) => i.state === "x" || i.state === "-");

  const renderRow = (i: ListItem) => (
    <li key={i.line}>
      <div
        className="group flex min-h-11 items-start gap-2 rounded-md px-2 py-1.5 hover:bg-card md:min-h-7"
        onContextMenu={(e) => {
          e.preventDefault();
          openContextMenu({ x: e.clientX, y: e.clientY }, menuFor(i), i.title);
        }}
      >
        <button
          type="button"
          aria-label={i.state === "x" ? `Voltar ${i.title} para a fila` : `Concluir ${i.title}`}
          title={i.state === "x" ? "Voltar para a fila" : "Concluir"}
          disabled={busy}
          onClick={() => void setState(i, i.state === "x" || i.state === "-" ? " " : "x")}
          className="mt-[1px] flex shrink-0 items-center justify-center max-md:size-6"
        >
          <StateBox state={i.state} />
        </button>
        <button
          type="button"
          onClick={(e) => openMenuAt(e.currentTarget, menuFor(i), i.title)}
          className={`min-w-0 flex-1 break-words text-left text-[15px] md:text-[13px] ${
            i.state === "x" || i.state === "-" ? "text-muted line-through" : "text-text"
          }`}
        >
          {i.buy && <span className="mr-1">🛒</span>}
          {i.title}
          {i.rating && <span className="ml-1.5 text-xs font-semibold text-accent">★ {i.rating}</span>}
          {i.comment && <span className="mt-0.5 block text-xs italic text-muted">{i.comment}</span>}
        </button>
        <button
          type="button"
          aria-label={`Ações de ${i.title}`}
          title="Ações"
          onClick={(e) => openMenuAt(e.currentTarget, menuFor(i), i.title)}
          className="flex size-9 shrink-0 items-center justify-center rounded text-muted hover:bg-active hover:text-text md:size-6 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
        >
          <MoreIcon size={14} />
        </button>
      </div>
      {editing === i.line && <EvalForm item={i} onCancel={() => setEditing(null)} onSave={async (rating, comment) => {
        if (await apply(updateListItemAction(refOf(i), { evaluation: { rating, comment } }))) setEditing(null);
      }} />}
    </li>
  );

  const renderGroup = (title: string, list: ListItem[]) =>
    list.length ? (
      <div className="mb-2">
        <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
          {title} · {list.length}
        </div>
        <ul className="flex flex-col gap-px">
          {list.map(renderRow)}
        </ul>
      </div>
    ) : null;

  return (
    <div className="pb-4">
      {/* Listas como fichas */}
      <div className="flex flex-wrap gap-1 px-1 pb-2">
        {data.lists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => choose(l.id)}
            className={`flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[13px] md:h-7 md:text-xs ${
              l.id === current?.id
                ? "border-accent/60 bg-active text-text-strong"
                : "border-border text-text-soft hover:bg-card"
            }`}
          >
            {l.name}
            <span className="text-muted">{l.open}</span>
          </button>
        ))}
        <button
          type="button"
          aria-label="Nova lista"
          title="Nova lista"
          onClick={newList}
          className="flex size-9 items-center justify-center rounded-md border border-dashed border-border text-muted hover:text-text md:size-7"
        >
          <PlusIcon size={13} />
        </button>
      </div>

      {current && (
        <>
          <form
            className="px-1 pb-2"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`Adicionar em ${current.name}… (Enter)`}
              aria-label={`Adicionar item em ${current.name}`}
              className="h-11 w-full rounded-lg border border-border bg-rail px-3 text-[15px] text-text outline-none placeholder:text-muted focus:border-accent md:h-8 md:text-[13px]"
            />
          </form>

          {queue.length + doing.length === 0 && (
            <p className="px-2 py-2 text-[13px] text-muted">Nada em aberto. Adicione acima.</p>
          )}
          {renderGroup("Em andamento", doing)}
          {renderGroup("Na fila", queue)}

          {done.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                className="flex h-9 w-full items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted hover:text-text md:h-7"
              >
                {showDone ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
                Concluídos · {done.length}
              </button>
              {showDone && (
                <ul className="flex flex-col gap-px">
                  {done.map(renderRow)}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EvalForm({
  item,
  onSave,
  onCancel,
}: {
  item: ListItem;
  onSave: (rating: string | null, comment: string | null) => void;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(item.rating ?? "");
  const [comment, setComment] = useState(item.comment ?? "");
  const bad = rating.trim() !== "" && !/^\d{1,3}([.,]\d{1,2})?$/.test(rating.trim());
  return (
    <form
      className="mx-2 mb-2 flex flex-col gap-1.5 rounded-lg border border-border bg-panel p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!bad) onSave(rating.trim() || null, comment.trim() || null);
      }}
    >
      <div className="flex gap-1.5">
        <input
          autoFocus
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          placeholder="★ nota"
          inputMode="decimal"
          aria-label="Nota"
          className={`h-9 w-20 rounded-md border bg-rail px-2 text-[13px] text-text outline-none md:h-7 ${bad ? "border-danger" : "border-border focus:border-accent"}`}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comentário"
          aria-label="Comentário"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-rail px-2 text-[13px] text-text outline-none focus:border-accent md:h-7"
        />
      </div>
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onCancel} className="h-9 rounded-md px-2.5 text-[13px] text-muted hover:text-text md:h-7">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={bad}
          className="flex h-9 items-center gap-1 rounded-md bg-accent px-2.5 text-[13px] font-medium text-accent-ink disabled:opacity-50 md:h-7"
        >
          <CheckIcon size={13} /> Salvar
        </button>
      </div>
    </form>
  );
}
