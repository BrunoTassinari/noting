"use client";

import { useState } from "react";
import { CloseIcon, PlusIcon, SearchIcon, SlidersIcon } from "@/components/icons";
import {
  type ColorGroup,
  GROUP_HUES,
  type GraphSettings,
  resetGraphSettings,
  updateGraphSettings,
  useGraphSettings,
} from "./graph-settings";
import { type GraphOptions, GraphView } from "./graph-view";
import { ScreenHeader } from "./screen-header";
import { SpaceSwitch } from "./space-switch";
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

function SettingsButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Configurações do grafo"
      title="Configurações do grafo"
      aria-expanded={open}
      onClick={onClick}
      className={`flex size-9 shrink-0 items-center justify-center rounded-lg md:size-8 ${open ? "bg-active text-text-strong" : "text-muted hover:bg-card hover:text-text"}`}
    >
      <SlidersIcon size={16} />
    </button>
  );
}

/** Tela "Grafo": todas as notas e as ligações entre elas. */
export function GraphScreen() {
  const [opts, setOpts] = useState<GraphOptions>({ depth: 1, query: "" });
  const [stats, setStats] = useState<{ nodes: number; links: number } | null>(null);
  const [panel, setPanel] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader title="Grafo" subtitle={stats ? `${stats.nodes} notas · ${stats.links} ligações` : undefined} />
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
        <div className="flex-1" />
        <SettingsButton open={panel} onClick={() => setPanel((v) => !v)} />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <GraphView mode="global" options={opts} onStats={setStats} />
        {panel && <GraphSettingsPanel onClose={() => setPanel(false)} />}
      </div>
      <p className="hidden shrink-0 px-3 py-1.5 text-[11px] text-muted md:block">
        Arraste para mover · roda do mouse para zoom · clique abre a nota (Ctrl+clique numa aba nova)
      </p>
    </div>
  );
}

/** Painel lateral: grafo local da nota aberta. */
export function LocalGraphPanel() {
  const { activeNote } = useVault();
  const settings = useGraphSettings();
  const [opts, setOpts] = useState<GraphOptions>({ depth: 1, query: "" });
  const [panel, setPanel] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2.5 pb-1 pt-2">
        <Toggle on={opts.depth === 1} onClick={() => setOpts({ ...opts, depth: 1 })}>
          Vizinhas
        </Toggle>
        <Toggle on={opts.depth === 2} onClick={() => setOpts({ ...opts, depth: 2 })}>
          + 2º nível
        </Toggle>
        <Toggle on={settings.periodic} onClick={() => updateGraphSettings({ periodic: !settings.periodic })}>
          Diário
        </Toggle>
        <div className="flex-1" />
        <SettingsButton open={panel} onClick={() => setPanel((v) => !v)} />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <GraphView mode="local" centerId={activeNote?.id ?? null} options={opts} />
        {panel && <GraphSettingsPanel onClose={() => setPanel(false)} compact />}
      </div>
    </div>
  );
}

// ---------- Painel de configurações (como no Obsidian) ----------

function Section({ title, children, open = true }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-border/60 py-2 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-semibold uppercase tracking-[0.04em] text-muted [&::-webkit-details-marker]:hidden">
        <span className="inline-block transition-transform group-open:rotate-90">›</span>
        {title}
      </summary>
      <div className="flex flex-col gap-2.5 pt-1.5">{children}</div>
    </details>
  );
}

function Check({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 text-[13px] text-text">
      <span>
        {label}
        {hint && <span className="block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[var(--color-accent)]"
      />
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format = (v) => String(v),
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <label className="flex flex-col gap-1 text-[13px] text-text">
      <span className="flex justify-between">
        {label}
        <span className="tabular-nums text-muted">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-accent)]"
      />
    </label>
  );
}

function GroupRow({ group, onChange, onRemove }: { group: ColorGroup; onChange: (g: ColorGroup) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-rail p-2">
      <div className="flex items-center gap-1.5">
        <input
          value={group.query}
          onChange={(e) => onChange({ ...group, query: e.target.value })}
          placeholder="Pasta ou nome (ex.: Trabalho)"
          aria-label="Filtro do grupo"
          className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-[13px] text-text outline-none placeholder:text-muted focus:border-accent"
        />
        <button type="button" onClick={onRemove} aria-label="Remover grupo" className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text">
          <CloseIcon size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {GROUP_HUES.map((h) => (
          <button
            key={h}
            type="button"
            aria-label={`Cor ${h}`}
            aria-pressed={group.hue === h}
            onClick={() => onChange({ ...group, hue: h })}
            className={`size-5 rounded-full ${group.hue === h ? "ring-2 ring-text ring-offset-1 ring-offset-rail" : ""}`}
            style={{ background: `var(--color-hue-${h})` }}
          />
        ))}
      </div>
    </div>
  );
}

function GraphSettingsPanel({ onClose, compact = false }: { onClose: () => void; compact?: boolean }) {
  const s = useGraphSettings();
  const set = (patch: Partial<GraphSettings>) => updateGraphSettings(patch);
  const setGroup = (i: number, g: ColorGroup) => set({ groups: s.groups.map((x, j) => (j === i ? g : x)) });
  return (
    <div
      className={`absolute z-10 overflow-y-auto rounded-xl border border-border bg-panel px-3 pb-3 shadow-xl ${
        compact ? "inset-2" : "inset-x-2 bottom-2 top-1 md:inset-x-auto md:right-3 md:w-72"
      }`}
    >
      <div className="sticky top-0 z-10 -mx-3 flex items-center gap-1 bg-panel px-3 pb-1 pt-2">
        <span className="flex-1 text-sm font-semibold text-text-strong">Configurações do grafo</span>
        <button type="button" onClick={resetGraphSettings} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-card hover:text-text">
          Restaurar
        </button>
        <button type="button" onClick={onClose} aria-label="Fechar" className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text">
          <CloseIcon size={15} />
        </button>
      </div>

      <Section title="Filtros">
        <Check label="Notas do diário" hint="Dias, semanas e meses do Bullet Journal" checked={s.periodic} onChange={(v) => set({ periodic: v })} />
        <Check label="Listas" hint="Livros, filmes… ligados às notas dos itens" checked={s.lists} onChange={(v) => set({ lists: v })} />
        <Check
          label="Notas que não existem"
          hint="[[Links]] sem nota e itens de lista sem nota (clique cria)"
          checked={s.ghosts}
          onChange={(v) => set({ ghosts: v })}
        />
        <Check label="Notas sem ligações" checked={s.orphans} onChange={(v) => set({ orphans: v })} />
      </Section>

      <Section title="Grupos" open={!compact}>
        <Check label="Colorir pela pasta" checked={s.colorByFolder} onChange={(v) => set({ colorByFolder: v })} />
        {s.groups.map((g, i) => (
          <GroupRow key={i} group={g} onChange={(ng) => setGroup(i, ng)} onRemove={() => set({ groups: s.groups.filter((_, j) => j !== i) })} />
        ))}
        <button
          type="button"
          onClick={() => set({ groups: [...s.groups, { query: "", hue: GROUP_HUES[s.groups.length % GROUP_HUES.length] }] })}
          className="flex h-8 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[13px] text-muted hover:bg-card hover:text-text"
        >
          <PlusIcon size={14} /> Novo grupo
        </button>
        <p className="text-[11px] leading-snug text-muted">O primeiro grupo que combinar com o caminho da nota define a cor.</p>
      </Section>

      <Section title="Exibição" open={!compact}>
        <Check label="Setas" hint="Mostra a direção de cada link" checked={s.arrows} onChange={(v) => set({ arrows: v })} />
        <Slider label="Nomes a partir do zoom" value={s.textZoom} min={0.2} max={4} step={0.1} onChange={(v) => set({ textZoom: v })} format={(v) => `${v.toFixed(1)}×`} />
        <Slider label="Tamanho dos pontos" value={s.nodeSize} min={0.4} max={2.5} step={0.1} onChange={(v) => set({ nodeSize: v })} format={(v) => `${v.toFixed(1)}×`} />
        <Slider label="Espessura das linhas" value={s.linkWidth} min={0.3} max={4} step={0.1} onChange={(v) => set({ linkWidth: v })} format={(v) => `${v.toFixed(1)}×`} />
      </Section>

      <Section title="Forças" open={!compact}>
        <Slider label="Força do centro" value={s.center} min={0} max={0.3} step={0.01} onChange={(v) => set({ center: v })} format={(v) => v.toFixed(2)} />
        <Slider label="Repulsão" value={s.repel} min={10} max={600} step={10} onChange={(v) => set({ repel: v })} />
        <Slider label="Força dos links" value={s.linkStrength} min={0} max={1} step={0.05} onChange={(v) => set({ linkStrength: v })} format={(v) => v.toFixed(2)} />
        <Slider label="Distância dos links" value={s.linkDistance} min={10} max={250} step={5} onChange={(v) => set({ linkDistance: v })} />
      </Section>
    </div>
  );
}
