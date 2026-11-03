"use client";

import { EmojiIcon, EmojiText } from "@/components/emoji-text";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { loadSignalsAction } from "@/app/(vault)/lists-actions";
import {
  ChecklistIcon,
  FlagIcon,
  FolderIcon,
  InboxIcon,
  LinkIcon,
  ListIcon,
  MoreIcon,
  MoveIcon,
  NoteIcon,
  SearchIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "@/components/icons";
import { searchTerms } from "@/lib/fold";
import { isOpenState, SIGNALS } from "@/lib/lists";
import { displayFolder } from "@/lib/note-paths";
import { markdownToPlain } from "@/lib/markdown-text";
import type { SearchResult } from "@/server/search";
import type { SignalSource } from "@/server/lists";
import { useEditorInfo } from "./active-editor";
import { Backlinks } from "./backlinks";
import { openContextMenu, openMenuAt } from "./context-menu";
import {
  movePanel,
  type PanelKey,
  panelsOn,
  setSideWidth,
  showPanel,
  type Side,
  toggleSide,
  useLayout,
} from "./layout-store";
import type { MenuItem } from "./menu";
import { AppLink, NoteLink, wantsNewTab } from "./note-link";
import { Outline } from "./outline";
import { Highlight } from "./search-palette";
import { FilesPanel } from "./sidebar";
import { ListsPanel as ListsPanelView } from "./lists-panel";
import { BacklogQuick, useReloadOnFocus } from "./sidebar-quick";
import { useVault } from "./vault-context";

type IconType = ComponentType<{ size?: number; className?: string }>;

// tone: cor do ícone (matizes do tema; classes literais para o Tailwind).
export const PANELS: Record<PanelKey, { label: string; Icon: IconType; Body: ComponentType; tone: string }> = {
  files: { label: "Arquivos", Icon: FolderIcon, Body: FilesPanel, tone: "text-hue-honey" },
  search: { label: "Buscar", Icon: SearchIcon, Body: SearchPanel, tone: "text-hue-cornflower" },
  signals: { label: "Sinalizadores", Icon: FlagIcon, Body: SignalsPanel, tone: "text-hue-ember" },
  backlinks: { label: "Backlinks", Icon: LinkIcon, Body: BacklinksPanel, tone: "text-hue-lilac" },
  outline: { label: "Tópicos", Icon: ListIcon, Body: OutlinePanel, tone: "text-hue-orchid" },
  lists: { label: "Listas", Icon: ChecklistIcon, Body: ListsPanel, tone: "text-hue-verdigris" },
  backlog: { label: "Pendências", Icon: InboxIcon, Body: BacklogPanel, tone: "text-hue-fern" },
};

function ListsPanel() {
  return (
    <Scroll title="Listas">
      <ListsPanelView />
    </Scroll>
  );
}

function BacklogPanel() {
  return (
    <Scroll title="Pendências">
      <BacklogQuick />
    </Scroll>
  );
}

const other = (side: Side): Side => (side === "left" ? "right" : "left");
const sideName = (side: Side) => (side === "left" ? "esquerda" : "direita");

function moveItem(key: PanelKey, side: Side): MenuItem {
  return {
    label: `Mover “${PANELS[key].label}” para a lateral ${sideName(other(side))}`,
    icon: <MoveIcon size={15} />,
    onSelect: () => movePanel(key, other(side)),
  };
}

/** Uma lateral: fileira de ícones (painéis desta lateral), o painel ativo e a borda de arrastar. */
export function SidePanel({ side }: { side: Side }) {
  const layout = useLayout();
  const s = layout[side];
  const keys = panelsOn(layout, side);
  const active = s.active && keys.includes(s.active) ? s.active : keys[0];
  if (!s.open) return null;
  const Body = active ? PANELS[active].Body : null;

  return (
    <aside
      aria-label={`Lateral ${sideName(side)}`}
      data-side={side}
      style={{ width: s.width }}
      className={`relative hidden min-h-0 shrink-0 flex-col bg-panel md:flex ${
        side === "left" ? "border-r" : "border-l"
      } border-border`}
    >
      <div role="tablist" aria-label={`Painéis da lateral ${sideName(side)}`} className="flex h-10 shrink-0 items-center gap-0.5 border-b border-border px-2">
        {keys.map((key) => {
          const { label, Icon, tone } = PANELS[key];
          const on = key === active;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={label}
              title={label}
              data-panel={key}
              onClick={() => showPanel(key)}
              onContextMenu={(e) => {
                e.preventDefault();
                openContextMenu({ x: e.clientX, y: e.clientY }, [moveItem(key, side)], label);
              }}
              className={`flex size-7 items-center justify-center rounded-md ${tone} ${
                on ? "bg-active" : "opacity-60 hover:bg-card hover:opacity-100"
              }`}
            >
              <Icon size={16} />
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          type="button"
          aria-label={`Opções da lateral ${sideName(side)}`}
          title="Mais opções"
          onClick={(e) =>
            openMenuAt(
              e.currentTarget,
              [
                ...(active ? [moveItem(active, side)] : []),
                {
                  label: "Recolher lateral",
                  icon: side === "left" ? <SidebarLeftIcon size={15} /> : <SidebarRightIcon size={15} />,
                  onSelect: () => toggleSide(side),
                },
              ],
              `Lateral ${sideName(side)}`,
            )
          }
          className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text"
        >
          <MoreIcon size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {Body ? (
          <Body key={active} />
        ) : (
          <p className="px-4 py-6 text-[13px] leading-normal text-muted">
            Nenhum painel aqui. Clique com o botão direito num ícone da outra lateral para movê-lo para cá.
          </p>
        )}
      </div>

      <ResizeHandle side={side} width={s.width} />
    </aside>
  );
}

function ResizeHandle({ side, width }: { side: Side; width: number }) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Redimensionar lateral ${sideName(side)}`}
      title="Arraste para redimensionar"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, w: width };
        document.body.style.cursor = "col-resize";
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        setSideWidth(side, drag.current.w + (side === "left" ? dx : -dx), false);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        setSideWidth(side, drag.current.w + (side === "left" ? dx : -dx), true);
        drag.current = null;
        document.body.style.cursor = "";
      }}
      onDoubleClick={() => setSideWidth(side, side === "left" ? 260 : 280, true)}
      className={`absolute inset-y-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/40 ${
        side === "left" ? "-right-[3px]" : "-left-[3px]"
      }`}
    />
  );
}

/** Corpo rolável com título pequeno. */
function Scroll({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
      <h2 className="px-1.5 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.04em] text-muted">{title}</h2>
      {children}
    </div>
  );
}

function NoNote() {
  return <p className="text-xs leading-normal text-muted">Nenhuma nota aberta.</p>;
}

function BacklinksPanel() {
  const { activeNote } = useVault();
  const info = useEditorInfo(activeNote?.id);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3">
      {!activeNote ? (
        <NoNote />
      ) : info ? (
        <Backlinks items={info.backlinks} />
      ) : (
        <p className="text-xs text-muted">Carregando…</p>
      )}
    </div>
  );
}

function OutlinePanel() {
  const { activeNote } = useVault();
  const info = useEditorInfo(activeNote?.id);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 pt-3">
      {!activeNote ? (
        <NoNote />
      ) : info ? (
        <Outline headings={info.headings} cursorLine={info.cursorLine} onSelect={info.goToLine} />
      ) : (
        <p className="text-xs text-muted">Carregando…</p>
      )}
    </div>
  );
}

const DEBOUNCE_MS = 200;

/** Busca no conteúdo, com os resultados na própria lateral. */
function SearchPanel() {
  const { goToNote } = useVault();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; items: SearchResult[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed || searchTerms(trimmed).length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: SearchResult[] };
        setResult({ q: trimmed, items: data.results });
        setFailed(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setFailed(true);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [trimmed]);

  const items = trimmed && result?.q === trimmed ? result.items : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-2.5 pb-2 pt-2.5">
        <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-rail px-2.5 text-muted focus-within:border-border-strong">
          <SearchIcon size={14} className="shrink-0" />
          <input
            type="search"
            aria-label="Buscar no vault"
            placeholder="Buscar no vault"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && items?.[0]) {
                e.preventDefault();
                goToNote(items[0].id, e.ctrlKey || e.metaKey);
              }
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!trimmed ? (
          <p className="px-1.5 py-2 text-xs leading-normal text-muted">
            Busca por título e conteúdo. Ctrl+clique abre o resultado numa aba nova.
          </p>
        ) : failed ? (
          <p className="px-1.5 py-2 text-xs text-danger">Não foi possível buscar.</p>
        ) : !items ? (
          <p className="px-1.5 py-2 text-xs text-muted">Buscando…</p>
        ) : items.length === 0 ? (
          <p className="px-1.5 py-2 text-xs text-muted">Nenhuma nota encontrada.</p>
        ) : (
          <>
            <p className="px-1.5 pb-1 text-xs text-muted">
              {items.length} {items.length === 1 ? "resultado" : "resultados"}
            </p>
            <ul className="flex flex-col gap-px">
              {items.map((r) => (
                <li key={r.id}>
                  <NoteLink id={r.id} className="block rounded-md px-2 py-1.5 hover:bg-card">
                    <div className="flex items-center gap-1.5">
                      <NoteIcon size={13} className="shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-strong">
                        <Highlight text={r.title} ranges={r.titleMatches} />
                      </span>
                    </div>
                    {r.path && <div className="truncate pl-[19px] text-[11px] text-muted">{displayFolder(r.path)}</div>}
                    {r.snippet && (
                      <div className="mt-0.5 line-clamp-3 pl-[19px] text-xs leading-snug text-muted">
                        <Highlight text={r.snippet} ranges={r.snippetMatches} />
                      </div>
                    )}
                  </NoteLink>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/** Resumo dos sinalizadores: tarefas abertas sinalizadas, por tipo. */
function SignalsPanel() {
  const { goToNote } = useVault();
  const [sources, setSources] = useState<SignalSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    void loadSignalsAction()
      .catch(() => null)
      .then((r) => {
        if (r?.ok) {
          setSources(r.sources);
          setError(null);
        } else setError(r?.error ?? "Não foi possível carregar os sinalizadores.");
      });
  }, []);
  useReloadOnFocus(load);

  const sections = SIGNALS.map((s) => ({
    ...s,
    entries: (sources ?? []).flatMap((src) =>
      src.items
        .filter((i) => isOpenState(i.state) && i.signals.includes(s.key))
        .map((item) => ({ src, item })),
    ),
  })).filter((s) => s.entries.length > 0);

  return (
    <Scroll title="Sinalizadores">
      {error ? (
        <p className="px-3 py-4 text-[13px] text-muted">{error}</p>
      ) : !sources ? (
        <p className="px-3 py-4 text-[13px] text-muted">Carregando…</p>
      ) : sections.length === 0 ? (
        <p className="px-3 py-4 text-[13px] text-muted">Nenhuma tarefa sinalizada aberta.</p>
      ) : (
        sections.map((s) => (
          <div key={s.key} className="mb-2">
            <div className="flex items-center px-3 pb-1 pt-2 text-xs font-semibold text-text-soft">
              <span className="mr-1.5">
                <EmojiIcon emoji={s.emoji} />
              </span>
              <span className="flex-1">{s.label}</span>
              <span className="font-normal tabular-nums text-muted">{s.entries.length}</span>
            </div>
            <ul className="flex flex-col gap-px">
              {s.entries.map(({ src, item }) => (
                <li key={`${src.noteId}:${item.line}`}>
                  <button
                    type="button"
                    onClick={(e) => goToNote(src.noteId, wantsNewTab(e))}
                    onAuxClick={(e) => e.button === 1 && goToNote(src.noteId, true)}
                    className="block w-full rounded-md px-3 py-1.5 text-left hover:bg-card"
                  >
                    <span className="block break-words text-[13px] text-text">
                      <EmojiText text={markdownToPlain(item.text) || "(sem texto)"} />
                    </span>
                    <span className="block truncate text-[11px] text-muted">{src.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      <AppLink href="/sinalizadores" className="mt-3 block px-3 py-2 text-[13px] text-accent hover:underline">
        Abrir Sinalizadores
      </AppLink>
    </Scroll>
  );
}
