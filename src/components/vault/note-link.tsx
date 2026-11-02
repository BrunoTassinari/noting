"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { prefetchNote } from "./note-cache";
import { useVault } from "./vault-context";

/**
 * Link para uma nota que abre "na hora":
 *  - mouse em cima / toque / foco → busca a nota em segundo plano;
 *  - clique → mostra a nota (do cache, ou um esqueleto) e navega.
 * Sem prefetch automático do Next (cada um seria uma ida ao servidor).
 */
export function NoteLink({
  id,
  onClick,
  ...props
}: { id: string } & Omit<ComponentProps<typeof Link>, "href" | "prefetch">) {
  const { openNote } = useVault();
  const warm = () => void prefetchNote(id);
  return (
    <Link
      {...props}
      href={`/n/${id}`}
      prefetch={false}
      onPointerEnter={warm}
      onTouchStart={warm}
      onFocus={warm}
      onClick={(e) => {
        onClick?.(e);
        // Ctrl/Cmd/Shift+clique abre em outra aba: deixa o navegador cuidar.
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        openNote(id);
      }}
    />
  );
}
