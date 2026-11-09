"use client";

import { useSyncExternalStore } from "react";

// Tema e leitura. A escolha fica no navegador (cada aparelho tem a sua):
//  - tema: "system" (segue o aparelho), "light", "dark", "dim" (escuro
//    suave, menos contraste) ou "sepia" (claro e quente);
//  - leitura: fonte, tamanho, entrelinha, espaço entre letras e peso.
// Um script no <head> (THEME_SCRIPT) aplica antes da página aparecer, para
// não piscar: data-theme e variáveis CSS no <html>.

export type ThemePref = "system" | "light" | "dark" | "dim" | "sepia";
const THEMES: ThemePref[] = ["system", "light", "dark", "dim", "sepia"];
const KEY = "noting-theme";
const READING_KEY = "noting-reading";
const COLORS: Record<Exclude<ThemePref, "system">, string> = {
  light: "#fef8f6",
  dark: "#141414",
  dim: "#232427",
  sepia: "#f3ead8",
};

export type ReadingFont = "firelight" | "legible" | "system";
export type Reading = {
  font: ReadingFont;
  /** Tamanho do texto das notas, em px. */
  size: number;
  /** Altura da linha (entrelinha). */
  line: number;
  /** Espaço entre letras, em em. */
  spacing: number;
  /** Peso do texto (400 normal, 500 médio, 600 forte). */
  weight: 400 | 500 | 600;
};

export const DEFAULT_READING: Reading = { font: "firelight", size: 16, line: 1.68, spacing: 0, weight: 400 };

/** Ponto de partida para astigmatismo: letra mais aberta, maior e mais espaçada. */
export const ASTIGMATISM_READING: Reading = { font: "legible", size: 18, line: 1.85, spacing: 0.02, weight: 500 };

const FONT_VAR: Record<ReadingFont, string> = {
  firelight: "var(--font-hanken-grotesk)",
  legible: "var(--font-atkinson)",
  system: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

/** Roda no <head>, antes de pintar. Mantém igual a apply()/applyReading() abaixo. */
export const THEME_SCRIPT = `(function(){try{var d=document.documentElement;var m=window.matchMedia("(prefers-color-scheme: light)");var C=${JSON.stringify(COLORS)};var F=${JSON.stringify(FONT_VAR)};function a(){var q=localStorage.getItem("${KEY}")||"system";var t=q==="system"?(m.matches?"light":"dark"):q;if(!C[t])t="dark";d.dataset.theme=t;d.style.colorScheme=(t==="light"||t==="sepia")?"light":"dark";var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute("content",C[t]);}function r(){var s={};try{s=JSON.parse(localStorage.getItem("${READING_KEY}")||"{}")||{};}catch(e){}var st=d.style;st.setProperty("--app-font",(F[s.font]||F.firelight));st.setProperty("--read-size",(s.size||16)+"px");st.setProperty("--read-line",String(s.line||1.68));st.setProperty("--read-spacing",(s.spacing||0)+"em");st.setProperty("--read-weight",String(s.weight||400));}a();r();m.addEventListener("change",a);window.__notingApplyTheme=a;window.__notingApplyReading=r;}catch(e){}})();`;

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY) as ThemePref | null;
    return v && THEMES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // sem armazenamento: vale só nesta página
  }
  const apply = (window as unknown as { __notingApplyTheme?: () => void }).__notingApplyTheme;
  if (apply) apply();
  else document.documentElement.dataset.theme = pref === "system" ? "dark" : pref;
  notify();
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readTheme, () => "system");
}

let readingCache: { raw: string | null; value: Reading } | null = null;

function readReading(): Reading {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(READING_KEY);
  } catch {
    // ok
  }
  if (readingCache && readingCache.raw === raw) return readingCache.value;
  let value = DEFAULT_READING;
  try {
    const s = JSON.parse(raw ?? "null") as Partial<Reading> | null;
    if (s && typeof s === "object") value = { ...DEFAULT_READING, ...s };
  } catch {
    // padrão
  }
  readingCache = { raw, value };
  return value;
}

export function setReading(patch: Partial<Reading> | null) {
  const next = patch === null ? DEFAULT_READING : { ...readReading(), ...patch };
  try {
    if (patch === null) localStorage.removeItem(READING_KEY);
    else localStorage.setItem(READING_KEY, JSON.stringify(next));
  } catch {
    // ok
  }
  const apply = (window as unknown as { __notingApplyReading?: () => void }).__notingApplyReading;
  if (apply) apply();
  notify();
}

export function useReading(): Reading {
  return useSyncExternalStore(subscribe, readReading, () => DEFAULT_READING);
}

export const NEXT_THEME: Record<ThemePref, ThemePref> = {
  system: "light",
  light: "dark",
  dark: "system",
  dim: "system",
  sepia: "system",
};
export const THEME_LABEL: Record<ThemePref, string> = {
  system: "Tema: do sistema",
  light: "Tema: claro",
  dark: "Tema: escuro",
  dim: "Tema: escuro suave",
  sepia: "Tema: sépia",
};
