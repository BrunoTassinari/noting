"use client";

import { useState } from "react";
import { moveToDestinationAction } from "@/app/(vault)/migrate-actions";
import type { EditorApi } from "@/components/editor/markdown-editor";
import {
  CalendarIcon,
  ChevronRightIcon,
  InboxIcon,
  MigrateIcon,
} from "@/components/icons";
import { addDays, addMonths, dailyRef, isoDay, monthlyRef, today } from "@/lib/bujo";
import { destinationSpec, DESTINATIONS, type Destination, planMove, setTaskState } from "@/lib/migrate";
import { forgetCachedNote } from "./note-cache";
import { whenCreated } from "./optimistic-note";
import { Sheet } from "./sheet";
import { useVault } from "./vault-context";

/** Nome curto do arquivo de destino, para a lista ("2026.11.02", "Future Log"...). */
export function destinationHint(dest: Destination, now = today()): string {
  switch (dest) {
    case "today":
      return dailyRef(now).title;
    case "tomorrow":
      return dailyRef(addDays(now, 1)).title;
    case "month":
      return `${monthlyRef(now).title} · Tarefas`;
    case "nextMonth":
      return `Future Log · ${isoDay(addMonths(now, 1)).slice(0, 7)}`;
    case "backlog":
      return "Bullet Journal/Pendências";
  }
}

const destIcon = (d: Destination) =>
  d === "backlog" ? <InboxIcon size={18} /> : d === "today" || d === "tomorrow" ? <CalendarIcon size={18} /> : <MigrateIcon size={18} />;

/** Lista de destinos (botões grandes, para o celular). */
export function DestinationList({
  onPick,
  disabled,
  exclude = [],
}: {
  onPick: (dest: Destination) => void;
  disabled?: boolean;
  exclude?: Destination[];
}) {
  const now = today();
  return (
    <ul className="flex flex-col gap-1 pb-2 pt-1">
      {DESTINATIONS.filter((d) => !exclude.includes(d.key)).map((d) => (
        <li key={d.key}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(d.key)}
            className="flex h-14 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-active active:bg-active disabled:opacity-50 md:h-11"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-accent">
              {destIcon(d.key)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-text-strong md:text-sm">{d.label}</span>
              <span className="block truncate text-xs text-muted">{destinationHint(d.key, now)}</span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-muted" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Migrar tarefa…": move a linha do cursor (com subitens) ou a seleção da
 * nota aberta. O destino é gravado no servidor; a origem muda no editor
 * (o autosave grava), para não criar conflito com a nota aberta.
 */
export function MigrateTaskSheet({
  open,
  onClose,
  noteId,
  editor,
}: {
  open: boolean;
  onClose: () => void;
  noteId: string;
  editor: React.RefObject<EditorApi | null>;
}) {
  const { showError } = useVault();
  const [busy, setBusy] = useState(false);

  const migrate = async (dest: Destination) => {
    const api = editor.current;
    if (!api) return;
    const now = today();
    const sel = api.lineSelection();
    const plan = planMove(sel.lines, sel.from, sel.to, destinationSpec(dest, now).scheduled);
    if (!plan.ok) {
      onClose();
      showError(plan.error);
      return;
    }
    const expected = sel.lines.slice(plan.start, plan.end + 1);
    setBusy(true);
    try {
      await whenCreated(noteId);
      const res = await moveToDestinationAction(noteId, dest, isoDay(now), plan.dest);
      // Fecha antes do aviso: o modal ficaria por cima dele.
      onClose();
      if (!res.ok) {
        showError(res.error);
        return;
      }
      forgetCachedNote(res.dest.id);
      const n = plan.dest.length;
      if (api.replaceLines(plan.start, plan.end, expected, plan.origin)) {
        showError(`${n === 1 ? "1 linha migrada" : `${n} linhas migradas`} para ${res.dest.title}.`);
      } else {
        showError(`Gravado em ${res.dest.title}, mas o texto mudou aqui: marque a origem à mão.`);
      }
    } catch {
      onClose();
      showError("Não foi possível migrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Migrar tarefa para…">
      <p className="pb-1 text-[13px] text-muted">
        A linha do cursor (com os subitens) ou as linhas selecionadas.
      </p>
      <DestinationList onPick={migrate} disabled={busy} />
    </Sheet>
  );
}

/** "Cancelar tarefa": [-] nas tarefas da linha do cursor / seleção. */
export function cancelTasks(api: EditorApi): string | null {
  const { lines, from, to } = api.lineSelection();
  const expected = lines.slice(from, to + 1);
  let touched = 0;
  const next = expected.map((l) => {
    const c = /^\s*[-*+]\s+\[([ xX><\-o/])\]/.exec(l);
    if (!c || c[1] === "-") return l;
    touched++;
    return setTaskState(l, "-") ?? l;
  });
  if (touched === 0) return "Não há tarefa nesta linha para cancelar.";
  api.replaceLines(from, to, expected, next);
  return null;
}
