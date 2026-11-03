"use client";

import { useState } from "react";
import { saveHabitsAction } from "@/app/(vault)/settings-actions";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { isoDay, MONTHS, today } from "@/lib/bujo";
import { setUserHabits } from "@/lib/user-habits";
import { buttonBase, Modal } from "./dialogs";

/** Configurações da pessoa: por enquanto, a lista de hábitos do Bullet Journal. */
export function SettingsDialog({
  open,
  onClose,
  habits,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  habits: string[];
  /** Depois de salvar: id da nota do mês alterada (para esquecer o cache). */
  onSaved: (monthNoteId: string | null) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Configurações">
      <HabitsForm initial={habits} onCancel={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function HabitsForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: string[];
  onCancel: () => void;
  onSaved: (monthNoteId: string | null) => void;
}) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [applyMonth, setApplyMonth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const monthName = MONTHS[today().getUTCMonth()];

  const add = () => {
    const h = draft.replace(/\s+/g, " ").trim();
    if (!h) return;
    if (list.some((x) => x.toLowerCase() === h.toLowerCase())) {
      setError("Esse hábito já está na lista.");
      return;
    }
    setList([...list, h]);
    setDraft("");
    setError(null);
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  const save = async () => {
    setSaving(true);
    const pending = draft.trim() ? [...list, draft.trim()] : list;
    const r = await saveHabitsAction(pending, applyMonth ? isoDay(today()) : undefined);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setUserHabits(r.habits);
    onSaved(r.monthNoteId);
  };

  const iconBtn =
    "flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text disabled:opacity-30 md:size-8";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Hábitos</h3>
        <p className="mt-0.5 text-xs leading-normal text-muted">
          Aparecem como botões no registro do dia e na tabela dos meses novos. Cada mês guarda a
          lista que tinha quando foi criado.
        </p>
      </div>

      <ul className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {list.length === 0 && <li className="py-2 text-[13px] text-muted">Nenhum hábito ainda.</li>}
        {list.map((h, i) => (
          <li key={h} className="flex items-center gap-1 rounded-lg border border-border bg-rail pl-3">
            <span className="min-w-0 flex-1 truncate text-[15px] text-text md:text-sm">{h}</span>
            <button type="button" aria-label={`Subir ${h}`} title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
              <ArrowLeftIcon size={15} className="rotate-90" />
            </button>
            <button
              type="button"
              aria-label={`Descer ${h}`}
              title="Descer"
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
              className={iconBtn}
            >
              <ArrowRightIcon size={15} className="rotate-90" />
            </button>
            <button
              type="button"
              aria-label={`Remover ${h}`}
              title="Remover"
              onClick={() => setList(list.filter((x) => x !== h))}
              className={`${iconBtn} hover:text-danger`}
            >
              <CloseIcon size={15} />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Novo hábito (ex.: Meditar)"
          aria-label="Novo hábito"
          maxLength={40}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-rail px-3 text-base text-text outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm"
        />
        <button type="submit" className={`${buttonBase} flex items-center gap-1 border border-border text-text hover:bg-card`}>
          <PlusIcon size={15} /> Adicionar
        </button>
      </form>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-text-soft md:min-h-0">
        <input type="checkbox" checked={applyMonth} onChange={(e) => setApplyMonth(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        Aplicar também à tabela de hábitos de {monthName}
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${buttonBase} text-text-soft hover:bg-card`}>
          Cancelar
        </button>
        <button type="button" disabled={saving} onClick={() => void save()} className={`${buttonBase} bg-accent text-accent-ink disabled:opacity-60`}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
