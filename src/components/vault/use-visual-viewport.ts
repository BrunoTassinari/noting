"use client";

import { useSyncExternalStore } from "react";

// Área visível de verdade. No iPhone o teclado não encolhe a página (só a
// "visual viewport"): sem isso a barra de ferramentas fica atrás dele.

type Box = { height: number; offsetTop: number } | null;

let current: Box = null;
function read(): Box {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return null;
  const height = Math.round(vv.height);
  const offsetTop = Math.round(vv.offsetTop);
  if (!current || current.height !== height || current.offsetTop !== offsetTop) {
    current = { height, offsetTop };
  }
  return current;
}

function subscribe(cb: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", cb);
  vv?.addEventListener("scroll", cb);
  return () => {
    vv?.removeEventListener("resize", cb);
    vv?.removeEventListener("scroll", cb);
  };
}

export function useVisualViewport(): Box {
  return useSyncExternalStore(subscribe, read, () => null);
}
