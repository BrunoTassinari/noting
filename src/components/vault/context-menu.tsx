"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MenuItem } from "./menu";

// Menu de contexto (clique direito, botão "…" ou toque longo). Um só por vez,
// desenhado pelo <ContextMenuHost/> do vault na posição pedida.

type Open = { x: number; y: number; items: MenuItem[]; label: string };

let current: Open | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openContextMenu(at: { x: number; y: number }, items: MenuItem[], label = "Opções") {
  const desktop = window.matchMedia("(min-width: 768px)").matches;
  current = { ...at, items: items.filter((i) => desktop || !i.desktopOnly), label };
  emit();
}

export function closeContextMenu() {
  if (!current) return;
  current = null;
  emit();
}

/** Abre o menu logo abaixo de um botão ("…"). */
export function openMenuAt(el: HTMLElement, items: MenuItem[], label?: string) {
  const r = el.getBoundingClientRect();
  openContextMenu({ x: r.left, y: r.bottom + 4 }, items, label);
}

/**
 * Toque longo (celular) abre o menu. Devolve handlers para o elemento e
 * `consumed()`: true se o toque virou menu (o clique que vem depois é ignorado).
 */
export function useLongPress(onLongPress: (at: { x: number; y: number }) => void, ms = 500) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const cancel = () => clearTimeout(timer.current);
  useEffect(() => cancel, []);
  return {
    handlers: {
      onTouchStart: (e: React.TouchEvent) => {
        fired.current = false;
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY };
        cancel();
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress(start.current);
        }, ms);
      },
      onTouchMove: (e: React.TouchEvent) => {
        const t = e.touches[0];
        if (Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > 10) cancel();
      },
      onTouchEnd: cancel,
      onTouchCancel: cancel,
    },
    consumed: () => {
      const f = fired.current;
      fired.current = false;
      return f;
    },
  };
}

export function ContextMenuHost() {
  const menu = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
  if (!menu) return null;
  return <ContextMenu key={`${menu.x},${menu.y}`} menu={menu} />;
}

function ContextMenu({ menu }: { menu: Open }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  // Não deixa o menu sair da tela.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
    const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, menu.y - height) : menu.y;
    setPos({ left, top });
    el.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [menu]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeContextMenu();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
        next?.focus();
      }
    };
    const onClose = () => closeContextMenu();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={menu.label}
      style={pos}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-52 rounded-lg border border-border bg-card p-1 shadow-xl"
    >
      {menu.items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            closeContextMenu();
            item.onSelect();
          }}
          className={`flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm outline-none hover:bg-active focus-visible:bg-active md:h-8 md:text-[13px] ${
            item.danger ? "text-danger" : "text-text"
          } ${item.className ?? ""}`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
