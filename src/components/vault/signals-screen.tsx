"use client";

import { EmojiIcon, EmojiText } from "@/components/emoji-text";
import { useCallback, useEffect, useState } from "react";
import { loadSignalsAction, resolveSignalAction } from "@/app/(vault)/lists-actions";
import { CancelTaskIcon, CheckIcon, FlagIcon } from "@/components/icons";
import { MONTHS, parseDay } from "@/lib/bujo";
import { isOpenState, SIGNALS, type SignalItem, type SignalKey } from "@/lib/lists";
import { markdownToPlain } from "@/lib/markdown-text";
import { relativeTime } from "@/lib/relative-time";
import { TASK_LABELS } from "@/lib/tasks";
import type { SignalSource } from "@/server/lists";
import { StateBox } from "./list-state";
import { notesChanged } from "./note-cache";
import { NoteLink } from "./note-link";
import { ScreenHeader } from "./screen-header";
import { TaskActions, type TaskOption } from "./task-actions";
import { useVault } from "./vault-context";

type Action = "done" | "cancel";

const OPTIONS: TaskOption<Action>[] = [
  { key: "done", label: "Concluir", short: "Concluir", hint: "Marca [x] na nota", icon: <CheckIcon size={16} /> },
  { key: "cancel", label: "Cancelar", short: "Cancelar", hint: "Marca [-] na nota", icon: <CancelTaskIcon size={16} />, danger: true },
];

const DONE_MESSAGE: Record<Action, string> = { done: "Marcada como concluída.", cancel: "Marcada como cancelada." };

type Filter = "all" | SignalKey;

type Entry = { source: SignalSource; item: SignalItem };

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "seg, 2 nov", "nov 2026", "semana de 1 nov", "editada ontem" (ano só se não for o atual). */
function dateLabel(s: SignalSource): string {
  if (s.dateKind === "updated") return `editada ${relativeTime(s.date)}`;
  const d = parseDay(s.date);
  if (!d) return "";
  const month = MONTHS[d.getUTCMonth()].slice(0, 3);
  if (s.dateKind === "month") return `${month} ${d.getUTCFullYear()}`;
  const year = d.getUTCFullYear() === new Date().getFullYear() ? "" : ` ${d.getUTCFullYear()}`;
  const short = `${d.getUTCDate()} ${month}${year}`;
  return s.dateKind === "week" ? `semana de ${short}` : `${WEEKDAYS[d.getUTCDay()]}, ${short}`;
}

/** Tela "Sinalizadores": tarefas com ❗ 💼 💡 🔔 🌱 de todas as notas. */
export function SignalsScreen() {
  const { showError } = useVault();
  const [sources, setSources] = useState<SignalSource[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await loadSignalsAction().catch(() => null);
    if (res?.ok) setSources(res.sources);
    else showError(res?.error ?? "Não foi possível carregar os sinalizadores.");
  }, [showError]);

  useEffect(() => {
    let cancelled = false;
    loadSignalsAction()
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setSources(res.sources);
        else showError(res?.error ?? "Não foi possível carregar os sinalizadores.");
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const resolve = async ({ source, item }: Entry, action: Action) => {
    setBusy(true);
    try {
      const res = await resolveSignalAction({ noteId: source.noteId, line: item.line, raw: item.raw }, action);
      if (res.ok) {
        notesChanged([source.noteId]);
        setSources(res.sources);
        showError(DONE_MESSAGE[action]);
      } else {
        showError(res.error);
        await load();
      }
    } catch {
      showError("Não foi possível alterar a tarefa. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const entries: Entry[] = (sources ?? []).flatMap((source) =>
    source.items.filter((item) => showResolved || isOpenState(item.state)).map((item) => ({ source, item })),
  );
  const bySignal = (key: SignalKey) => entries.filter((e) => e.item.signals.includes(key));
  const sections = SIGNALS.filter((s) => filter === "all" || s.key === filter)
    .map((s) => ({ ...s, entries: bySignal(s.key) }))
    .filter((s) => s.entries.length > 0);
  const openTotal = (sources ?? []).reduce((n, s) => n + s.items.filter((i) => isOpenState(i.state)).length, 0);

  const chip = (active: boolean) =>
    `flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm md:h-8 ${
      active ? "border-accent/60 bg-card text-text-strong" : "border-border text-text-soft hover:bg-active hover:text-text"
    }`;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Sinalizadores"
        subtitle={sources ? `${openTotal} ${openTotal === 1 ? "tarefa aberta sinalizada" : "tarefas abertas sinalizadas"}` : "Carregando…"}
        actions={
          <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-text-soft hover:bg-active md:h-8">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            <span>
              <span className="sm:hidden">Resolvidos</span>
              <span className="hidden sm:inline">Mostrar também resolvidos</span>
            </span>
          </label>
        }
      />

      <div className="shrink-0 border-b border-border/60 md:border-b-0">
        <div
          role="tablist"
          aria-label="Filtrar por sinalizador"
          className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:flex-wrap md:px-6"
        >
          <button type="button" role="tab" aria-selected={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
            Todos
            <span className="text-xs tabular-nums text-muted">{entries.length}</span>
          </button>
          {SIGNALS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={filter === s.key}
              onClick={() => setFilter(s.key)}
              className={chip(filter === s.key)}
            >
              <EmojiIcon emoji={s.emoji} />
              {s.label}
              <span className="text-xs tabular-nums text-muted">{bySignal(s.key).length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 md:px-6">
        <div className="w-full">
          {sources === null ? (
            <p className="py-10 text-center text-sm text-muted">Carregando…</p>
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
                <FlagIcon size={22} />
              </span>
              <p className="text-base font-medium text-text">
                {showResolved ? "Nenhuma tarefa sinalizada" : "Nenhuma tarefa sinalizada aberta"}
              </p>
              <p className="max-w-sm text-[13px] text-muted">
                Ponha um sinalizador logo depois do checkbox, como “- [ ] ❗ pagar o boleto”.
              </p>
            </div>
          ) : (
            sections.map((s) => (
              <section key={s.key} className="mb-6">
                <h2 className="flex items-center gap-2 border-b border-border pb-1.5 pt-3 text-[13px] font-semibold uppercase tracking-wide text-muted">
                  <span className="text-base normal-case"><EmojiIcon emoji={s.emoji} size={16} /></span>
                  <span className="flex-1">{s.label}</span>
                  <span className="font-normal tabular-nums">{s.entries.length}</span>
                </h2>
                <ul>
                  {s.entries.map((e) => {
                    const text = markdownToPlain(e.item.text) || "(sem texto)";
                    const open = isOpenState(e.item.state);
                    const others = SIGNALS.filter((x) => x.key !== s.key && e.item.signals.includes(x.key));
                    return (
                      <li
                        key={`${e.source.noteId}:${e.item.line}:${e.item.raw}`}
                        className="flex items-center gap-3 border-b border-border/60 py-2 md:py-1.5"
                      >
                        <span title={TASK_LABELS[e.item.state]}>
                          <StateBox state={e.item.state} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p
                            className={`break-words text-[15px] md:text-sm ${
                              open ? "text-text" : "text-muted line-through decoration-muted/60"
                            }`}
                          >
                            {others.map((x) => (
                              <span key={x.key} className="mr-1.5">
                                <EmojiIcon emoji={x.emoji} />
                              </span>
                            ))}
                            <EmojiText text={text} />
                          </p>
                          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs text-muted">
                            <NoteLink
                              id={e.source.noteId}
                              className="-my-3 max-w-full truncate py-3 text-accent hover:underline md:my-0 md:py-0"
                            >
                              {e.source.title}
                            </NoteLink>
                            <span aria-hidden="true">·</span>
                            <span className="shrink-0">{dateLabel(e.source)}</span>
                            {e.item.state === "/" && <span className="shrink-0">· em andamento</span>}
                            {!open && <span className="shrink-0">· {TASK_LABELS[e.item.state].toLowerCase()}</span>}
                          </p>
                        </div>
                        {open && (
                          <TaskActions
                            text={text}
                            options={OPTIONS}
                            disabled={busy}
                            mobileLabel="Resolver"
                            onAction={(action) => resolve(e, action)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
