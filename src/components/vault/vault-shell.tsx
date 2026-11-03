"use client";

import { useParams, usePathname } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { signOut } from "@/app/login/actions";
import {
  CalendarIcon,
  CalendarMonthIcon,
  CalendarWeekIcon,
  LogoutIcon,
  SearchIcon,
} from "@/components/icons";
import { BUJO_SCREENS } from "./bujo-screens";
import { ThemeButton } from "./theme-button";
import { SettingsButton } from "./settings-button";
import type { NoteMeta } from "@/lib/note-paths";
import { MobileHome } from "./mobile-home";
import { AppLink } from "./note-link";
import { SidePanel } from "./side-panel";
import { TabBar, WorkspaceSync } from "./tabs";
import { usePeriodicNotes } from "./use-periodic";
import { useVisualViewport } from "./use-visual-viewport";
import { NoteSkeleton } from "./note-skeleton";
import { NoteView } from "./note-view";
import { useVault, VaultProvider } from "./vault-context";

export function VaultShell({
  notes,
  habits,
  children,
}: {
  notes: NoteMeta[];
  habits: string[];
  children: ReactNode;
}) {
  return (
    <VaultProvider notes={notes} habits={habits}>
      <Layout>{children}</Layout>
    </VaultProvider>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { optimisticNote, openSearch } = useVault();
  const routeId = useParams<{ id?: string }>().id;
  const pathname = usePathname();
  // Telas do Bullet Journal ocupam a coluna principal (no celular, a tela toda).
  const screen = BUJO_SCREENS.find((s) => pathname === s.href)?.href;
  const noteOpen = Boolean(routeId || optimisticNote || screen);
  const viewport = useVisualViewport();
  const { openPeriodic } = usePeriodicNotes();

  // Baixa o código do editor em segundo plano: a primeira nota já abre pronta.
  useEffect(() => {
    const t = setTimeout(() => void import("@/components/editor/markdown-editor"), 1500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      // pt: área da barra de status quando instalado no iPhone (tela cheia).
      className="fixed inset-x-0 top-0 flex h-dvh min-h-0 w-full overflow-hidden bg-bg pt-[env(safe-area-inset-top)]"
      // Acompanha a área visível (teclado aberto no celular).
      style={
        viewport ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` } : undefined
      }
    >
      {/* Ribbon (desktop) */}
      <div className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-rail py-2.5 md:flex">
        <button
          type="button"
          aria-label="Buscar (Ctrl K)"
          title="Buscar (Ctrl K)"
          onClick={openSearch}
          className="flex size-9 items-center justify-center rounded-lg text-hue-cornflower opacity-85 hover:bg-card hover:opacity-100"
        >
          <SearchIcon size={18} />
        </button>
        <div aria-hidden="true" className="my-1 h-px w-6 bg-border" />
        {(
          [
            ["day", "Hoje", <CalendarIcon key="d" size={18} />, "text-hue-rose"],
            ["week", "Esta semana", <CalendarWeekIcon key="w" size={18} />, "text-hue-coral"],
            ["month", "Este mês", <CalendarMonthIcon key="m" size={18} />, "text-hue-apricot"],
          ] as const
        ).map(([kind, label, icon, tone]) => (
          <button
            key={kind}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => openPeriodic(kind)}
            className={`flex size-9 items-center justify-center rounded-lg opacity-85 hover:bg-card hover:opacity-100 ${tone}`}
          >
            {icon}
          </button>
        ))}
        {BUJO_SCREENS.map(({ href, label, Icon, tone }) => (
          <AppLink
            key={href}
            href={href}
            aria-label={label}
            title={label}
            aria-current={screen === href ? "page" : undefined}
            className={`flex size-9 items-center justify-center rounded-lg hover:bg-card hover:opacity-100 ${tone} ${
              screen === href ? "bg-card" : "opacity-85"
            }`}
          >
            <Icon size={18} />
          </AppLink>
        ))}
        <div className="flex-1" />
        <SettingsButton />
        <ThemeButton />
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sair"
            title="Sair"
            className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-text"
          >
            <LogoutIcon size={18} />
          </button>
        </form>
      </div>

      <WorkspaceSync />

      {/* Laterais (desktop): painéis escolhidos pelos ícones do topo de cada uma */}
      <SidePanel side="left" />

      {/* Lista de notas (celular, quando nenhuma nota está aberta) */}
      {!noteOpen && (
        <div className="min-h-0 w-full md:hidden">
          <MobileHome />
        </div>
      )}

      {/* Coluna principal */}
      <main className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${noteOpen ? "flex" : "hidden"}`}>
        <TabBar />
        {/* Nota aberta/criada antes do servidor responder; continua aqui quando a página chega. */}
        {optimisticNote &&
          (optimisticNote.mode === "skeleton" ? (
            <NoteSkeleton note={optimisticNote} />
          ) : (
            <NoteView
              key={`${optimisticNote.id}:${optimisticNote.version}`}
              note={optimisticNote}
              isNew={optimisticNote.mode === "create" && optimisticNote.selectTitle !== false}
            />
          ))}
        <div className={optimisticNote ? "hidden" : "contents"}>{children}</div>
      </main>

      <SidePanel side="right" />
    </div>
  );
}
