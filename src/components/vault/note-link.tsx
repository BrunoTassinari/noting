"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { prefetchNote } from "./note-cache";
import { useVault } from "./vault-context";

type LinkProps = Omit<ComponentProps<typeof Link>, "href" | "prefetch">;

/** Ctrl/Cmd/Shift+clique ou clique do meio: abre numa aba nova do app. */
export function wantsNewTab(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; button: number }) {
  return e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
}

/**
 * Link interno do app. Clique normal navega na aba atual; Ctrl/Cmd+clique e
 * clique do meio abrem numa aba nova DO APP (nunca do navegador).
 */
export function AppLink({
  href,
  onClick,
  onOpen,
  ...props
}: { href: string; onOpen?: () => void } & LinkProps) {
  const { openHref } = useVault();
  const newTab = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    openHref(href, true);
  };
  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (wantsNewTab(e)) return newTab(e);
        onOpen?.();
      }}
      onAuxClick={(e) => {
        if (e.button === 1) newTab(e);
      }}
      // Clique do meio não liga a rolagem automática do navegador.
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
    />
  );
}

/**
 * Link para uma nota que abre "na hora":
 *  - mouse em cima / toque / foco → busca a nota em segundo plano;
 *  - clique → mostra a nota (do cache, ou um esqueleto) e navega.
 * Sem prefetch automático do Next (cada um seria uma ida ao servidor).
 */
export function NoteLink({ id, ...props }: { id: string } & LinkProps) {
  const { openNote } = useVault();
  const warm = () => void prefetchNote(id);
  return (
    <AppLink
      {...props}
      href={`/n/${id}`}
      onPointerEnter={warm}
      onTouchStart={(e) => {
        warm();
        props.onTouchStart?.(e);
      }}
      onFocus={warm}
      onOpen={() => openNote(id)}
    />
  );
}
