"use client";

import { useMemo } from "react";
import {
  CalendarMonthIcon,
  CalendarWeekIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@/components/icons";
import { periodOf, type PeriodicKind, shiftPeriod } from "@/lib/bujo";
import type { NoteMeta } from "@/lib/note-paths";
import type { MenuItem } from "./menu";
import { usePeriodicNotes } from "./use-periodic";

const LABELS: Record<PeriodicKind, [prev: string, next: string]> = {
  day: ["Dia anterior", "Próximo dia"],
  week: ["Semana anterior", "Próxima semana"],
  month: ["Mês anterior", "Próximo mês"],
};

/** Nota do dia/semana/mês: setas para o período vizinho e atalhos. */
function usePeriodicNav(note: NoteMeta) {
  const period = useMemo(() => periodOf(note), [note]);
  const { openPeriodic } = usePeriodicNotes();
  if (!period) return null;
  const { kind, day } = period;
  return {
    kind,
    labels: LABELS[kind],
    go: (n: -1 | 1) => openPeriodic(kind, shiftPeriod(kind, day, n)),
    week: () => openPeriodic("week", day),
    month: () => openPeriodic("month", day),
  };
}

/** Desktop: grupo na barra do caminho. */
export function PeriodicNav({ note }: { note: NoteMeta }) {
  const nav = usePeriodicNav(note);
  if (!nav) return null;
  const btn = "flex h-6 items-center gap-1 rounded-md px-1.5 text-muted hover:bg-active hover:text-text";
  return (
    <div className="flex items-center gap-0.5" aria-label="Navegar no diário" role="group">
      <button type="button" aria-label={nav.labels[0]} title={nav.labels[0]} onClick={() => nav.go(-1)} className={btn}>
        <ChevronLeftIcon size={14} />
      </button>
      <button type="button" aria-label={nav.labels[1]} title={nav.labels[1]} onClick={() => nav.go(1)} className={btn}>
        <ChevronRightIcon size={14} />
      </button>
      {nav.kind === "day" && (
        <>
          <span aria-hidden="true" className="mx-1 h-3.5 w-px bg-border" />
          <button type="button" title="Semana deste dia" onClick={nav.week} className={btn}>
            <CalendarWeekIcon size={14} />
            Semana
          </button>
          <button type="button" title="Mês deste dia" onClick={nav.month} className={btn}>
            <CalendarMonthIcon size={14} />
            Mês
          </button>
        </>
      )}
    </div>
  );
}

/** Celular: seta ao lado do título no cabeçalho (nada se a nota não é periódica). */
export function PeriodicArrow({ note, dir }: { note: NoteMeta; dir: -1 | 1 }) {
  const nav = usePeriodicNav(note);
  if (!nav) return null;
  const label = nav.labels[dir === -1 ? 0 : 1];
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => nav.go(dir)}
      className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-muted active:bg-card"
    >
      {dir === -1 ? <ChevronLeftIcon size={20} /> : <ChevronRightIcon size={20} />}
    </button>
  );
}

/** Celular: "Semana" e "Mês" do dia no menu "Mais opções". */
export function usePeriodicMenuItems(note: NoteMeta): MenuItem[] {
  const nav = usePeriodicNav(note);
  if (nav?.kind !== "day") return [];
  return [
    { label: "Semana deste dia", icon: <CalendarWeekIcon size={15} />, className: "md:hidden", onSelect: nav.week },
    { label: "Mês deste dia", icon: <CalendarMonthIcon size={15} />, className: "md:hidden", onSelect: nav.month },
  ];
}
