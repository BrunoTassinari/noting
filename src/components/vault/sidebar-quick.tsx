"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { loadBacklogAction } from "@/app/(vault)/migrate-actions";
import { loadListsAction, updateListItemAction } from "@/app/(vault)/lists-actions";
import type { ListsPayload } from "@/server/lists";
import type { Backlog } from "@/server/migrate";
import { StateBox } from "./list-state";
import { useVault } from "./vault-context";

// Visualizações rápidas da barra lateral: Pendências e Listas, sem sair da
// nota. Para tudo (migrar, limpar, editar ★), há o link para a tela completa.

const LIST_KEY = "noting-sidebar-list";

function useReloadOnFocus(load: () => void) {
  useEffect(() => {
    load();
    const onFocus = () => document.visibilityState === "visible" && load();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);
}

function Footer({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-3 block px-3 py-2 text-[13px] text-accent hover:underline">
      {label}
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-[13px] text-muted">{children}</p>;
}

export function BacklogQuick() {
  const { goToNote } = useVault();
  const [data, setData] = useState<Backlog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void loadBacklogAction().then((r) => {
      if (r.ok) {
        setData(r.backlog);
        setError(null);
      } else setError(r.error);
    });
  }, []);
  useReloadOnFocus(load);

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Carregando…</Empty>;
  const total = data.groups.reduce((n, g) => n + g.tasks.length, 0);
  if (!data.noteId || total === 0) {
    return (
      <>
        <Empty>Nenhuma pendência aberta.</Empty>
        <Footer href="/pendencias" label="Abrir Pendências" />
      </>
    );
  }
  return (
    <div>
      {data.groups
        .filter((g) => g.tasks.length > 0)
        .map((g, gi) => (
          <div key={gi} className="mb-2">
            {g.heading && (
              <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
                {g.heading}
              </div>
            )}
            <ul className="flex flex-col gap-px">
              {g.tasks.map((t) => (
                <li key={t.line}>
                  <button
                    type="button"
                    onClick={() => goToNote(data.noteId!)}
                    className="flex min-h-11 w-full items-start gap-2 rounded-md px-3 py-1.5 text-left text-[15px] text-text hover:bg-card md:min-h-7 md:text-[13px]"
                  >
                    <span aria-hidden="true" className="mt-[3px] size-3 shrink-0 rounded-[3px] border-[1.5px] border-faint" />
                    <span className="min-w-0 break-words">{t.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      <Footer href="/pendencias" label={`Ver todas (${total})`} />
    </div>
  );
}

export function ListsQuick() {
  const { showError } = useVault();
  const [data, setData] = useState<ListsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(LIST_KEY);
    } catch {
      return null;
    }
  });

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
    try {
      localStorage.setItem(LIST_KEY, id);
    } catch {
      // ok
    }
  };

  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>Carregando…</Empty>;
  if (data.lists.length === 0) {
    return (
      <>
        <Empty>Nenhuma lista em Bullet Journal/Listas.</Empty>
        <Footer href="/listas" label="Abrir Listas" />
      </>
    );
  }
  const current = data.current;
  const open = current?.items.filter((i) => i.state === " " || i.state === "/") ?? [];

  return (
    <div>
      <label className="block px-2 pb-2">
        <span className="sr-only">Lista</span>
        <select
          value={current?.id ?? ""}
          onChange={(e) => choose(e.target.value)}
          className="h-11 w-full rounded-lg border border-border bg-rail px-2 text-[15px] text-text md:h-8 md:text-[13px]"
        >
          {data.lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.open})
            </option>
          ))}
        </select>
      </label>
      {open.length === 0 ? (
        <Empty>Nada em aberto nesta lista.</Empty>
      ) : (
        <ul className="flex flex-col gap-px">
          {open.map((item) => (
            <li key={item.line} className="flex min-h-11 items-start gap-2 rounded-md px-3 py-1.5 hover:bg-card md:min-h-7">
              <button
                type="button"
                aria-label={`Concluir ${item.title}`}
                title="Concluir"
                onClick={() =>
                  void updateListItemAction(
                    { noteId: current!.id, line: item.line, raw: item.raw },
                    { state: "x" },
                  ).then((r) => {
                    if (r.ok) setData(r.data);
                    else showError(r.error);
                  })
                }
                className="mt-[1px] flex shrink-0 items-center justify-center max-md:size-6"
              >
                <StateBox state={item.state} />
              </button>
              <span className="min-w-0 break-words text-[15px] text-text md:text-[13px]">
                {item.buy && <span className="mr-1">🛒</span>}
                {item.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Footer href="/listas" label="Abrir Listas" />
    </div>
  );
}
