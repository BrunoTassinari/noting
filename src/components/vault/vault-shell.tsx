"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { FolderIcon, LogoutIcon, SearchIcon } from "@/components/icons";
import type { NoteMeta } from "@/lib/note-paths";
import { Sidebar } from "./sidebar";
import { NoteView } from "./note-view";
import { useVault, VaultProvider } from "./vault-context";

export function VaultShell({ notes, children }: { notes: NoteMeta[]; children: ReactNode }) {
  return (
    <VaultProvider notes={notes}>
      <Layout>{children}</Layout>
    </VaultProvider>
  );
}

function Layout({ children }: { children: ReactNode }) {
  const { optimisticNote, openSearch } = useVault();
  const routeId = useParams<{ id?: string }>().id;
  const noteOpen = Boolean(routeId || optimisticNote);

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-bg">
      {/* Ribbon (desktop) */}
      <div className="hidden w-12 shrink-0 flex-col items-center gap-1 bg-rail py-2.5 md:flex">
        <span
          title="Arquivos"
          className="flex size-9 items-center justify-center rounded-lg bg-card text-accent"
        >
          <FolderIcon size={18} />
          <span className="sr-only">Arquivos</span>
        </span>
        <button
          type="button"
          aria-label="Buscar (Ctrl K)"
          title="Buscar (Ctrl K)"
          onClick={openSearch}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-text"
        >
          <SearchIcon size={18} />
        </button>
        <div className="flex-1" />
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

      {/* Arquivos: tela cheia no celular quando nenhuma nota está aberta */}
      <aside
        className={`min-h-0 w-full shrink-0 border-border md:block md:w-[280px] md:border-r ${
          noteOpen ? "hidden" : "block"
        }`}
      >
        <Sidebar />
      </aside>

      {/* Coluna principal */}
      <main className={`min-h-0 min-w-0 flex-1 flex-col md:flex ${noteOpen ? "flex" : "hidden"}`}>
        {/* Nota recém-criada: aparece já, e continua aqui quando a página real chega. */}
        {optimisticNote && <NoteView key={optimisticNote.id} note={optimisticNote} isNew />}
        <div className={optimisticNote ? "hidden" : "contents"}>{children}</div>
      </main>
    </div>
  );
}
