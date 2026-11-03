import type { DayData, MonthData } from "@/lib/bujo-data";

// Dados do mês (frontmatter das notas diárias) para os widgets da nota do
// mês, guardados fora dos widgets: o CodeMirror recria widgets à vontade, e
// a tabela e o gráfico do mesmo mês compartilham os dados.

export type MonthState =
  | { status: "loading"; data: MonthData | null }
  | { status: "ready"; data: MonthData }
  | { status: "error"; data: MonthData | null; error: string };

/** `source`: quem causou a mudança (o widget que gravou ignora o próprio aviso). */
type Listener = (source: object | null) => void;

const states = new Map<string, MonthState>();
const listeners = new Map<string, Set<Listener>>();
const inflight = new Map<string, Promise<void>>();
const loadedAt = new Map<string, number>();

/** Busca feita há menos que isso é reaproveitada (ex.: adiantada no clique). */
const FRESH_MS = 3_000;

export const getMonthState = (month: string): MonthState | null => states.get(month) ?? null;

function notify(month: string, source: object | null) {
  for (const fn of listeners.get(month) ?? []) fn(source);
}

export function subscribeMonth(month: string, fn: Listener): () => void {
  let set = listeners.get(month);
  if (!set) listeners.set(month, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

/**
 * Busca o mês no servidor (sempre: os dados mudam em outras notas). Enquanto
 * isso, quem já tem dados continua mostrando os anteriores.
 */
export function loadMonth(month: string): Promise<void> {
  const running = inflight.get(month);
  if (running) return running;
  const prev = states.get(month);
  if (prev?.status === "ready" && Date.now() - (loadedAt.get(month) ?? 0) < FRESH_MS) return Promise.resolve();
  if (!prev || prev.status === "error") {
    states.set(month, { status: "loading", data: prev?.data ?? null });
    notify(month, null);
  }
  const p = fetch(`/api/bujo/month?m=${encodeURIComponent(month)}`, { headers: { accept: "application/json" } })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as MonthData;
      states.set(month, { status: "ready", data });
      loadedAt.set(month, Date.now());
    })
    .catch(() => {
      const data = states.get(month)?.data ?? null;
      states.set(month, { status: "error", data, error: "Não foi possível carregar os dados do mês." });
    })
    .finally(() => {
      inflight.delete(month);
      notify(month, null);
    });
  inflight.set(month, p);
  return p;
}

/** Dados de um dia gravados (resposta da ação): atualiza o cache e avisa. */
export function patchDay(month: string, d: number, data: DayData & { id: string }, source: object | null) {
  const st = states.get(month);
  if (!st?.data) return;
  const next: MonthData = { ...st.data, days: { ...st.data.days, [d]: data } };
  states.set(month, { ...st, data: next } as MonthState);
  notify(month, source);
}
