"use client";

import { useSyncExternalStore } from "react";

// Tema: "system" (segue o aparelho), "light" ou "dark". A escolha fica no
// navegador; o atributo data-theme no <html> é o que o CSS usa. Um script no
// <head> (THEME_SCRIPT) aplica antes da página aparecer, para não piscar.

export type ThemePref = "system" | "light" | "dark";
const KEY = "noting-theme";
const COLORS = { light: "#fef8f6", dark: "#232222" };

/** Roda no <head>, antes de pintar. Mantém igual a apply() abaixo. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}")||"system";var m=window.matchMedia("(prefers-color-scheme: light)");function a(){var q=localStorage.getItem("${KEY}")||"system";var t=q==="system"?(m.matches?"light":"dark"):q;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;var c=document.querySelector('meta[name="theme-color"]');if(c)c.setAttribute("content",t==="light"?"${COLORS.light}":"${COLORS.dark}");}a();m.addEventListener("change",a);window.__notingApplyTheme=a;}catch(e){}})();`;

const listeners = new Set<() => void>();

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
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
  listeners.forEach((l) => l());
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => "system",
  );
}

export const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
export const THEME_LABEL: Record<ThemePref, string> = {
  system: "Tema: do sistema",
  light: "Tema: claro",
  dark: "Tema: escuro",
};
