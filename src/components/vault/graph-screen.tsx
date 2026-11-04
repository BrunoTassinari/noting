"use client";

import { SpaceSwitch } from "./space-switch";
import { useState } from "react";
import { SearchIcon } from "@/components/icons";
import { type GraphOptions, GraphView } from "./graph-view";
import { ScreenHeader } from "./screen-header";
import { useVault } from "./vault-context";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 shrink-0 rounded-lg px-3 text-[13px] md:h-8 ${on ? "bg-active text-text-strong" : "text-muted hover:bg-card"}`}
    >
      {children}
    </button>
  );
}

/** Tela "Grafo": todas as notas e as ligações entre elas. */
export function GraphScreen() {
  const [opts, setOpts] = useState<GraphOptions>({ periodic: false, orphans: true, depth: 1, query: "" });
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Grafo"
        subtitle={stats ? `${stats.nodes} notas · ${stats.links} ligações` : undefined}
      />
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-2">
        <label className="flex h-9 min-w-40 flex-1 items-center gap-2 rounded-lg border border-border bg-rail px-2.5 text-muted focus-within:border-border-strong md:h-8 md:max-w-72">
          <SearchIcon size={14} className="shrink-0" />
          <input
            type="search"
            value={opts.query}
            onChange={(e) => setOpts({ ...opts, query: e.target.value })}
            placeholder="Destacar notas…"
            aria-label="Destacar notas pelo nome"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        </label>
        <SpaceSwitch className="w-52" />
        <Toggle on={opts.periodic} onClick={() => setOpts({ ...opts, periodic: !opts.periodic })}>
          Diário
        </Toggle>
        <Toggle on={opts.orphans} onClick={() => setOpts({ ...opts, orphans: !opts.orphans })}>
          Sem ligações
        </Toggle>
      </div>
      <GraphView mode="global" options={opts} onStats={setStats} />
      <p className="hidden shrink-0 px-3 py-1.5 text-[11px] text-muted md:block">
        Arraste para mover · roda do mouse para zoom · clique abre a nota (Ctrl+clique numa aba nova)
      </p>
    </div>
  );
}

/** Painel lateral: grafo local da nota aberta. */
export function LocalGraphPanel() {
  const { activeNote } = useVault();
  const [opts, setOpts] = useState<GraphOptions>({ periodic: false, orphans: true, depth: 1, query: "" });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2.5 pb-1 pt-2">
        <Toggle on={opts.depth === 1} onClick={() => setOpts({ ...opts, depth: 1 })}>
          Vizinhas
        </Toggle>
        <Toggle on={opts.depth === 2} onClick={() => setOpts({ ...opts, depth: 2 })}>
          + 2º nível
        </Toggle>
        <Toggle on={opts.periodic} onClick={() => setOpts({ ...opts, periodic: !opts.periodic })}>
          Diário
        </Toggle>
      </div>
      <GraphView mode="local" centerId={activeNote?.id ?? null} options={opts} />
    </div>
  );
}
