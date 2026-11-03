import { type EditorView, WidgetType } from "@codemirror/view";
import { setDayHabitAction, setDayValueAction } from "@/app/(vault)/bujo-actions";
import { forgetCachedNote } from "@/components/vault/note-cache";
import { day, isoDay, MONTHS, today, WEEKDAYS_SHORT } from "@/lib/bujo";
import {
  asNumber,
  CLIMA,
  type DayData,
  daysInMonth,
  HUMOR,
  type MonthData,
  monthSummary,
  normalizeValue,
  parseMonth,
  type ScalarKey,
  STRESS,
} from "@/lib/bujo-data";
import { el, fmtNum, icon, svgEl } from "./bujo-dom";
import { getMonthState, loadMonth, patchDay, subscribeMonth } from "./bujo-month-store";

// Widgets da nota do mês:
//   ```bujo-habits``` → tabela editável (um dia por linha; hábitos e medidas);
//   ```bujo-humor```  → gráfico do mês (SVG próprio) e resumos.
// Os dados vêm de GET /api/bujo/month (cache em bujo-month-store); gravar
// muda o frontmatter da nota diária daquele dia, no servidor. O DOM da
// tabela é montado uma vez e atualizado célula a célula (sem perder o foco).

const EMPTY: DayData = { humor: null, stress: null, clima: null, temperatura: null, cardio: null, habitos: [] };

const pad = (n: number) => String(n).padStart(2, "0");

export function monthLabel(month: string | null): string {
  const ym = month ? parseMonth(month) : null;
  return ym ? `${MONTHS[ym.m - 1]} ${ym.y}` : "";
}

/** Limpeza do widget (assinatura do cache, ResizeObserver), por elemento raiz. */
const cleanups = new WeakMap<HTMLElement, () => void>();

/** Título do cartão e o botão de editar o bloco como texto. */
function cardHeader(view: EditorView, title: string, root: HTMLElement): HTMLElement {
  const head = el("div", "cm-bujo-head");
  head.append(el("div", "cm-bujo-title", title));
  const edit = el("button", "cm-bujo-iconbtn");
  edit.type = "button";
  edit.title = "Editar o bloco como texto";
  edit.setAttribute("aria-label", "Editar o bloco como texto");
  edit.append(icon("pencil", 16));
  edit.addEventListener("mousedown", (e) => e.preventDefault());
  edit.addEventListener("click", () => {
    const line = view.state.doc.lineAt(view.posAtDOM(root));
    view.dispatch({ selection: { anchor: line.to } });
    view.focus();
  });
  head.append(edit);
  return head;
}

function loadingBox(): HTMLElement {
  return el("div", "cm-bujo-hint", "Carregando os dados do mês…");
}

function errorBox(month: string, message: string): HTMLElement {
  const box = el("div", "cm-bujo-hint cm-bujo-error");
  box.append(el("span", "", `${message} `));
  const retry = el("button", "cm-bujo-chip", "Tentar de novo");
  retry.type = "button";
  retry.addEventListener("click", () => void loadMonth(month));
  box.append(retry);
  return box;
}

/** Mensagem passageira no rodapé do cartão (erros de gravação). */
function flash(status: HTMLElement, message: string) {
  status.textContent = message;
  const at = Date.now();
  status.dataset.at = String(at);
  setTimeout(() => {
    if (status.dataset.at === String(at)) status.textContent = "";
  }, 6000);
}

// ---------- Tabela de hábitos ----------

type DayWrite = Awaited<ReturnType<typeof setDayValueAction>>;

function scaleSelect(labels: string[], name: string): HTMLSelectElement {
  const s = el("select", "cm-bujo-select");
  s.append(new Option("—", ""));
  labels.forEach((l, i) => s.append(new Option(`${i + 1} ${l}`, String(i + 1))));
  s.setAttribute("aria-label", name);
  return s;
}

class DayRow {
  readonly tr: HTMLTableRowElement;
  private readonly checks: HTMLButtonElement[] = [];
  private readonly selects: Record<"humor" | "stress" | "clima", HTMLSelectElement>;
  private readonly inputs: Record<"temperatura" | "cardio", HTMLInputElement>;
  /** Dados mostrados (com as gravações otimistas). */
  current: DayData = EMPTY;
  hasNote = false;
  /** Gravações em andamento: enquanto houver, o cache não sobrescreve a linha. */
  pending = 0;

  constructor(
    readonly table: HabitsTable,
    readonly d: number,
    readonly date: Date,
  ) {
    const tr = el("tr", "");
    this.tr = tr;
    const label = `${pad(d)}/${pad(date.getUTCMonth() + 1)}`;
    const th = el("th", "cm-bujo-day", `${pad(d)} ${WEEKDAYS_SHORT[date.getUTCDay()]}`);
    th.scope = "row";
    tr.append(th);
    const now = today().getTime();
    if (date.getTime() === now) tr.classList.add("cm-bujo-today");
    if (date.getTime() > now) tr.classList.add("cm-bujo-future");
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) tr.classList.add("cm-bujo-weekend");

    for (const h of table.habits) {
      const td = el("td", "cm-bujo-cell-check");
      const b = el("button", "cm-bujo-check");
      b.type = "button";
      b.setAttribute("aria-label", `${h}, ${label}`);
      b.append(icon("check", 14));
      b.addEventListener("click", () => {
        const on = !this.current.habitos.includes(h);
        const habitos = on ? [...this.current.habitos, h] : this.current.habitos.filter((x) => x !== h);
        void this.write({ ...this.current, habitos }, () => setDayHabitAction(isoDay(this.date), h, on));
      });
      td.append(b);
      tr.append(td);
      this.checks.push(b);
    }

    const humor = scaleSelect(HUMOR, `Humor, ${label}`);
    const stress = scaleSelect(STRESS, `Stress, ${label}`);
    const clima = el("select", "cm-bujo-select");
    clima.setAttribute("aria-label", `Clima, ${label}`);
    clima.append(new Option("—", ""));
    for (const c of CLIMA) clima.append(new Option(c, c));
    this.selects = { humor, stress, clima };
    for (const key of ["humor", "stress", "clima"] as const) {
      const s = this.selects[key];
      s.addEventListener("change", () => this.commit(key, s.value));
      const td = el("td", "cm-bujo-cell-metric");
      td.append(s);
      tr.append(td);
    }

    const num = (key: "temperatura" | "cardio", name: string) => {
      const input = el("input", "cm-bujo-input cm-bujo-input-sm");
      input.type = "text";
      input.inputMode = "decimal";
      input.setAttribute("aria-label", `${name}, ${label}`);
      input.addEventListener("change", () => this.commit(key, input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur();
        }
      });
      const td = el("td", "cm-bujo-cell-metric");
      td.append(input);
      tr.append(td);
      return input;
    };
    this.inputs = { temperatura: num("temperatura", "Temperatura em °C"), cardio: num("cardio", "Cardio em minutos") };
  }

  sync(data: DayData, hasNote: boolean) {
    this.current = data;
    this.hasNote = hasNote;
    this.tr.classList.toggle("cm-bujo-nonote", !hasNote);
    this.table.habits.forEach((h, i) => {
      const on = data.habitos.includes(h);
      this.checks[i].classList.toggle("cm-bujo-check-on", on);
      this.checks[i].setAttribute("aria-pressed", String(on));
    });
    this.selects.humor.value = data.humor === null ? "" : String(data.humor);
    this.selects.stress.value = data.stress === null ? "" : String(data.stress);
    this.selects.clima.value = data.clima ?? "";
    for (const key of ["temperatura", "cardio"] as const) {
      const input = this.inputs[key];
      if (document.activeElement === input && this.pending === 0) continue; // digitando
      const v = data[key];
      input.value = v === null ? "" : String(v).replace(".", ",");
    }
  }

  private commit(key: ScalarKey, raw: string) {
    const v = normalizeValue(key, raw);
    if (v === undefined) {
      const names: Record<ScalarKey, string> = {
        humor: "Humor",
        stress: "Stress",
        clima: "Clima",
        temperatura: "Temperatura",
        cardio: "Cardio",
      };
      flash(this.table.status, `${names[key]} inválido(a): use um número.`);
      this.sync(this.current, this.hasNote);
      return;
    }
    const next: DayData = {
      ...this.current,
      [key]: v === null ? null : key === "clima" ? v : asNumber(v),
    };
    void this.write(next, () => setDayValueAction(isoDay(this.date), key, v));
  }

  private async write(optimistic: DayData, call: () => Promise<DayWrite>) {
    const before = this.current;
    const hadNote = this.hasNote;
    this.pending++;
    this.sync(optimistic, hadNote);
    let res: DayWrite;
    try {
      res = await call();
    } catch {
      res = { ok: false, error: "Sem conexão. A mudança não foi salva." };
    }
    this.pending--;
    if (res.ok) {
      forgetCachedNote(res.id); // a nota diária mudou fora do editor
      patchDay(this.table.month, this.d, { ...res.data, id: res.id }, this.table);
      if (this.pending === 0) this.sync(res.data, true);
    } else {
      flash(this.table.status, res.error);
      if (this.pending === 0) this.sync(before, hadNote);
    }
  }
}

class HabitsTable {
  rows: DayRow[] = [];
  mounted = false;

  constructor(
    readonly month: string,
    readonly habits: string[],
    readonly status: HTMLElement,
  ) {}

  build(): HTMLElement {
    const ym = parseMonth(this.month)!;
    const scroller = el("div", "cm-bujo-scroll");
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", `Hábitos de ${monthLabel(this.month)}`);
    scroller.tabIndex = 0;
    const table = el("table", "cm-bujo-table");
    const head = el("tr", "");
    const corner = el("th", "cm-bujo-day", "Dia");
    corner.scope = "col";
    head.append(corner);
    for (const h of this.habits) {
      const th = el("th", "cm-bujo-th-habit");
      th.scope = "col";
      th.title = h;
      th.append(el("span", "", h));
      head.append(th);
    }
    for (const name of ["Humor", "Stress", "Clima", "°C", "Cardio"]) {
      const th = el("th", "cm-bujo-th-metric", name);
      th.scope = "col";
      head.append(th);
    }
    const thead = el("thead", "");
    thead.append(head);
    const tbody = el("tbody", "");
    for (let d = 1; d <= daysInMonth(ym.y, ym.m); d++) {
      const row = new DayRow(this, d, day(ym.y, ym.m, d));
      this.rows.push(row);
      tbody.append(row.tr);
    }
    table.append(thead, tbody);
    scroller.append(table);
    this.mounted = true;
    return scroller;
  }

  sync(data: MonthData) {
    for (const row of this.rows) {
      if (row.pending > 0) continue;
      const entry = data.days[row.d];
      row.sync(entry ?? EMPTY, Boolean(entry));
    }
  }
}

export class HabitsWidget extends WidgetType {
  constructor(
    readonly month: string | null,
    readonly habits: string[],
  ) {
    super();
  }
  eq(o: HabitsWidget) {
    return o.month === this.month && o.habits.join("\n") === this.habits.join("\n");
  }
  toDOM(view: EditorView) {
    const root = el("div", "cm-bujo-card cm-bujo-month");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Tabela de hábitos do mês");
    const label = monthLabel(this.month);
    root.append(cardHeader(view, `Hábitos${label ? ` · ${label}` : ""}`, root));
    const body = el("div", "");
    const status = el("div", "cm-bujo-status");
    status.setAttribute("role", "status");
    root.append(body, status);

    const month = this.month;
    if (!month || !parseMonth(month)) {
      body.append(el("div", "cm-bujo-hint", "Indique o mês no bloco, na linha month: AAAA-MM."));
      return root;
    }
    const table = new HabitsTable(month, this.habits, status);
    const render = (source: object | null) => {
      if (source === table) return; // a própria tabela já mostra o que gravou
      const st = getMonthState(month);
      if (!st?.data) {
        body.replaceChildren(st?.status === "error" ? errorBox(month, st.error) : loadingBox());
        return;
      }
      if (!table.mounted) {
        body.replaceChildren(table.build());
        view.requestMeasure(); // a altura do bloco mudou
      }
      table.sync(st.data);
      if (st.status === "error") flash(status, st.error);
    };
    cleanups.set(root, subscribeMonth(month, render));
    render(null);
    void loadMonth(month);
    return root;
  }
  destroy(dom: HTMLElement) {
    cleanups.get(dom)?.();
  }
  ignoreEvent() {
    return true;
  }
}

// ---------- Gráfico de humor ----------

// Matizes do Firelight (tokens em globals.css, ajustados por tema): azul
// (centáurea), coral e mel.
const COLOR = {
  humor: "var(--color-chart-humor)",
  stress: "var(--color-chart-stress)",
  temp: "var(--color-chart-temp)",
};
const SURFACE = "var(--color-panel)";

type Series = { name: string; color: string; values: (number | null)[] };

/** Gráfico de linhas de um eixo, com cruz e dica ao passar/tocar. */
function lineChart(opts: {
  width: number;
  height: number;
  n: number;
  yMin: number;
  yMax: number;
  yTicks: number[];
  series: Series[];
  label: string;
  tip: (d: number) => string;
  /** Linha acima do gráfico onde aparece o dia apontado. */
  readout: HTMLElement;
}): HTMLElement {
  const { width, height, n, yMin, yMax, series } = opts;
  const m = { l: 30, r: 10, t: 8, b: 22 };
  const pw = Math.max(40, width - m.l - m.r);
  const ph = height - m.t - m.b;
  const x = (d: number) => m.l + (n === 1 ? pw / 2 : ((d - 1) / (n - 1)) * pw);
  const y = (v: number) => m.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph;

  const wrap = el("div", "cm-bujo-chart");
  const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": opts.label });

  for (const t of opts.yTicks) {
    svg.append(svgEl("line", { x1: m.l, x2: m.l + pw, y1: y(t), y2: y(t), stroke: "var(--color-border)", "stroke-width": 1 }));
    const tx = svgEl("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end", fill: "var(--color-muted)", "font-size": 11 });
    tx.textContent = fmtNum(t);
    svg.append(tx);
  }
  const xTicks = [1, 5, 10, 15, 20, 25, n].filter((d, i, a) => d <= n && a.indexOf(d) === i && (d === n || n - d >= 3));
  for (const d of xTicks) {
    const tx = svgEl("text", { x: x(d), y: height - 6, "text-anchor": "middle", fill: "var(--color-muted)", "font-size": 11 });
    tx.textContent = String(d);
    svg.append(tx);
  }

  const cross = svgEl("line", { y1: m.t, y2: m.t + ph, stroke: "var(--color-muted)", "stroke-width": 1, visibility: "hidden" });
  svg.append(cross);

  for (const s of series) {
    // Linha só entre dias seguidos com valor; dia isolado vira ponto.
    let dPath = "";
    s.values.forEach((v, i) => {
      if (v === null) return;
      const prev = i > 0 ? s.values[i - 1] : null;
      dPath += `${prev === null ? "M" : "L"}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`;
    });
    if (dPath) {
      svg.append(
        svgEl("path", {
          d: dPath,
          fill: "none",
          stroke: s.color,
          "stroke-width": 2,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      );
    }
    s.values.forEach((v, i) => {
      if (v === null) return;
      svg.append(svgEl("circle", { cx: x(i + 1), cy: y(v), r: 4, fill: s.color, stroke: SURFACE, "stroke-width": 2 }));
    });
  }

  const { readout } = opts;
  const idle = readout.textContent ?? "";
  const show = (d: number) => {
    cross.setAttribute("x1", String(x(d)));
    cross.setAttribute("x2", String(x(d)));
    cross.setAttribute("visibility", "visible");
    readout.textContent = opts.tip(d);
    readout.classList.add("cm-bujo-readout-on");
  };
  const hide = () => {
    cross.setAttribute("visibility", "hidden");
    readout.textContent = idle;
    readout.classList.remove("cm-bujo-readout-on");
  };
  // Alvos maiores que a marca: uma faixa por dia, na altura toda.
  const step = n === 1 ? pw : pw / (n - 1);
  for (let d = 1; d <= n; d++) {
    const hit = svgEl("rect", { x: x(d) - step / 2, y: 0, width: step, height, fill: "transparent" });
    hit.addEventListener("pointerenter", () => show(d));
    hit.addEventListener("pointerdown", () => show(d));
    svg.append(hit);
  }
  // No toque, o dia escolhido fica na linha até tocar em outro.
  svg.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") hide();
  });
  wrap.append(svg);
  return wrap;
}

function legend(items: { name: string; color: string }[]): HTMLElement {
  const box = el("div", "cm-bujo-legend");
  for (const it of items) {
    const item = el("span", "cm-bujo-legend-item");
    const sw = el("span", "cm-bujo-swatch");
    sw.style.backgroundColor = it.color;
    item.append(sw, el("span", "", it.name));
    box.append(item);
  }
  return box;
}

/** Legenda (se houver) e a linha do dia apontado, acima do gráfico. */
function chartHead(items: { name: string; color: string }[]): { head: HTMLElement; readout: HTMLElement } {
  const head = el("div", "cm-bujo-chart-head");
  if (items.length) head.append(legend(items));
  const readout = el("div", "cm-bujo-readout", "Aponte ou toque num dia para ver os valores.");
  readout.setAttribute("aria-live", "polite");
  head.append(readout);
  return { head, readout };
}

function tile(label: string, value: string, sub?: string): HTMLElement {
  const t = el("div", "cm-bujo-tile");
  t.append(el("div", "cm-bujo-tile-label", label), el("div", "cm-bujo-tile-value", value));
  if (sub) t.append(el("div", "cm-bujo-tile-sub", sub));
  return t;
}

function renderHumor(month: string, data: MonthData, habits: string[], width: number): HTMLElement {
  const ym = parseMonth(month)!;
  const n = daysInMonth(ym.y, ym.m);
  const days = Array.from({ length: n }, (_, i) => data.days[i + 1] ?? null);
  const out = el("div", "cm-bujo-humor-body");

  const dayLabel = (d: number) => {
    const date = day(ym.y, ym.m, d);
    return `${pad(d)}/${pad(ym.m)} ${WEEKDAYS_SHORT[date.getUTCDay()]}`;
  };
  const tipText = (d: number) => {
    const v = days[d - 1];
    if (!v) return `${dayLabel(d)} · sem nota`;
    const parts = [dayLabel(d)];
    parts.push(v.humor ? `humor ${v.humor} ${HUMOR[v.humor - 1]}` : "humor —");
    parts.push(v.stress ? `stress ${v.stress} ${STRESS[v.stress - 1]}` : "stress —");
    if (v.temperatura !== null) parts.push(`${fmtNum(v.temperatura)} °C`);
    if (v.clima) parts.push(v.clima);
    return parts.join(" · ");
  };

  const humor = days.map((v) => v?.humor ?? null);
  const stress = days.map((v) => v?.stress ?? null);
  const temps = days.map((v) => v?.temperatura ?? null);

  const sec1 = el("div", "cm-bujo-section");
  sec1.append(el("div", "cm-bujo-subtitle", "Humor e stress (1 a 5)"));
  if (humor.some((v) => v !== null) || stress.some((v) => v !== null)) {
    const { head, readout } = chartHead([
      { name: "Humor", color: COLOR.humor },
      { name: "Stress", color: COLOR.stress },
    ]);
    sec1.append(
      head,
      lineChart({
        readout,
        width,
        height: 170,
        n,
        yMin: 1,
        yMax: 5,
        yTicks: [1, 2, 3, 4, 5],
        series: [
          { name: "Humor", color: COLOR.humor, values: humor },
          { name: "Stress", color: COLOR.stress, values: stress },
        ],
        label: `Humor e stress por dia em ${monthLabel(month)}`,
        tip: tipText,
      }),
    );
  } else {
    sec1.append(el("div", "cm-bujo-hint", "Nenhum humor ou stress registrado neste mês."));
  }
  out.append(sec1);

  const sec2 = el("div", "cm-bujo-section");
  sec2.append(el("div", "cm-bujo-subtitle", "Temperatura (°C)"));
  const known = temps.filter((v): v is number => v !== null);
  if (known.length) {
    const stepT = Math.max(...known) - Math.min(...known) > 30 ? 10 : 5;
    let lo = Math.floor(Math.min(...known) / stepT) * stepT;
    let hi = Math.ceil(Math.max(...known) / stepT) * stepT;
    if (hi === lo) {
      lo -= stepT;
      hi += stepT;
    }
    const ticks: number[] = [];
    for (let t = lo; t <= hi; t += stepT) ticks.push(t);
    const { head, readout } = chartHead([]);
    sec2.append(
      head,
      lineChart({
        readout,
        width,
        height: 130,
        n,
        yMin: lo,
        yMax: hi,
        yTicks: ticks,
        series: [{ name: "Temperatura", color: COLOR.temp, values: temps }],
        label: `Temperatura por dia em ${monthLabel(month)}`,
        tip: tipText,
      }),
    );
  } else {
    sec2.append(el("div", "cm-bujo-hint", "Nenhuma temperatura registrada neste mês."));
  }
  out.append(sec2);

  const s = monthSummary(month, data.days, habits, today());
  const scaleName = (avg: number | null, names: string[]) =>
    avg === null ? undefined : names[Math.min(5, Math.max(1, Math.round(avg))) - 1];
  const tiles = el("div", "cm-bujo-tiles");
  tiles.append(
    tile("Humor médio", s.humorAvg === null ? "—" : fmtNum(s.humorAvg), scaleName(s.humorAvg, HUMOR)),
    tile("Stress médio", s.stressAvg === null ? "—" : fmtNum(s.stressAvg), scaleName(s.stressAvg, STRESS)),
    tile(
      "Temperatura média",
      s.tempAvg === null ? "—" : `${fmtNum(s.tempAvg)} °C`,
      s.tempMin === null || s.tempMax === null ? undefined : `mín ${fmtNum(s.tempMin)} · máx ${fmtNum(s.tempMax)}`,
    ),
    tile(
      "Cardio no mês",
      `${fmtNum(s.cardioTotal, 0)} min`,
      s.cardioDays ? `em ${s.cardioDays} ${s.cardioDays === 1 ? "dia" : "dias"}` : undefined,
    ),
    tile(
      "Clima mais comum",
      s.climaTop?.value ?? "—",
      s.climaTop ? `${s.climaTop.count} ${s.climaTop.count === 1 ? "dia" : "dias"}` : undefined,
    ),
    tile(
      "Hábitos cumpridos",
      s.habitsPct === null ? "—" : `${fmtNum(s.habitsPct, 0)}%`,
      s.habitsPossible ? `${s.habitsDone} de ${s.habitsPossible}` : undefined,
    ),
  );
  out.append(tiles);
  return out;
}

export class HumorWidget extends WidgetType {
  /** `habits`: lista do ```bujo-habits``` do mesmo mês na nota (null = a do servidor). */
  constructor(
    readonly month: string | null,
    readonly habits: string[] | null,
  ) {
    super();
  }
  eq(o: HumorWidget) {
    return o.month === this.month && (o.habits ?? []).join("\n") === (this.habits ?? []).join("\n");
  }
  toDOM(view: EditorView) {
    const root = el("div", "cm-bujo-card cm-bujo-month");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Humor e temperatura do mês");
    const label = monthLabel(this.month);
    root.append(cardHeader(view, `Humor e temperatura${label ? ` · ${label}` : ""}`, root));
    const body = el("div", "");
    root.append(body);

    const month = this.month;
    if (!month || !parseMonth(month)) {
      body.append(el("div", "cm-bujo-hint", "Indique o mês no bloco, na linha month: AAAA-MM."));
      return root;
    }
    let width = 0;
    const render = () => {
      const st = getMonthState(month);
      if (!st?.data) {
        body.replaceChildren(st?.status === "error" ? errorBox(month, st.error) : loadingBox());
        return;
      }
      // Largura interna do cartão (padding de 14px dos lados).
      const w = Math.max(240, (width || 600) - 28);
      body.replaceChildren(renderHumor(month, st.data, this.habits ?? st.data.habits, w));
      view.requestMeasure();
    };
    const ro = new ResizeObserver(() => {
      const w = Math.round(root.clientWidth);
      if (w && w !== width) {
        width = w;
        render();
      }
    });
    ro.observe(root);
    const unsubscribe = subscribeMonth(month, render);
    cleanups.set(root, () => {
      unsubscribe();
      ro.disconnect();
    });
    render();
    void loadMonth(month);
    return root;
  }
  destroy(dom: HTMLElement) {
    cleanups.get(dom)?.();
  }
  ignoreEvent() {
    return true;
  }
}
