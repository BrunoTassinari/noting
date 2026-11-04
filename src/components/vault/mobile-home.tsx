"use client";

import { filterSpace, useSpace } from "./space-store";
import { SpaceSwitch } from "./space-switch";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signOut } from "@/app/login/actions";
import {
  CalendarIcon,
  CalendarMonthIcon,
  CalendarWeekIcon,
  FolderPlusIcon,
  LogoutIcon,
  MoreIcon,
  NoteIcon,
  PlusIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/icons";
import { displayFolder, type NoteMeta } from "@/lib/note-paths";
import { relativeTime } from "@/lib/relative-time";
import { NEXT_THEME, setThemePref, THEME_LABEL, useThemePref } from "@/components/theme";
import { Menu } from "./menu";
import { ListsPanel } from "./lists-panel";
import { BacklogQuick } from "./sidebar-quick";
import { ThemeIcon } from "./theme-button";
import { prefetchNote } from "./note-cache";
import { NoteLink } from "./note-link";
import { openContextMenu, openMenuAt, useLongPress } from "./context-menu";
import { Tree, useNoteMenu } from "./sidebar";
import { usePeriodicNotes } from "./use-periodic";
import { BUJO_SCREENS } from "./bujo-screens";
import { useExcerpts, useIsMobile } from "./use-excerpts";
import { useVault } from "./vault-context";

/** Tela "Notas" do celular (artboard Mobile · arquivos). */
export function MobileHome() {
  const themePref = useThemePref();
  const { notes, creating, createNote, openNewFolder, openSearch, openSettings } = useVault();
  const { openPeriodic } = usePeriodicNotes();
  const [tab, setTab] = useState<"recent" | "folders" | "backlog" | "lists">("recent");
  // Resumos vêm à parte (não estão no layout), só quando a lista aparece.
  const excerpts = useExcerpts(useIsMobile() && tab === "recent");
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
            { label: "Configurações", icon: <SlidersIcon size={15} />, onSelect: openSettings },
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
              ["week", "Esta semana", <CalendarWeekIcon key="w" size={18} />, "text-hue-coral"],
              ["month", "Este mês", <CalendarMonthIcon key="m" size={18} />, "text-hue-apricot"],
            ] as const
          ).map(([kind, label, icon, tone]) => (
            <button
              key={kind}
              type="button"
              onClick={() => openPeriodic(kind)}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text active:bg-card"
            >
              <span className={tone}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Quebra de linha só se os atalhos não couberem numa linha. */}
      <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3">
        {BUJO_SCREENS.map(({ href, label, Icon, tone }) => (
          <Link
            key={href}
            href={href}
            className="flex h-11 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-border bg-rail px-2.5 text-[13px] text-text active:bg-card"
          >
            <Icon size={16} className={`shrink-0 ${tone}`} />
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
          <ListsPanel />
        ) : tab === "recent" ? (
          <ul>
            {recent.map((n) => (
              <RecentRow key={n.id} note={n} excerpt={n.excerpt ?? excerpts[n.id]} />
            ))}
          </ul>
        ) : (
          <FoldersTab notes={notes} />
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
        className="flex shrink-0 items-center justify-around bg-rail px-2 pb-[max(10px,env(safe-area-inset-bottom))] pt-1.5"
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

/** Nota na lista "Recentes": toque abre; toque longo ou "…" mostra as ações. */
function RecentRow({ note, excerpt }: { note: NoteMeta; excerpt?: string }) {
  const items = useNoteMenu(note);
  const press = useLongPress((at) => openContextMenu(at, items, note.title));
  return (
    <li
      className="relative flex items-stretch border-b border-border"
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu({ x: e.clientX, y: e.clientY }, items, note.title);
      }}
    >
      <NoteLink
        id={note.id}
        {...press.handlers}
        onClick={(e) => {
          if (press.consumed()) e.preventDefault();
        }}
        className="block min-w-0 flex-1 select-none py-3.5 pl-1 pr-1 [-webkit-touch-callout:none] active:bg-card"
      >
        <div className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-base font-medium text-text-strong">{note.title}</span>
          <span suppressHydrationWarning className="shrink-0 text-xs text-muted">
            {relativeTime(note.updatedAt)}
          </span>
        </div>
        {excerpt && <p className="mt-0.5 line-clamp-2 text-sm leading-[1.45] text-quote">{excerpt}</p>}
        <div className="mt-1 truncate text-xs text-accent">{displayFolder(note.path)}</div>
      </NoteLink>
      <button
        type="button"
        aria-label={`Opções de ${note.title}`}
        onClick={(e) => openMenuAt(e.currentTarget, items, note.title)}
        className="-mr-2 flex w-11 shrink-0 items-start justify-center pt-3 text-muted active:bg-card"
      >
        <MoreIcon size={20} />
      </button>
    </li>
  );
}

/** Aba "Pastas": árvore do espaço escolhido (BuJo, Acervo ou Tudo). */
function FoldersTab({ notes }: { notes: NoteMeta[] }) {
  const space = useSpace();
  const shown = useMemo(() => filterSpace(space, notes), [space, notes]);
  return (
    <>
      <SpaceSwitch className="mb-2" />
      <div className="-mx-2">
        {shown.length ? <Tree notes={shown} /> : <p className="px-3 py-6 text-center text-[13px] text-muted">Nenhuma nota neste espaço.</p>}
      </div>
    </>
  );
}
