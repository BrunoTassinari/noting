"use client";

import { useSyncExternalStore } from "react";

// Duas laterais (esquerda e direita), como no Obsidian. Cada uma mostra um
// painel por vez, escolhido na fileira de ícones do topo. Qualquer painel
// pode ficar em qualquer lateral. Tudo fica salvo no localStorage.

export const PANEL_KEYS = ["files", "search", "signals", "backlinks", "outline", "lists", "backlog", "assistant"] as const;
export type PanelKey = (typeof PANEL_KEYS)[number];
export type Side = "left" | "right";
export type SideState = { open: boolean; width: number; active: PanelKey | null };
export type LayoutState = { left: SideState; right: SideState; place: Record<PanelKey, Side> };

export const MIN_WIDTH = 200;
export const MAX_WIDTH = 520;
const STORAGE_KEY = "noting-layout";

const DEFAULT: LayoutState = {
  left: { open: true, width: 260, active: "files" },
  right: { open: true, width: 280, active: "backlinks" },
  place: {
    files: "left",
    search: "left",
    signals: "left",
    backlinks: "right",
    outline: "right",
    lists: "right",
    backlog: "right",
    assistant: "right",
  },
};

let state: LayoutState | null = null;
const listeners = new Set<() => void>();

const clampWidth = (w: number) => Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w)));

function read(): LayoutState {
  const fallback: LayoutState = {
    ...DEFAULT,
    // Tela estreita: começa com a lateral direita recolhida.
    right: { ...DEFAULT.right, open: typeof window === "undefined" || window.innerWidth >= 1200 },
  };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<LayoutState> | null;
    if (!raw) return fallback;
    const place = { ...DEFAULT.place };
    for (const k of PANEL_KEYS) {
      const s = raw.place?.[k];
      if (s === "left" || s === "right") place[k] = s;
    }
    const side = (s: Side): SideState => {
      const r = raw[s];
      const active = r?.active && PANEL_KEYS.includes(r.active) && place[r.active] === s ? r.active : null;
      return {
        open: typeof r?.open === "boolean" ? r.open : fallback[s].open,
        width: typeof r?.width === "number" ? clampWidth(r.width) : DEFAULT[s].width,
        active: active ?? PANEL_KEYS.find((k) => place[k] === s) ?? null,
      };
    };
    return { left: side("left"), right: side("right"), place };
  } catch {
    return fallback;
  }
}

function get(): LayoutState {
  if (!state) state = read();
  return state;
}

function set(next: LayoutState, persist = true) {
  state = next;
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ok
    }
  }
  listeners.forEach((l) => l());
}

export function useLayout(): LayoutState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    get,
    () => DEFAULT,
  );
}

export const panelsOn = (s: LayoutState, side: Side) => PANEL_KEYS.filter((k) => s.place[k] === side);

export function toggleSide(side: Side) {
  const s = get();
  set({ ...s, [side]: { ...s[side], open: !s[side].open } });
}

/** Durante o arraste só redesenha; salva no fim (persist = true). */
export function setSideWidth(side: Side, width: number, persist: boolean) {
  const s = get();
  set({ ...s, [side]: { ...s[side], width: clampWidth(width) } }, persist);
}

export function showPanel(key: PanelKey) {
  const s = get();
  const side = s.place[key];
  set({ ...s, [side]: { ...s[side], open: true, active: key } });
}

export function movePanel(key: PanelKey, to: Side) {
  const s = get();
  const from = s.place[key];
  if (from === to) return;
  const place = { ...s.place, [key]: to };
  const fromState =
    s[from].active === key
      ? { ...s[from], active: PANEL_KEYS.find((k) => place[k] === from) ?? null }
      : s[from];
  set({ ...s, place, [from]: fromState, [to]: { ...s[to], open: true, active: key } });
}
