"use client";

import { useCallback, useEffect, useState } from "react";
import { loadBacklogAction } from "@/app/(vault)/migrate-actions";
import type { Backlog } from "@/server/migrate";
import { AppLink, wantsNewTab } from "./note-link";
import { useVault } from "./vault-context";

// Visualizações rápidas da barra lateral: Pendências e Listas, sem sair da
// nota. Para tudo (migrar, limpar, editar ★), há o link para a tela completa.

export function useReloadOnFocus(load: () => void) {
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
    <AppLink href={href} className="mt-3 block px-3 py-2 text-[13px] text-accent hover:underline">
      {label}
    </AppLink>
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
                    onClick={(e) => goToNote(data.noteId!, wantsNewTab(e))}
                    onAuxClick={(e) => e.button === 1 && goToNote(data.noteId!, true)}
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
