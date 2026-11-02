"use client";

import { useCallback, useEffect, useState } from "react";
import { cleanBacklogAction, loadBacklogAction, pullFromBacklogAction } from "@/app/(vault)/migrate-actions";
import { CalendarIcon, InboxIcon, MigrateIcon, TrashIcon } from "@/components/icons";
import { isoDay, today } from "@/lib/bujo";
import { markdownToPlain } from "@/lib/markdown-text";
import type { Destination } from "@/lib/migrate";
import type { Backlog } from "@/server/migrate";
import { destinationHint } from "./migrate-task";
import { forgetCachedNote } from "./note-cache";
import { NoteLink } from "./note-link";
import { ScreenHeader } from "./screen-header";
import { TaskActions, type TaskOption } from "./task-actions";
import { useVault } from "./vault-context";

type Pull = Extract<Destination, "today" | "tomorrow" | "month">;

const PULLED: Record<Pull, string> = {
  today: "Puxada para hoje.",
  tomorrow: "Puxada para amanhã.",
  month: "Puxada para o mês atual.",
};

function options(): TaskOption<Pull>[] {
  const now = today();
  return [
    { key: "today", label: "Puxar para hoje", short: "Hoje", hint: destinationHint("today", now), icon: <CalendarIcon size={18} /> },
    { key: "tomorrow", label: "Puxar para amanhã", short: "Amanhã", hint: destinationHint("tomorrow", now), icon: <CalendarIcon size={18} /> },
    { key: "month", label: "Puxar para o mês", short: "Mês", hint: destinationHint("month", now), icon: <MigrateIcon size={18} /> },
  ];
}

/** Tela "Pendências": itens abertos do backlog, para puxar para um dia ou mês. */
export function BacklogScreen() {
  const { showError } = useVault();
  const [backlog, setBacklog] = useState<Backlog | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await loadBacklogAction().catch(() => null);
    if (res?.ok) setBacklog(res.backlog);
    else showError(res?.error ?? "Não foi possível carregar as Pendências.");
  }, [showError]);

  useEffect(() => {
    let cancelled = false;
    loadBacklogAction()
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setBacklog(res.backlog);
        else showError(res?.error ?? "Não foi possível carregar as Pendências.");
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const pull = async (line: number, raw: string, dest: Pull) => {
    setBusy(true);
    try {
      const res = await pullFromBacklogAction(isoDay(today()), [{ line, raw }], dest);
      if (res.ok) {
        res.changed.forEach(forgetCachedNote);
        setBacklog(res.backlog);
        showError(PULLED[dest]);
      } else {
        showError(res.error);
        await load();
      }
    } catch {
      showError("Não foi possível puxar a tarefa. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const clean = async () => {
    setBusy(true);
    try {
      const res = await cleanBacklogAction();
      if (res.ok) {
        if (res.noteId) forgetCachedNote(res.noteId);
        setBacklog(res.backlog);
        showError(
          res.removed === 0
            ? "Nada para limpar."
            : `${res.removed === 1 ? "1 linha resolvida removida" : `${res.removed} linhas resolvidas removidas`}.`,
        );
      } else showError(res.error);
    } catch {
      showError("Não foi possível limpar. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const total = backlog?.groups.reduce((n, g) => n + g.tasks.length, 0) ?? 0;
  const opts = options();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Pendências"
        subtitle={backlog ? `${total} ${total === 1 ? "item aberto" : "itens abertos"}` : "Carregando…"}
        actions={
          backlog?.noteId && (
            <>
              <NoteLink
                id={backlog.noteId}
                className="flex h-11 shrink-0 items-center rounded-lg px-3 text-sm text-accent hover:bg-active md:h-8"
              >
                Abrir nota
              </NoteLink>
              <button
                type="button"
                disabled={busy || backlog.resolved === 0}
                onClick={clean}
                title="Remove do arquivo as linhas [x], [-], [>] e [<] (eventos [o] ficam)"
                className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm text-text hover:bg-active disabled:opacity-50 md:h-8"
              >
                <TrashIcon size={15} />
                Limpar{backlog.resolved > 0 && ` (${backlog.resolved})`}
              </button>
            </>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 md:px-6">
        <div className="mx-auto max-w-[820px]">
          {backlog === null ? (
            <p className="py-10 text-center text-sm text-muted">Carregando…</p>
          ) : total === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
                <InboxIcon size={22} />
              </span>
              <p className="text-base font-medium text-text">Nenhuma pendência aberta</p>
              <p className="text-[13px] text-muted">
                Use “Migrar tarefa…” numa nota, ou a tela de migração, para mandar tarefas para cá.
              </p>
            </div>
          ) : (
            backlog.groups.map((g, i) => (
              <section key={`${i}:${g.heading}`} className="mb-6">
                {g.heading && (
                  <h2
                    className="border-b border-border pb-1.5 pt-3 text-[13px] font-semibold uppercase tracking-wide text-muted"
                    style={{ paddingLeft: Math.max(0, g.level - 2) * 12 }}
                  >
                    {markdownToPlain(g.heading)}
                  </h2>
                )}
                <ul>
                  {g.tasks.map((t) => {
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
                          mobileLabel="Puxar"
                          onAction={(dest) => pull(t.line, t.raw, dest)}
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
