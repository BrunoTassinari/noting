"use client";

import { useEffect, useState } from "react";
import {
  deleteForeverAction,
  emptyTrashAction,
  loadTrashAction,
  restoreNoteAction,
} from "@/app/(vault)/trash-actions";
import { TrashIcon, UndoIcon } from "@/components/icons";
import { displayFolder } from "@/lib/note-paths";
import type { TrashItem } from "@/server/trash";
import { ConfirmDialog } from "./dialogs";
import { forgetCachedNote } from "./note-cache";
import { ScreenHeader } from "./screen-header";
import { useVault } from "./vault-context";

const KEEP_DAYS = 30;
const DAY = 86_400_000;
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "hoje", "ontem", "12 out", "12 out 2025". */
function dayLabel(iso: string, now: Date): string {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "hoje";
  if (d.getTime() >= start - DAY) return "ontem";
  const label = `em ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? label : `${label} ${d.getFullYear()}`;
}

function daysLeft(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() + KEEP_DAYS * DAY - now.getTime()) / DAY));
}

type Confirm = { kind: "none" } | { kind: "forever"; item: TrashItem } | { kind: "empty" };

/** Tela "Lixeira": notas excluídas nos últimos 30 dias. */
export function TrashScreen() {
  const { showError } = useVault();
  const [items, setItems] = useState<TrashItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });

  useEffect(() => {
    let cancelled = false;
    loadTrashAction()
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setItems(res.items);
        else showError(res?.error ?? "Não foi possível carregar a lixeira.");
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const restore = async (item: TrashItem) => {
    setBusy(item.id);
    try {
      const res = await restoreNoteAction(item.id);
      if (!res.ok) return showError(res.error);
      forgetCachedNote(item.id);
      setItems(res.items);
      showError(
        res.note.title === item.title
          ? `“${item.title}” restaurada.`
          : `Já havia uma nota com esse nome: restaurada como “${res.note.title}”.`,
      );
    } catch {
      showError("Não foi possível restaurar. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  const close = () => setConfirm({ kind: "none" });
  const now = new Date();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Lixeira"
        subtitle={
          items
            ? `${items.length} ${items.length === 1 ? "nota" : "notas"} · somem após ${KEEP_DAYS} dias`
            : "Carregando…"
        }
        actions={
          items &&
          items.length > 0 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirm({ kind: "empty" })}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm text-danger hover:bg-active disabled:opacity-50 md:h-8"
            >
              <TrashIcon size={15} />
              Esvaziar<span className="hidden md:inline"> lixeira</span>
            </button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 md:px-6">
        <div className="mx-auto max-w-[820px]">
          {items === null ? (
            <p className="py-10 text-center text-sm text-muted">Carregando…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
                <TrashIcon size={22} />
              </span>
              <p className="text-base font-medium text-text">A lixeira está vazia</p>
              <p className="text-[13px] text-muted">
                Notas excluídas ficam aqui por {KEEP_DAYS} dias antes de serem apagadas de vez.
              </p>
            </div>
          ) : (
            <ul>
              {items.map((item) => {
                const left = daysLeft(item.deletedAt, now);
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-3 border-b border-border/60 py-2.5 md:py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-text md:text-sm">{item.title}</p>
                      <p className="truncate text-xs text-muted">
                        {displayFolder(item.path)} · excluída {dayLabel(item.deletedAt, now)} ·{" "}
                        {left <= 1 ? "some amanhã" : `some em ${left} dias`}
                      </p>
                      {item.excerpt && (
                        <p className="mt-0.5 hidden truncate text-[13px] text-text-soft md:block">{item.excerpt}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => restore(item)}
                      aria-label={`Restaurar ${item.title}`}
                      title="Restaurar"
                      className="flex size-11 shrink-0 items-center justify-center gap-2 rounded-lg text-accent hover:bg-active disabled:opacity-50 md:h-8 md:w-auto md:border md:border-border md:px-3 md:text-sm"
                    >
                      <UndoIcon size={16} />
                      <span className="hidden md:inline">Restaurar</span>
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => setConfirm({ kind: "forever", item })}
                      aria-label={`Excluir para sempre ${item.title}`}
                      title="Excluir para sempre"
                      className="flex size-11 shrink-0 items-center justify-center gap-2 rounded-lg text-muted hover:bg-active hover:text-danger disabled:opacity-50 md:h-8 md:w-auto md:px-3 md:text-sm"
                    >
                      <TrashIcon size={16} />
                      <span className="hidden md:inline">Excluir para sempre</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm.kind === "forever"}
        onClose={close}
        title="Excluir para sempre"
        message={
          confirm.kind === "forever" ? (
            <>
              Apagar <strong className="text-text">{confirm.item.title}</strong> (
              {displayFolder(confirm.item.path)}) de vez? Não dá para desfazer.
            </>
          ) : null
        }
        confirmLabel="Excluir para sempre"
        onConfirm={async () => {
          if (confirm.kind !== "forever") return null;
          const res = await deleteForeverAction(confirm.item.id).catch(() => null);
          if (!res) return "Não foi possível excluir. Tente de novo.";
          if (!res.ok) return res.error;
          setItems(res.items);
          close();
          return null;
        }}
      />

      <ConfirmDialog
        open={confirm.kind === "empty"}
        onClose={close}
        title="Esvaziar lixeira"
        message={
          <>
            Apagar de vez {items?.length === 1 ? "a nota" : `as ${items?.length ?? 0} notas`} da lixeira? Não dá
            para desfazer.
          </>
        }
        confirmLabel="Esvaziar"
        onConfirm={async () => {
          const res = await emptyTrashAction().catch(() => null);
          if (!res) return "Não foi possível esvaziar. Tente de novo.";
          if (!res.ok) return res.error;
          setItems([]);
          close();
          showError(`${res.removed === 1 ? "1 nota apagada" : `${res.removed} notas apagadas`} de vez.`);
          return null;
        }}
      />
    </div>
  );
}
