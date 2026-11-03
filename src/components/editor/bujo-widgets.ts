import { type EditorState, Facet, type Range, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, WidgetType } from "@codemirror/view";
import { dayFromDaily } from "@/lib/bujo";
import { getUserHabits } from "@/lib/user-habits";
import { asList, asNumber, asScale, CLIMA, HUMOR, parseHabitsBlock, STRESS } from "@/lib/bujo-data";
import { type FmValue, findFrontmatter, readFrontmatter, setFrontmatterKey } from "@/lib/frontmatter";
import { el, icon } from "./bujo-dom";
import { HabitsWidget, HumorWidget } from "./bujo-month-widgets";
import { openMediaDialog, openMemorableDialog } from "./bujo-register";

// Blocos que viram interface quando o cursor não está neles:
//   - frontmatter (--- ... ---) → painel de propriedades;
//   - ```bujo-dia``` → formulário do dia (grava no frontmatter);
//     e, em nota diária, a linha "Registrar" (grava na nota do mês);
//   - ```bujo-habits``` → tabela de hábitos do mês (bujo-month-widgets.ts);
//   - ```bujo-humor``` → gráfico de humor e resumos do mês.
// Com o cursor dentro (ou clicando no painel), o texto cru volta para edição.
// Decorações de bloco precisam vir de um StateField (não de um ViewPlugin).

const setFocus = StateEffect.define<boolean>();

export type NoteInfo = { path: string; title: string };

/**
 * Pasta e título da nota aberta (função: o nome pode mudar com o editor
 * aberto). Configurado em markdown-editor.tsx.
 */
export const bujoNote = Facet.define<() => NoteInfo | null, () => NoteInfo | null>({
  combine: (values) => values[0] ?? (() => null),
});

type Block = {
  kind: "dia" | "habits" | "humor";
  from: number;
  to: number;
  month?: string;
  /** Texto entre as cercas. */
  inner: string;
};

/** Blocos ```bujo-*``` do documento. */
export function findBujoBlocks(state: EditorState): Block[] {
  const out: Block[] = [];
  const doc = state.doc;
  for (let l = 1; l <= doc.lines; l++) {
    const line = doc.line(l);
    const m = /^```(bujo-dia|bujo-habits|bujo-humor)\s*$/.exec(line.text);
    if (!m) continue;
    let end = l + 1;
    while (end <= doc.lines && !/^```\s*$/.test(doc.line(end).text)) end++;
    if (end > doc.lines) break; // bloco sem fechamento: deixa como texto
    const inner = doc.sliceString(line.to, doc.line(end).from);
    const month = /month:\s*(\d{4}-\d{2})/.exec(inner)?.[1];
    out.push({ kind: m[1].slice(5) as Block["kind"], from: line.from, to: doc.line(end).to, month, inner });
    l = end;
  }
  return out;
}

/** Faixas que o live preview não deve decorar (viram widgets ou YAML cru). */
export function bujoRanges(state: EditorState): [number, number][] {
  const fm = findFrontmatter(state.doc.toString());
  const ranges: [number, number][] = fm ? [[fm.from, fm.to]] : [];
  for (const b of findBujoBlocks(state)) ranges.push([b.from, b.to]);
  return ranges;
}

// ---------- Formulário (escalas e opções em src/lib/bujo-data.ts) ----------

function setKey(view: EditorView, key: string, value: FmValue | null) {
  const change = setFrontmatterKey(view.state.doc.toString(), key, value);
  if (change) view.dispatch({ changes: change, userEvent: "input.bujo" });
}

function row(label: string, content: HTMLElement): HTMLElement {
  const r = el("div", "cm-bujo-row");
  r.append(el("div", "cm-bujo-label", label), content);
  return r;
}

function chip(text: string, active: boolean, onClick: () => void, title?: string): HTMLButtonElement {
  const b = el("button", `cm-bujo-chip${active ? " cm-bujo-chip-on" : ""}`, text);
  b.type = "button";
  b.setAttribute("aria-pressed", String(active));
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function numberInput(value: number | null, unit: string, label: string, onCommit: (v: string) => void) {
  const wrap = el("div", "cm-bujo-num");
  const input = el("input", "cm-bujo-input");
  input.type = "text";
  input.inputMode = "decimal";
  input.setAttribute("aria-label", label);
  input.value = value === null ? "" : String(value).replace(".", ",");
  let committed = input.value;
  const commit = () => {
    if (input.value === committed) return;
    committed = input.value;
    onCommit(input.value);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
  });
  wrap.append(input, el("span", "cm-bujo-unit", unit));
  return wrap;
}

/** Formulário do bloco ```bujo-dia```: lê e grava o frontmatter da nota. */
class DayFormWidget extends WidgetType {
  constructor(
    readonly values: Record<string, FmValue>,
    /** Hábitos configurados da pessoa (botões do formulário). */
    readonly habits: string[],
  ) {
    super();
  }
  eq(other: DayFormWidget) {
    return (
      JSON.stringify(other.values) === JSON.stringify(this.values) &&
      other.habits.join("\n") === this.habits.join("\n")
    );
  }
  toDOM(view: EditorView) {
    const v = this.values;
    const root = el("div", "cm-bujo-card cm-bujo-dia");
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Registro do dia");

    const scale = (key: string, labels: string[]) => {
      const cur = asScale(v[key]);
      const box = el("div", "cm-bujo-chips");
      labels.forEach((label, i) =>
        box.append(
          chip(`${i + 1} ${label}`, cur === i + 1, () => setKey(view, key, cur === i + 1 ? null : String(i + 1))),
        ),
      );
      return box;
    };

    root.append(row("Humor", scale("humor", HUMOR)));
    root.append(row("Stress", scale("stress", STRESS)));

    const clima = typeof v.clima === "string" && CLIMA.includes(v.clima) ? v.clima : null;
    const climaBox = el("div", "cm-bujo-chips");
    for (const c of CLIMA) {
      climaBox.append(chip(c, clima === c, () => setKey(view, "clima", clima === c ? null : c)));
    }
    root.append(row("Clima", climaBox));

    const nums = el("div", "cm-bujo-nums");
    nums.append(
      numberInput(asNumber(v.temperatura), "°C", "Temperatura em graus", (s) => {
        const n = asNumber(s);
        setKey(view, "temperatura", n === null ? null : String(n));
      }),
      numberInput(asNumber(v.cardio), "min de cardio", "Cardio em minutos", (s) => {
        const n = asNumber(s);
        setKey(view, "cardio", n === null ? null : String(n));
      }),
    );
    root.append(row("Medidas", nums));

    const marked = asList(v.habitos);
    const base = this.habits;
    const all = [...base, ...marked.filter((h) => !base.includes(h))];
    const habits = el("div", "cm-bujo-chips");
    for (const h of all) {
      const on = marked.includes(h);
      habits.append(
        chip(h, on, () => {
          const next = on ? marked.filter((x) => x !== h) : [...marked, h];
          setKey(view, "habitos", next.length ? next : null);
        }),
      );
    }
    if (all.length === 0) {
      habits.append(el("span", "cm-bujo-hint", "Nenhum hábito ainda. Configure em Configurações."));
    }
    root.append(row("Hábitos", habits));

    // Só em nota diária ("Bullet Journal/Daily/2026.11.03"): grava na nota do mês.
    const note = view.state.facet(bujoNote)();
    if (note && dayFromDaily(note)) root.append(row("Registrar", registerButtons(view)));
    return root;
  }
  ignoreEvent() {
    return true; // cliques e digitação ficam no formulário
  }
}

/** Botões "Dia memorável" e "Série / filme / livro" da linha Registrar. */
function registerButtons(view: EditorView): HTMLElement {
  const box = el("div", "cm-bujo-chips");
  const status = el("span", "cm-bujo-saved");
  status.setAttribute("role", "status");
  const done = (message: string) => {
    status.textContent = message;
    setTimeout(() => {
      if (status.textContent === message) status.textContent = "";
    }, 5000);
  };
  const button = (label: string, iconName: "star" | "play", open: typeof openMemorableDialog) => {
    const b = el("button", "cm-bujo-chip cm-bujo-chip-icon");
    b.type = "button";
    b.append(icon(iconName, 15), el("span", "", label));
    b.addEventListener("click", () => {
      // A data vem do título no momento do clique (a nota pode ter sido renomeada).
      const note = view.state.facet(bujoNote)();
      const d = note ? dayFromDaily(note) : null;
      if (d) open(d, done);
    });
    return b;
  };
  box.append(
    button("Dia memorável", "star", openMemorableDialog),
    button("Série / filme / livro", "play", openMediaDialog),
    status,
  );
  return box;
}

/** Painel de propriedades (frontmatter). Clique para editar o YAML. */
class PropertiesWidget extends WidgetType {
  constructor(readonly values: Record<string, FmValue>, readonly editAt: number) {
    super();
  }
  eq(other: PropertiesWidget) {
    return other.editAt === this.editAt && JSON.stringify(other.values) === JSON.stringify(this.values);
  }
  toDOM(view: EditorView) {
    const root = el("div", "cm-bujo-card cm-props");
    root.setAttribute("role", "button");
    root.setAttribute("aria-label", "Propriedades da nota. Clique para editar.");
    root.title = "Clique para editar as propriedades";
    const entries = Object.entries(this.values);
    if (entries.length === 0) root.append(el("div", "cm-props-empty", "Propriedades vazias"));
    for (const [k, val] of entries) {
      const r = el("div", "cm-props-row");
      r.append(el("span", "cm-props-key", k));
      const value = el("span", "cm-props-value");
      if (Array.isArray(val)) for (const item of val) value.append(el("span", "cm-props-pill", item));
      else value.textContent = val || "—";
      r.append(value);
      root.append(r);
    }
    root.addEventListener("mousedown", (e) => {
      e.preventDefault();
      view.dispatch({ selection: { anchor: this.editAt }, scrollIntoView: true });
      view.focus();
    });
    return root;
  }
  ignoreEvent() {
    return true;
  }
}

/** Hábitos do ```bujo-habits``` do mesmo mês nesta nota (null = nenhum). */
function habitsFor(blocks: Block[], month: string | undefined): string[] | null {
  const b = blocks.find((x) => x.kind === "habits" && x.month === month);
  return b && month ? parseHabitsBlock(b.inner, getUserHabits()).habits : null;
}

type FieldValue = { focused: boolean; decos: DecorationSet };

function touches(state: EditorState, focused: boolean, from: number, to: number) {
  if (!focused) return false;
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

function build(state: EditorState, focused: boolean): DecorationSet {
  const decos: Range<Decoration>[] = [];
  const text = state.doc.toString();
  const fm = findFrontmatter(text);
  const values = fm ? readFrontmatter(text) : {};

  const blocks = findBujoBlocks(state);
  // Nota diária com só as chaves do formulário: o painel repetiria o formulário.
  const DAY_KEYS = ["humor", "stress", "clima", "temperatura", "cardio", "habitos"];
  const onlyDayKeys =
    blocks.some((b) => b.kind === "dia") && Object.keys(values).every((k) => DAY_KEYS.includes(k));

  if (fm) {
    if (touches(state, focused, fm.from, fm.to)) {
      // Editando: YAML cru, em fonte de código.
      for (let l = state.doc.lineAt(fm.from).number; l <= state.doc.lineAt(fm.to).number; l++) {
        decos.push(Decoration.line({ class: "cm-frontmatter" }).range(state.doc.line(l).from));
      }
    } else if (onlyDayKeys) {
      decos.push(Decoration.replace({ block: true }).range(fm.from, fm.to));
    } else {
      decos.push(
        Decoration.replace({ widget: new PropertiesWidget(values, fm.innerFrom), block: true }).range(
          fm.from,
          fm.to,
        ),
      );
    }
  }

  for (const b of blocks) {
    if (touches(state, focused, b.from, b.to)) continue; // o live preview mostra como código
    let widget: WidgetType;
    if (b.kind === "dia") widget = new DayFormWidget(values, getUserHabits());
    else if (b.kind === "habits") widget = new HabitsWidget(b.month ?? null, parseHabitsBlock(b.inner, getUserHabits()).habits);
    else widget = new HumorWidget(b.month ?? null, habitsFor(blocks, b.month));
    decos.push(Decoration.replace({ widget, block: true }).range(b.from, b.to));
  }
  return Decoration.set(decos, true);
}

export const bujoWidgets = [
  StateField.define<FieldValue>({
    create: (state) => ({ focused: false, decos: build(state, false) }),
    update(value, tr) {
      let focused = value.focused;
      for (const e of tr.effects) if (e.is(setFocus)) focused = e.value;
      if (!tr.docChanged && !tr.selection && focused === value.focused) return value;
      return { focused, decos: build(tr.state, focused) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.decos),
  }),
  EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
];
