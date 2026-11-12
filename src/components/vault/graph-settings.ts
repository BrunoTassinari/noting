"use client";

import { useSyncExternalStore } from "react";

// Configurações do grafo, como no painel do Obsidian: filtros, grupos de
// cor, exibição e forças. Valem para o grafo global e o local; ficam salvas
// neste navegador.

export const GROUP_HUES = ["rose", "coral", "apricot", "honey", "fern", "verdigris", "cornflower", "lilac", "orchid", "ember"] as const;
export type GroupHue = (typeof GROUP_HUES)[number];
export type ColorGroup = { query: string; hue: GroupHue };

export type GraphSettings = {
  // Filtros
  periodic: boolean;
  lists: boolean;
  ghosts: boolean;
  orphans: boolean;
  /** Pontos de #tag ligados às notas que têm a tag. */
  tags: boolean;
  // Grupos
  colorByFolder: boolean;
  groups: ColorGroup[];
  // Exibição
  arrows: boolean;
  /** Zoom a partir do qual os nomes aparecem. */
  textZoom: number;
  nodeSize: number;
  linkWidth: number;
  // Forças
  center: number;
  repel: number;
  linkStrength: number;
  linkDistance: number;
};

export const DEFAULT_GRAPH: GraphSettings = {
  periodic: false,
  lists: true,
  ghosts: false,
  orphans: true,
  tags: false,
  colorByFolder: true,
  groups: [],
  arrows: false,
  textZoom: 1.3,
  nodeSize: 1,
  linkWidth: 1,
  center: 0.06,
  repel: 90,
  linkStrength: 0.6,
  linkDistance: 45,
};

const KEY = "noting-graph";
const listeners = new Set<() => void>();
let current: GraphSettings | null = null;

function read(): GraphSettings {
  if (current) return current;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<GraphSettings> | null;
    current = { ...DEFAULT_GRAPH, ...(raw && typeof raw === "object" ? raw : {}) };
    if (!Array.isArray(current.groups)) current.groups = [];
  } catch {
    current = { ...DEFAULT_GRAPH };
  }
  return current;
}

export function updateGraphSettings(patch: Partial<GraphSettings>) {
  current = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // ok
  }
  listeners.forEach((l) => l());
}

export function resetGraphSettings() {
  current = { ...DEFAULT_GRAPH };
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ok
  }
  listeners.forEach((l) => l());
}

export function useGraphSettings(): GraphSettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => DEFAULT_GRAPH,
  );
}
