"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/icons";
import { TabHistoryNav } from "./tabs";

/** Cabeçalho das telas do Bullet Journal (migração, pendências). */
export function ScreenHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <>
      <div className="flex h-[60px] shrink-0 items-center gap-1 border-b border-border bg-panel px-2 md:h-12 md:gap-2 md:border-b-0 md:bg-surface md:px-3">
        <Link
          href="/"
          aria-label="Voltar para as notas"
          className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-text md:hidden"
        >
          <ArrowLeftIcon size={22} />
        </Link>
        <TabHistoryNav />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[17px] font-semibold text-text-strong md:text-sm">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </>
  );
}
