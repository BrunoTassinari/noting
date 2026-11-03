"use client";

import { useSyncExternalStore } from "react";

// Abas dentro do app (como no Obsidian). Cada aba guarda o próprio histórico
// de endereços ("/n/<id>", "/listas", "/" = aba vazia). A URL do navegador é a
// da aba ativa; trocar de aba é só navegar para o endereço atual dela.
// Abas e ordem ficam no localStorage e voltam ao abrir o app.

export type Tab = { key: string; stack: string[]; at: number };
export type TabsState = { tabs: Tab[]; active: string };

const STORAGE_KEY = "noting-tabs";
const MAX_HISTORY = 50;
const MAX_TABS = 30;

const newKey = () => Math.random().toString(36).slice(2, 10);
const initial: TabsState = { tabs: [{ key: "t0", stack: ["/"], at: 0 }], active: "t0" };

let state: TabsState = initial;
const listeners = new Set<() => void>();

function set(next: TabsState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ok (modo privado etc.)
  }
  listeners.forEach((l) => l());
}

export function useTabsState(): TabsState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => initial,
  );
}

export const currentHref = (t: Tab) => t.stack[t.at] ?? "/";
export const activeTab = (s: TabsState = state) => s.tabs.find((t) => t.key === s.active) ?? s.tabs[0];

function valid(x: unknown): x is Tab {
  const t = x as Tab;
  return (
    !!t &&
    typeof t.key === "string" &&
    Array.isArray(t.stack) &&
    t.stack.length > 0 &&
    t.stack.every((h) => typeof h === "string" && h.startsWith("/")) &&
    Number.isInteger(t.at) &&
    t.at >= 0 &&
    t.at < t.stack.length
  );
}

function load(): TabsState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as TabsState | null;
    if (!raw || !Array.isArray(raw.tabs)) return null;
    const tabs = raw.tabs.filter(valid).slice(0, MAX_TABS);
    if (tabs.length === 0) return null;
    return { tabs, active: tabs.some((t) => t.key === raw.active) ? raw.active : tabs[0].key };
  } catch {
    return null;
  }
}

function replaceTab(s: TabsState, key: string, fn: (t: Tab) => Tab): TabsState {
  return { ...s, tabs: s.tabs.map((t) => (t.key === key ? fn(t) : t)) };
}

/**
 * Primeira carga: restaura as abas salvas (sem as notas que não existem mais)
 * e encaixa a URL atual. Devolve o endereço para onde navegar (restaurar a aba
 * ativa quando o app abre em "/") ou null.
 */
export function restoreTabs(href: string, allowRedirect: boolean, exists: (id: string) => boolean): string | null {
  const saved = load();
  if (!saved) {
    const key = newKey();
    set({ tabs: [{ key, stack: [href], at: 0 }], active: key });
    return null;
  }
  set(saved);
  const gone = new Set(
    saved.tabs
      .flatMap((t) => t.stack)
      .filter((h) => h.startsWith("/n/") && h !== href && !exists(h.slice(3)))
      .map((h) => h.slice(3)),
  );
  if (gone.size > 0) pruneNotes(gone);
  const active = activeTab();
  if (currentHref(active) === href) return null;
  const match = state.tabs.find((t) => currentHref(t) === href);
  if (match) {
    set({ ...state, active: match.key });
    return null;
  }
  if (href === "/" && allowRedirect) return currentHref(active);
  visit(href);
  return null;
}

/** A URL mudou (link, voltar do navegador...): registra no histórico da aba ativa. */
export function visit(href: string) {
  const tab = activeTab();
  if (currentHref(tab) === href) return;
  // Voltar/avançar do navegador: anda no histórico da aba em vez de empilhar.
  if (tab.stack[tab.at - 1] === href) {
    set(replaceTab(state, tab.key, (t) => ({ ...t, at: t.at - 1 })));
    return;
  }
  if (tab.stack[tab.at + 1] === href) {
    set(replaceTab(state, tab.key, (t) => ({ ...t, at: t.at + 1 })));
    return;
  }
  set(
    replaceTab(state, tab.key, (t) => {
      const stack = [...t.stack.slice(0, t.at + 1), href].slice(-MAX_HISTORY);
      return { ...t, stack, at: stack.length - 1 };
    }),
  );
}

/** Nova aba com `href`, logo depois da ativa. */
export function addTab(href: string, activate = true): string {
  const key = newKey();
  const i = state.tabs.findIndex((t) => t.key === state.active);
  const tabs = [...state.tabs];
  tabs.splice(i + 1, 0, { key, stack: [href], at: 0 });
  set({ tabs: tabs.slice(-MAX_TABS), active: activate ? key : state.active });
  return key;
}

/** Ativa a aba; devolve o endereço dela. */
export function activateTab(key: string): string | null {
  const tab = state.tabs.find((t) => t.key === key);
  if (!tab) return null;
  set({ ...state, active: key });
  return currentHref(tab);
}

/** Fecha a aba. Se era a ativa, devolve o endereço da vizinha que assume. */
export function closeTab(key: string): string | null {
  const i = state.tabs.findIndex((t) => t.key === key);
  if (i < 0) return null;
  const tabs = state.tabs.filter((t) => t.key !== key);
  if (tabs.length === 0) {
    const k = newKey();
    set({ tabs: [{ key: k, stack: ["/"], at: 0 }], active: k });
    return "/";
  }
  if (state.active !== key) {
    set({ ...state, tabs });
    return null;
  }
  const next = tabs[Math.min(i, tabs.length - 1)];
  set({ tabs, active: next.key });
  return currentHref(next);
}

/** Voltar (-1) / avançar (+1) no histórico da aba ativa. */
export function stepTab(dir: -1 | 1): string | null {
  const tab = activeTab();
  const at = tab.at + dir;
  if (at < 0 || at >= tab.stack.length) return null;
  set(replaceTab(state, tab.key, (t) => ({ ...t, at })));
  return tab.stack[at];
}

/** Arrastar para reordenar: põe `key` na posição de `targetKey`. */
export function moveTab(key: string, targetKey: string) {
  const from = state.tabs.findIndex((t) => t.key === key);
  const to = state.tabs.findIndex((t) => t.key === targetKey);
  if (from < 0 || to < 0 || from === to) return;
  const tabs = [...state.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(to, 0, tab);
  set({ ...state, tabs });
}

/**
 * Notas excluídas somem das abas (e do histórico). Aba que fica sem nada
 * fecha. Devolve o endereço para onde navegar se a aba ativa mudou.
 */
export function pruneNotes(gone: Set<string>): string | null {
  const dead = (h: string) => h.startsWith("/n/") && gone.has(h.slice(3));
  if (!state.tabs.some((t) => t.stack.some(dead))) return null;
  const before = currentHref(activeTab());
  const beforeKey = state.active;
  let tabs: Tab[] = [];
  let activeIndex = state.tabs.findIndex((t) => t.key === state.active);
  state.tabs.forEach((t, i) => {
    if (dead(currentHref(t))) {
      if (i < activeIndex) activeIndex--;
      return; // aba mostrando a nota excluída: fecha
    }
    const kept = t.stack.map((h, j) => ({ h, j })).filter(({ h }) => !dead(h));
    const at = kept.findIndex(({ j }) => j === t.at);
    tabs.push({ ...t, stack: kept.map(({ h }) => h), at: Math.max(0, at) });
  });
  if (tabs.length === 0) tabs = [{ key: newKey(), stack: ["/"], at: 0 }];
  const active = tabs.some((t) => t.key === beforeKey)
    ? beforeKey
    : tabs[Math.min(Math.max(0, activeIndex), tabs.length - 1)].key;
  set({ tabs, active });
  const after = currentHref(activeTab());
  return after !== before ? after : null;
}
