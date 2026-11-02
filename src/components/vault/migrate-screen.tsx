"use client";

import { useCallback, useEffect, useState } from "react";
import { loadMigrationAction, migrateTasksAction } from "@/app/(vault)/migrate-actions";
import { CalendarIcon, CancelTaskIcon, CheckIcon, InboxIcon, MigrateIcon } from "@/components/icons";
import { dailyHeading, isoDay, MONTHS, parseDay, today } from "@/lib/bujo";
import { markdownToPlain } from "@/lib/markdown-text";
import type { MigrationAction, MigrationItem, MigrationSource } from "@/server/migrate";
import { destinationHint } from "./migrate-task";
import { forgetCachedNote } from "./note-cache";
import { NoteLink } from "./note-link";
import { ScreenHeader } from "./screen-header";
import { TaskActions, type TaskOption } from "./task-actions";
import { useVault } from "./vault-context";

function options(): TaskOption<MigrationAction>[] {
  const now = today();
  const dest = (key: Exclude<MigrationAction, "done" | "cancel">, label: string, short: string, icon: React.ReactNode) => ({
    key,
    label,
    short,
    hint: destinationHint(key, now),
    icon,
  });
  return [
    dest("today", "Hoje", "Hoje", <CalendarIcon size={18} />),
    dest("tomorrow", "Amanhã", "Amanhã", <CalendarIcon size={18} />),
    dest("month", "Mês atual", "Mês", <MigrateIcon size={18} />),
    dest("nextMonth", "Próximo mês", "Próx. mês", <MigrateIcon size={18} />),
    dest("backlog", "Pendências", "Pendências", <InboxIcon size={18} />),
    { key: "done", label: "Concluída", hint: "Marca [x] na origem", icon: <CheckIcon size={16} /> },
    { key: "cancel", label: "Cancelada", hint: "Marca [-] na origem", icon: <CancelTaskIcon size={16} />, danger: true },
  ];
}

const DONE_MESSAGE: Record<MigrationAction, string> = {
  today: "Migrada para hoje.",
  tomorrow: "Migrada para amanhã.",
  month: "Agendada para o mês atual.",
  nextMonth: "Agendada no Future Log.",
  backlog: "Enviada para as Pendências.",
  done: "Marcada como concluída.",
  cancel: "Marcada como cancelada.",
};

function sourceLabel(s: MigrationSource): string {
  const d = parseDay(s.date)!;
  if (s.kind === "month") return `Mês de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  return dailyHeading(d);
}

/** Tela "Migrar tarefas": as [ ] abertas de dias e meses que já passaram. */
export function MigrateScreen() {
  const { showError } = useVault();
  const [sources, setSources] = useState<MigrationSource[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await loadMigrationAction(isoDay(today())).catch(() => null);
    if (res?.ok) setSources(res.sources);
    else showError(res?.error ?? "Não foi possível carregar as tarefas.");
  }, [showError]);

  useEffect(() => {
    let cancelled = false;
    loadMigrationAction(isoDay(today()))
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setSources(res.sources);
        else showError(res?.error ?? "Não foi possível carregar as tarefas.");
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const run = async (items: MigrationItem[], message: string) => {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const res = await migrateTasksAction(isoDay(today()), items);
      if (res.ok) {
        res.changed.forEach(forgetCachedNote);
        setSources(res.sources);
        showError(message);
      } else {
        showError(res.error);
        await load(); // conflito: mostra a lista atual
      }
    } catch {
      showError("Não foi possível migrar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const total = sources?.reduce((n, s) => n + s.tasks.length, 0) ?? 0;
  const opts = options();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Migrar tarefas"
        subtitle={sources ? `${total} ${total === 1 ? "tarefa aberta" : "tarefas abertas"} nos últimos 60 dias` : "Carregando…"}
        actions={
          total > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(
                  sources!.flatMap((s) =>
                    s.tasks.map((t) => ({ noteId: s.noteId, line: t.line, raw: t.raw, action: "today" as const })),
                  ),
                  `${total === 1 ? "1 tarefa migrada" : `${total} tarefas migradas`} para hoje.`,
                )
              }
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60 md:h-8"
            >
              <MigrateIcon size={16} />
              <span>
                Migrar tudo<span className="hidden sm:inline"> para hoje</span>
              </span>
            </button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 md:px-6">
        <div className="mx-auto max-w-[820px]">
          {sources === null ? (
            <p className="py-10 text-center text-sm text-muted">Carregando…</p>
          ) : sources.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
                <CheckIcon size={22} />
              </span>
              <p className="text-base font-medium text-text">Nada para migrar</p>
              <p className="text-[13px] text-muted">
                Nenhuma tarefa aberta em dias ou meses anteriores (últimos 60 dias).
              </p>
            </div>
          ) : (
            sources.map((s) => (
              <section key={s.noteId} className="mb-6">
                <div className="flex items-baseline gap-2 border-b border-border pb-1.5 pt-3">
                  <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-wide text-muted">
                    {sourceLabel(s)}
                  </h2>
                  <NoteLink id={s.noteId} className="shrink-0 py-2 text-xs text-accent hover:underline md:py-0">
                    {s.title}
                  </NoteLink>
                </div>
                <ul>
                  {s.tasks.map((t) => {
                    const text = markdownToPlain(t.text);
                    return (
                      <li
                        key={`${t.line}:${t.raw}`}
                        className="flex items-center gap-3 border-b border-border/60 py-2 md:py-1.5"
                      >
                        <span aria-hidden="true" className="size-3.5 shrink-0 rounded-[4px] border-[1.5px] border-muted" />
                        <span className="min-w-0 flex-1 break-words text-[15px] text-text md:text-sm">{text}</span>
                        <TaskActions
                          text={text}
                          options={opts}
                          disabled={busy}
                          mobileLabel="Migrar"
                          onAction={(action) =>
                            run([{ noteId: s.noteId, line: t.line, raw: t.raw, action }], DONE_MESSAGE[action])
                          }
                        />
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
