"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  NoteIcon,
  PlusIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "@/components/icons";
import { BUJO_SCREENS } from "./bujo-screens";
import { toggleSide, useLayout } from "./layout-store";
import {
  activateTab,
  activeTab,
  addTab,
  closeTab,
  currentHref,
  moveTab,
  pruneNotes,
  restoreTabs,
  stepTab,
  useTabsState,
  visit,
} from "./tabs-store";
import { useVault } from "./vault-context";

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;
let restored = false;

/**
 * Mantém as abas em dia com a URL e com as notas (excluídas somem), e cuida
 * dos atalhos: Ctrl/Cmd+W fecha a aba, Ctrl/Cmd+\ e Ctrl/Cmd+Shift+\
 * recolhem as laterais.
 */
export function WorkspaceSync() {
  const pathname = usePathname();
  const router = useRouter();
  const { notes, openHref } = useVault();
  const notesRef = useRef(notes);
  const openRef = useRef(openHref);
  useEffect(() => {
    notesRef.current = notes;
    openRef.current = openHref;
  });

  useEffect(() => {
    if (!restored) {
      restored = true;
      const ids = new Set(notesRef.current.map((n) => n.id));
      const href = restoreTabs(pathname, isDesktop(), (id) => ids.has(id));
      if (href && href !== pathname) {
        if (href.startsWith("/n/")) openRef.current(href);
        else router.replace(href);
      }
      return;
    }
    visit(pathname);
  }, [pathname, router]);

  // Nota excluída (aqui ou em outro aparelho): some das abas.
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(notes.map((n) => n.id));
    const before = known.current;
    known.current = ids;
    if (!before) return;
    const gone = new Set([...before].filter((id) => !ids.has(id)));
    if (gone.size === 0) return;
    const href = pruneNotes(gone);
    if (href && isDesktop()) router.replace(href);
  }, [notes, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !isDesktop()) return;
      const k = e.key.toLowerCase();
      if (k === "w" && !e.shiftKey) {
        e.preventDefault();
        const href = closeTab(activeTab().key);
        if (href) openRef.current(href);
      } else if (e.code === "Backslash" || e.code === "IntlBackslash" || k === "\\" || k === "|") {
        e.preventDefault();
        toggleSide(e.shiftKey ? "right" : "left");
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return null;
}

function useTabLabel() {
  const { notes } = useVault();
  return (href: string) => {
    if (href.startsWith("/n/")) {
      const id = href.slice(3);
      return { title: notes.find((n) => n.id === id)?.title ?? "Nota", Icon: NoteIcon };
    }
    const screen = BUJO_SCREENS.find((s) => s.href === href);
    if (screen) return { title: screen.label, Icon: screen.Icon };
    return { title: "Nova aba", Icon: null };
  };
}

const barButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text";

/** Barra de abas (desktop), com os botões das laterais nas pontas. */
export function TabBar() {
  const { tabs, active } = useTabsState();
  const layout = useLayout();
  const { openHref } = useVault();
  const label = useTabLabel();
  const [dragging, setDragging] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // A aba ativa sempre à vista.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, tabs.length]);

  const close = (key: string) => {
    const href = closeTab(key);
    if (href) openHref(href);
  };

  return (
    <div className="hidden h-10 shrink-0 items-center gap-1 bg-rail pl-1.5 pr-1.5 md:flex">
      <button
        type="button"
        aria-label={layout.left.open ? "Recolher lateral esquerda" : "Mostrar lateral esquerda"}
        title={`${layout.left.open ? "Recolher" : "Mostrar"} lateral esquerda (Ctrl \\)`}
        aria-pressed={layout.left.open}
        onClick={() => toggleSide("left")}
        className={barButton}
      >
        <SidebarLeftIcon size={16} />
      </button>

      <div
        ref={listRef}
        role="tablist"
        aria-label="Abas"
        className="flex h-full min-w-0 flex-1 items-end gap-px overflow-x-auto overflow-y-hidden pt-1.5 [scrollbar-width:none]"
      >
        {tabs.map((t) => {
          const href = currentHref(t);
          const { title, Icon } = label(href);
          const on = t.key === active;
          return (
            <div
              key={t.key}
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              aria-label={title}
              title={title}
              data-tab-key={t.key}
              data-href={href}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/x-noting-tab", t.key);
                e.dataTransfer.effectAllowed = "move";
                setDragging(t.key);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => {
                if (dragging) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const key = e.dataTransfer.getData("text/x-noting-tab") || dragging;
                if (key) moveTab(key, t.key);
                setDragging(null);
              }}
              onClick={() => {
                if (on) return;
                const next = activateTab(t.key);
                if (next) openHref(next);
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  close(t.key);
                }
              }}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  const next = activateTab(t.key);
                  if (next && !on) openHref(next);
                }
              }}
              className={`group flex h-full min-w-[96px] max-w-[220px] flex-[1_1_200px] cursor-default select-none items-center gap-2 rounded-t-lg pl-3 pr-1.5 text-[13px] ${
                on
                  ? "bg-surface text-text-strong"
                  : "text-muted hover:bg-card hover:text-text"
              } ${dragging === t.key ? "opacity-50" : ""}`}
            >
              {Icon && <Icon size={13} className="shrink-0 opacity-70" />}
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <button
                type="button"
                aria-label={`Fechar aba ${title}`}
                title="Fechar aba (Ctrl W)"
                onClick={(e) => {
                  e.stopPropagation();
                  close(t.key);
                }}
                className={`flex size-5 shrink-0 items-center justify-center rounded text-muted hover:bg-active hover:text-text ${
                  on ? "" : "opacity-0 focus:opacity-100 group-hover:opacity-100"
                }`}
              >
                <CloseIcon size={11} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Nova aba"
          title="Nova aba"
          onClick={() => {
            addTab("/");
            openHref("/");
          }}
          className={`${barButton} mb-1 ml-1`}
        >
          <PlusIcon size={15} />
        </button>
      </div>

      <button
        type="button"
        aria-label={layout.right.open ? "Recolher lateral direita" : "Mostrar lateral direita"}
        title={`${layout.right.open ? "Recolher" : "Mostrar"} lateral direita (Ctrl Shift \\)`}
        aria-pressed={layout.right.open}
        onClick={() => toggleSide("right")}
        className={barButton}
      >
        <SidebarRightIcon size={16} />
      </button>
    </div>
  );
}

/** Voltar/avançar no histórico da aba (como no Obsidian). */
export function TabHistoryNav() {
  const s = useTabsState();
  const { openHref } = useVault();
  const tab = activeTab(s);
  const go = (dir: -1 | 1) => {
    const href = stepTab(dir);
    if (href) openHref(href);
  };
  return (
    <div className="hidden shrink-0 items-center gap-0.5 md:flex">
      <button
        type="button"
        aria-label="Voltar"
        title="Voltar"
        disabled={tab.at === 0}
        onClick={() => go(-1)}
        className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-active hover:text-text disabled:pointer-events-none disabled:opacity-35"
      >
        <ArrowLeftIcon size={15} />
      </button>
      <button
        type="button"
        aria-label="Avançar"
        title="Avançar"
        disabled={tab.at >= tab.stack.length - 1}
        onClick={() => go(1)}
        className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-active hover:text-text disabled:pointer-events-none disabled:opacity-35"
      >
        <ArrowRightIcon size={15} />
      </button>
    </div>
  );
}
