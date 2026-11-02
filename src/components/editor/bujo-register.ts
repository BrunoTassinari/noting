import { addMediaAction, addMemorableDayAction } from "@/app/(vault)/bujo-actions";
import { forgetCachedNote } from "@/components/vault/note-cache";
import { type Day, isoDay, MONTHS, WEEKDAYS_SHORT } from "@/lib/bujo";
import { MEDIA_KINDS, type MediaKind } from "@/lib/bujo-data";
import { el, icon } from "./bujo-dom";

// Linha "Registrar" do formulário do dia: diálogos que gravam na nota do mês
// (que não está aberta no editor) pelas ações do servidor. O <dialog> fica no
// <body>, fora do DOM do CodeMirror; as classes são do Tailwind (como em
// src/components/vault/dialogs.tsx).

const pad = (n: number) => String(n).padStart(2, "0");
const dayLabel = (d: Day) => `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${WEEKDAYS_SHORT[d.getUTCDay()]}`;
const monthName = (d: Day) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const buttonBase = "h-11 rounded-lg px-4 text-sm font-medium transition-opacity disabled:opacity-60 md:h-9";
const inputCls =
  "w-full rounded-lg border border-border bg-rail px-3.5 text-base text-text outline-none placeholder:text-muted focus:border-accent md:text-sm";
const labelCls = "mb-1.5 block text-[13px] font-medium text-text-soft";

type Result = { ok: true; id: string } | { ok: false; error: string };

let seq = 0;
const uid = (p: string) => `bujo-${p}-${++seq}`;

/**
 * Diálogo modal com um formulário. `submit` grava e devolve o resultado;
 * em sucesso fecha e chama `onDone`.
 */
function openDialog(opts: {
  title: string;
  subtitle: string;
  confirm: string;
  fields: (form: HTMLFormElement) => HTMLElement | void;
  submit: () => Promise<Result> | Result;
  onDone: () => void;
}) {
  const dialog = el(
    "dialog",
    "m-auto w-[calc(100%-32px)] max-w-md rounded-xl border border-border bg-panel p-0 text-text backdrop:bg-black/60",
  );
  dialog.dataset.bujoDialog = "";
  const titleId = uid("title");
  dialog.setAttribute("aria-labelledby", titleId);
  const form = el("form", "p-5");
  const h = el("h2", "text-base font-semibold text-text-strong", opts.title);
  h.id = titleId;
  form.append(h, el("p", "mb-4 mt-1 text-xs text-muted", opts.subtitle));
  const focus = opts.fields(form);

  const error = el("p", "mt-3 text-[13px] text-danger");
  error.setAttribute("role", "alert");
  error.hidden = true;
  form.append(error);

  const buttons = el("div", "mt-5 flex justify-end gap-2");
  const cancel = el("button", `${buttonBase} text-text-soft hover:bg-card`, "Cancelar");
  cancel.type = "button";
  const ok = el("button", `${buttonBase} bg-accent font-semibold text-accent-ink hover:opacity-90`, opts.confirm);
  ok.type = "submit";
  buttons.append(cancel, ok);
  form.append(buttons);
  dialog.append(form);

  const close = () => dialog.close();
  cancel.addEventListener("click", close);
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  form.addEventListener("input", () => (error.hidden = true));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (ok.disabled) return;
    ok.disabled = true;
    ok.textContent = "Salvando…";
    let res: Result;
    try {
      res = await opts.submit();
    } catch {
      res = { ok: false, error: "Sem conexão. Nada foi salvo; tente de novo." };
    }
    ok.disabled = false;
    ok.textContent = opts.confirm;
    if (!res.ok) {
      error.textContent = res.error;
      error.hidden = false;
      return;
    }
    forgetCachedNote(res.id); // a nota do mês mudou fora do editor
    close();
    opts.onDone();
  });

  document.body.append(dialog);
  dialog.showModal();
  (focus ?? form.querySelector<HTMLElement>("input, textarea"))?.focus();
}

function textArea(form: HTMLFormElement, label: string, placeholder: string, rows = 3): HTMLTextAreaElement {
  const id = uid("ta");
  const l = el("label", labelCls, label);
  l.htmlFor = id;
  const ta = el("textarea", `${inputCls} min-h-[88px] resize-y py-2.5 leading-snug`);
  ta.id = id;
  ta.rows = rows;
  ta.placeholder = placeholder;
  ta.maxLength = 2000;
  // Enter grava (o texto vira uma linha só); Shift+Enter não faz nada diferente.
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  const wrap = el("div", "mt-3");
  wrap.append(l, ta);
  form.append(wrap);
  return ta;
}

export function openMemorableDialog(d: Day, onDone: (message: string) => void) {
  let ta: HTMLTextAreaElement;
  openDialog({
    title: "Dia memorável",
    subtitle: `${dayLabel(d)} · vai para "Dias memoráveis" de ${monthName(d)}`,
    confirm: "Salvar",
    fields(form) {
      ta = textArea(form, "O que aconteceu?", "Ex.: viagem com a família");
      ta.required = true;
      return ta;
    },
    async submit() {
      if (!ta.value.trim()) return { ok: false, error: "Escreva o que aconteceu." };
      return addMemorableDayAction(isoDay(d), ta.value);
    },
    onDone: () => onDone(`Salvo em Dias memoráveis de ${monthName(d)}.`),
  });
}

export function openMediaDialog(d: Day, onDone: (message: string) => void) {
  let kind: MediaKind = "serie";
  let stars = 0;
  let title: HTMLInputElement;
  let ongoing: HTMLInputElement;
  let comment: HTMLTextAreaElement;
  openDialog({
    title: "Série, filme ou livro",
    subtitle: `${dayLabel(d)} · vai para "O que vi e li" de ${monthName(d)}`,
    confirm: "Salvar",
    fields(form) {
      // Tipo
      const kinds = el("div", "flex flex-wrap gap-2");
      kinds.setAttribute("role", "radiogroup");
      kinds.setAttribute("aria-label", "Tipo");
      const kindButtons: HTMLButtonElement[] = [];
      const paintKinds = () =>
        kindButtons.forEach((b) => {
          const on = b.dataset.kind === kind;
          b.setAttribute("aria-checked", String(on));
          b.className = `${buttonBase} border ${
            on ? "border-accent bg-accent font-semibold text-accent-ink" : "border-border text-text-soft hover:bg-card"
          }`;
        });
      for (const [k, v] of Object.entries(MEDIA_KINDS)) {
        const b = el("button", "", v.label);
        b.type = "button";
        b.dataset.kind = k;
        b.setAttribute("role", "radio");
        b.addEventListener("click", () => {
          kind = k as MediaKind;
          paintKinds();
        });
        kindButtons.push(b);
        kinds.append(b);
      }
      paintKinds();
      const kindWrap = el("div", "");
      kindWrap.append(el("div", labelCls, "Tipo"), kinds);
      form.append(kindWrap);

      // Título
      const tid = uid("title");
      const tl = el("label", labelCls, "Título");
      tl.htmlFor = tid;
      title = el("input", `${inputCls} h-11 md:h-9`);
      title.id = tid;
      title.required = true;
      title.maxLength = 300;
      title.autocomplete = "off";
      const tw = el("div", "mt-3");
      tw.append(tl, title);
      form.append(tw);

      // Estrelas (opcional): clicar na mesma estrela tira a nota.
      const starsBox = el("div", "flex items-center gap-1");
      starsBox.setAttribute("role", "group");
      starsBox.setAttribute("aria-label", "Nota em estrelas (opcional)");
      const starButtons: HTMLButtonElement[] = [];
      const paintStars = () =>
        starButtons.forEach((b, i) => {
          b.replaceChildren(icon("star", 22, i < stars));
          b.setAttribute("aria-pressed", String(i < stars));
          b.className = `flex h-11 w-11 items-center justify-center rounded-lg hover:bg-card md:h-9 md:w-9 ${
            i < stars ? "text-accent" : "text-muted"
          }`;
        });
      for (let i = 1; i <= 5; i++) {
        const b = el("button", "");
        b.type = "button";
        b.setAttribute("aria-label", `${i} ${i === 1 ? "estrela" : "estrelas"}`);
        b.addEventListener("click", () => {
          stars = stars === i ? 0 : i;
          paintStars();
        });
        starButtons.push(b);
        starsBox.append(b);
      }
      paintStars();
      const sw = el("div", "mt-3");
      sw.append(el("div", labelCls, "Estrelas (opcional)"), starsBox);
      form.append(sw);

      // Em andamento
      const oid = uid("ongoing");
      const ow = el("label", "mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-text md:min-h-9");
      ow.htmlFor = oid;
      ongoing = el("input", "h-4 w-4 accent-[#7fd1c4]");
      ongoing.type = "checkbox";
      ongoing.id = oid;
      ow.append(ongoing, el("span", "", "Em andamento"));
      form.append(ow);

      comment = textArea(form, "Comentário (opcional)", "O que achou?", 2);
      return title;
    },
    async submit() {
      if (!title.value.trim()) return { ok: false, error: "Informe o título." };
      return addMediaAction(isoDay(d), {
        kind,
        title: title.value,
        stars: stars || null,
        ongoing: ongoing.checked,
        comment: comment.value,
      });
    },
    onDone: () => onDone(`Salvo em O que vi e li de ${monthName(d)}.`),
  });
}
