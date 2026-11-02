"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/app/login/actions";
import {
  CalendarIcon,
  CalendarMonthIcon,
  CalendarWeekIcon,
  FolderPlusIcon,
  LogoutIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/icons";
import { displayFolder } from "@/lib/note-paths";
import { relativeTime } from "@/lib/relative-time";
import { NEXT_THEME, setThemePref, THEME_LABEL, useThemePref } from "@/components/theme";
import { Menu } from "./menu";
import { BacklogQuick, ListsQuick } from "./sidebar-quick";
import { ThemeIcon } from "./theme-button";
import { prefetchNote } from "./note-cache";
import { NoteLink } from "./note-link";
import { Tree } from "./sidebar";
import { usePeriodicNotes } from "./use-periodic";
import { BUJO_SCREENS } from "./bujo-screens";
import { useVault } from "./vault-context";

/** Tela "Notas" do celular (artboard Mobile · arquivos). */
export function MobileHome() {
  const themePref = useThemePref();
  const { notes, creating, createNote, openNewFolder, openSearch } = useVault();
  const { openPeriodic } = usePeriodicNotes();
  const [tab, setTab] = useState<"recent" | "folders" | "backlog" | "lists">("recent");
  const recent = useMemo(
    () => [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );

  // No celular não há "passar o mouse": adianta as notas mais recentes,
  // uma de cada vez, depois que a tela já apareceu.
  const topIds = recent.slice(0, 5).map((n) => n.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const id of topIds.split(",").filter(Boolean)) {
        if (cancelled) return;
        await prefetchNote(id);
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [topIds]);

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-panel">
      <header className="flex shrink-0 items-center gap-1 pb-2 pl-5 pr-2 pt-3.5">
        <h1 className="flex-1 text-[26px] font-semibold leading-tight text-text-strong">Notas</h1>
        <button
          type="button"
          aria-label="Nova pasta"
          onClick={openNewFolder}
          className="flex size-11 items-center justify-center rounded-[10px] text-muted active:bg-card"
        >
          <FolderPlusIcon size={22} />
        </button>
        <Menu
          label="Conta"
          trigger={<SlidersIcon size={22} />}
          triggerClassName="flex size-11 items-center justify-center rounded-[10px] text-muted active:bg-card"
          items={[
            {
              label: THEME_LABEL[themePref],
              icon: <ThemeIcon pref={themePref} size={15} />,
              onSelect: () => setThemePref(NEXT_THEME[themePref]),
            },
            { label: "Sair", icon: <LogoutIcon size={15} />, onSelect: () => void signOut() },
          ]}
        />
      </header>

      <div className="shrink-0 px-4 pb-3">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 w-full items-center gap-2.5 rounded-xl border border-border bg-rail px-3.5 text-left text-base text-muted"
        >
          <SearchIcon size={18} />
          Buscar notas
        </button>
        <div className="mt-2 flex gap-2">
          {(
            [
              ["week", "Esta semana", <CalendarWeekIcon key="w" size={18} />],
              ["month", "Este mês", <CalendarMonthIcon key="m" size={18} />],
            ] as const
          ).map(([kind, label, icon]) => (
            <button
              key={kind}
              type="button"
              onClick={() => openPeriodic(kind)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text active:bg-card"
            >
              <span className="text-muted">{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quebra de linha só se os atalhos não couberem numa linha. */}
      <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3">
        {BUJO_SCREENS.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-rail px-2.5 text-[13px] text-text active:bg-card"
          >
            <Icon size={16} className="shrink-0 text-accent" />
            {label}
          </Link>
        ))}
      </div>

      <div role="tablist" aria-label="Modo da lista" className="mx-4 mb-2 flex shrink-0 gap-1 rounded-xl bg-rail p-1">
        {(
          [
            ["recent", "Recentes"],
            ["folders", "Pastas"],
            ["backlog", "Pendências"],
            ["lists", "Listas"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-9 min-w-0 flex-1 truncate rounded-[9px] px-1 text-[13px] font-medium ${
              tab === key ? "bg-active text-text-strong" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-28">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
              <NoteIcon size={22} />
            </span>
            <p className="text-[15px] text-muted">Nenhuma nota ainda. Toque em “Nova nota” para começar.</p>
          </div>
        ) : tab === "backlog" ? (
          <BacklogQuick />
        ) : tab === "lists" ? (
          <ListsQuick />
        ) : tab === "recent" ? (
          <ul>
            {recent.map((n) => (
              <li key={n.id}>
                <NoteLink
                  id={n.id}
                  className="block border-b border-border px-1 py-3.5 active:bg-card"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-base font-medium text-text-strong">
                      {n.title}
                    </span>
                    <span suppressHydrationWarning className="shrink-0 text-xs text-muted">
                      {relativeTime(n.updatedAt)}
                    </span>
                  </div>
                  {n.excerpt && (
                    <p className="mt-0.5 line-clamp-2 text-sm leading-[1.45] text-quote">{n.excerpt}</p>
                  )}
                  <div className="mt-1 truncate text-xs text-accent">{displayFolder(n.path)}</div>
                </NoteLink>
              </li>
            ))}
          </ul>
        ) : (
          <div className="-mx-2">
            <Tree notes={notes} />
          </div>
        )}
      </div>

      <div className="absolute bottom-[calc(76px+env(safe-area-inset-bottom))] right-5 z-10 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => openPeriodic("day")}
          className="flex h-[52px] items-center gap-2 rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-text-strong shadow-lg active:bg-active"
        >
          <CalendarIcon size={20} className="text-accent" />
          Hoje
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={() => createNote("")}
          className="flex h-[52px] items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-semibold text-accent-ink shadow-lg disabled:opacity-60"
        >
          <PlusIcon size={20} />
          Nova nota
        </button>
      </div>

      <nav
        aria-label="Navegação"
        className="flex shrink-0 items-center justify-around border-t border-border bg-rail px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5"
      >
        <span
          aria-current="page"
          className="flex min-h-12 min-w-[72px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-accent"
        >
          <NoteIcon size={22} />
          Notas
        </span>
        <button
          type="button"
          onClick={openSearch}
          className="flex min-h-12 min-w-[72px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted"
        >
          <SearchIcon size={22} />
          Buscar
        </button>
      </nav>
    </div>
  );
}
