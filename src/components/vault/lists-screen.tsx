"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  addListItemAction,
  type ItemPatch,
  loadListsAction,
  type Result,
  updateListItemAction,
} from "@/app/(vault)/lists-actions";
import { CartIcon, CheckIcon, ChecklistIcon, ChevronDownIcon, PencilIcon, PlusIcon, SearchIcon, StarIcon } from "@/components/icons";
import { LISTS_FOLDER } from "@/lib/bujo";
import { BUY, isOpenState, type ListItem, parseItem, RATING_RE } from "@/lib/lists";
import { markdownToPlain } from "@/lib/markdown-text";
import type { TaskState } from "@/lib/tasks";
import type { ListsPayload } from "@/server/lists";
import { StateBox } from "./list-state";
import { forgetCachedNote } from "./note-cache";
import { NoteLink } from "./note-link";
import { ScreenHeader } from "./screen-header";
import { Sheet } from "./sheet";
import { useVault } from "./vault-context";

type ListState = " " | "/" | "x" | "-";

const STATES: { state: ListState; label: string; group: string; done: string }[] = [
  { state: " ", label: "A fazer", group: "A fazer", done: "Marcado como a fazer." },
  { state: "/", label: "Em andamento", group: "Em andamento", done: "Marcado como em andamento." },
  { state: "x", label: "Concluído", group: "Concluídos", done: "Marcado como concluído." },
  { state: "-", label: "Desisti", group: "Desisti", done: "Marcado como desisti." },
];

const STORE_KEY = "noting:lista";

function readStored(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function store(id: string) {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {
    // sem armazenamento (aba privada): só não lembra a escolha
  }
}

/** Minúsculas e sem acentos, para a busca. */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const itemKey = (i: ListItem) => `${i.line}:${i.raw}`;

/** Clique na caixa: abertos → concluído; resolvidos → a fazer. */
const quickNext = (s: TaskState): ListState => (isOpenState(s) ? "x" : " ");

/** Tela "Listas": filmes, livros, compras… (notas em Bullet Journal/Listas). */
export function ListsScreen() {
  const { showError } = useVault();
  const [data, setData] = useState<ListsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [buyOnly, setBuyOnly] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const current = data?.current ?? null;

  const load = useCallback(
    async (id: string | null) => {
      const res = await loadListsAction(id).catch(() => null);
      if (res?.ok) setData(res.data);
      else showError(res?.error ?? "Não foi possível carregar as listas.");
    },
    [showError],
  );

  useEffect(() => {
    let cancelled = false;
    loadListsAction(readStored())
      .catch(() => null)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) setData(res.data);
        else showError(res?.error ?? "Não foi possível carregar as listas.");
      });
    return () => {
      cancelled = true;
    };
  }, [showError]);

  const choose = (id: string) => {
    if (id === current?.id) return;
    store(id);
    setEditing(null);
    void load(id);
  };

  /** Roda uma alteração; num erro (ex.: conflito) recarrega a lista. */
  const mutate = async (fn: () => Promise<Result<{ data: ListsPayload }>>, message?: string): Promise<boolean> => {
    if (!current) return false;
    const id = current.id;
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        forgetCachedNote(id);
        setData(res.data);
        if (message) showError(message);
        return true;
      }
      showError(res.error);
      await load(id);
    } catch {
      showError("Não foi possível salvar. Tente de novo.");
    } finally {
      setBusy(false);
    }
    return false;
  };

  const update = (item: ListItem, patch: ItemPatch, message?: string) =>
    mutate(() => updateListItemAction({ noteId: current!.id, line: item.line, raw: item.raw }, patch), message);

  const items = useMemo(() => current?.items ?? [], [current]);
  const q = fold(query.trim());
  const visible = items.filter(
    (i) =>
      (!buyOnly || i.buy) &&
      (!q || fold([i.title, i.comment ?? "", ...i.children.map((c) => c.text)].join("\n")).includes(q)),
  );
  const sections = new Set(items.map((i) => i.section)).size;
  const buyCount = items.filter((i) => i.buy && isOpenState(i.state)).length;
  const openCount = items.filter((i) => isOpenState(i.state)).length;
  const groups = [
    ...STATES.map((s) => ({ key: s.state as string, label: s.group, items: visible.filter((i) => i.state === s.state) })),
    { key: "other", label: "Outros", items: visible.filter((i) => !STATES.some((s) => s.state === i.state)) },
  ].filter((g) => g.items.length > 0);

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader
        title="Listas"
        subtitle={
          !data
            ? "Carregando…"
            : current
              ? `${current.name} · ${openCount} ${openCount === 1 ? "aberto" : "abertos"} de ${items.length}`
              : "Nenhuma lista"
        }
        actions={
          current && (
            <NoteLink
              id={current.id}
              className="flex h-11 shrink-0 items-center rounded-lg px-3 text-sm text-accent hover:bg-active md:h-8"
            >
              Abrir nota
            </NoteLink>
          )
        }
      />

      {data && data.lists.length > 0 && (
        <div className="shrink-0 border-b border-border/60 md:border-b-0">
          <div
            role="tablist"
            aria-label="Listas"
            className="mx-auto flex max-w-[868px] gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] md:flex-wrap md:px-6"
          >
            {data.lists.map((l) => {
              const active = l.id === current?.id;
              return (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => choose(l.id)}
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm md:h-8 ${
                    active
                      ? "border-accent/60 bg-card text-text-strong"
                      : "border-border text-text-soft hover:bg-active hover:text-text"
                  }`}
                >
                  <span className="max-w-[16rem] truncate">{l.name}</span>
                  <span
                    className={`min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums ${
                      active ? "bg-accent text-accent-ink" : "bg-active text-muted"
                    }`}
                    title={`${l.open} ${l.open === 1 ? "item aberto" : "itens abertos"}`}
                  >
                    {l.open}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 md:px-6">
        <div className="mx-auto max-w-[820px]">
          {data === null ? (
            <p className="py-10 text-center text-sm text-muted">Carregando…</p>
          ) : !current ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-card text-accent">
                <ChecklistIcon size={22} />
              </span>
              <p className="text-base font-medium text-text">Nenhuma lista ainda</p>
              <p className="max-w-sm text-[13px] text-muted">
                Crie notas na pasta “{LISTS_FOLDER}” (por exemplo Filmes, Livros, Compras) com itens “- [ ] nome”.
              </p>
            </div>
          ) : (
            <>
              <AddItemForm
                key={current.id}
                busy={busy}
                onAdd={(title, state, buy) =>
                  mutate(() => addListItemAction(current.id, title, state, buy), "Item adicionado.")
                }
              />

              <div className="mb-2 mt-3 flex items-center gap-2">
                <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-panel px-3 focus-within:border-accent/60 md:h-9">
                  <SearchIcon size={16} className="shrink-0 text-muted" />
                  <span className="sr-only">Buscar na lista</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar na lista"
                    className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted md:text-sm"
                  />
                </label>
                <button
                  type="button"
                  aria-pressed={buyOnly}
                  onClick={() => setBuyOnly((v) => !v)}
                  title="Só os itens marcados para comprar"
                  className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm md:h-9 ${
                    buyOnly ? "border-accent/60 bg-card text-accent" : "border-border text-text-soft hover:bg-active"
                  }`}
                >
                  <CartIcon size={16} />
                  Comprar
                  {buyCount > 0 && <span className="text-xs tabular-nums text-muted">{buyCount}</span>}
                </button>
              </div>

              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Esta lista ainda não tem itens.</p>
              ) : groups.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">Nenhum item encontrado.</p>
              ) : (
                groups.map((g) => {
                  const closed = collapsed.has(g.key);
                  return (
                    <section key={g.key} className="mb-4">
                      <h2>
                        <button
                          type="button"
                          aria-expanded={!closed}
                          onClick={() => toggleGroup(g.key)}
                          className="flex h-11 w-full items-center gap-2 border-b border-border text-left text-[13px] font-semibold uppercase tracking-wide text-muted hover:text-text md:h-9"
                        >
                          <ChevronDownIcon size={15} className={`transition-transform ${closed ? "-rotate-90" : ""}`} />
                          <span className="flex-1">{g.label}</span>
                          <span className="font-normal tabular-nums">{g.items.length}</span>
                        </button>
                      </h2>
                      {!closed && (
                        <ul>
                          {g.items.map((item) => (
                            <ItemRow
                              key={itemKey(item)}
                              item={item}
                              section={sections > 1 ? item.section : null}
                              busy={busy}
                              onToggle={() => {
                                const next = quickNext(item.state);
                                void update(item, { state: next }, STATES.find((s) => s.state === next)!.done);
                              }}
                              onEdit={() => setEditing(item)}
                            />
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>

      {current && (
        <EditSheet
          key={editing ? itemKey(editing) : "none"}
          item={editing}
          noteId={current.id}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            if (await update(editing!, patch, "Item atualizado.")) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ItemRow({
  item,
  section,
  busy,
  onToggle,
  onEdit,
}: {
  item: ListItem;
  /** Seção (##) do item, mostrada quando a lista tem mais de uma. */
  section: string | null;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const title = markdownToPlain(item.title) || "(sem título)";
  const emojis = item.emojis.join(" ");
  const resolved = item.state === "-";
  return (
    <li className="group flex items-start gap-1 border-b border-border/60">
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        aria-label={`${isOpenState(item.state) ? "Concluir" : "Voltar para a fazer"}: ${title}`}
        title={isOpenState(item.state) ? "Concluir" : "Voltar para a fazer"}
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-active disabled:opacity-50 md:size-9"
      >
        <StateBox state={item.state} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar: ${title}`}
        className="flex min-h-11 min-w-0 flex-1 flex-col justify-center py-2 text-left md:min-h-9 md:py-1.5"
      >
        <span className="flex w-full items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 break-words text-[15px] md:text-sm ${
              resolved ? "text-muted line-through decoration-muted/60" : "text-text"
            }`}
          >
            {emojis && <span className="mr-1.5 no-underline">{emojis}</span>}
            {title}
          </span>
          {section && (
            <span className="hidden max-w-[10rem] shrink-0 truncate text-xs text-muted sm:inline">{section}</span>
          )}
          {item.rating && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent/10 px-1.5 py-0.5 text-[13px] font-semibold tabular-nums text-accent">
              <StarIcon size={12} className="fill-current" />
              {item.rating}
            </span>
          )}
        </span>
        {item.comment && (
          <span className="mt-0.5 block break-words text-[13px] italic text-text-soft">{markdownToPlain(item.comment)}</span>
        )}
        {item.children.length > 0 && (
          <span className="mt-1 block space-y-0.5">
            {item.children.map((c, i) => {
              const sub = parseItem(c.text);
              return (
                <span
                  key={i}
                  className="flex items-center gap-1.5 break-words text-[13px] text-muted"
                  style={{ paddingLeft: Math.max(0, Math.min(c.indent, 16) - 2) * 4 }}
                >
                  {sub ? (
                    <>
                      <span className="scale-75">
                        <StateBox state={sub.state} />
                      </span>
                      <span className="min-w-0">{markdownToPlain(c.text)}</span>
                    </>
                  ) : (
                    <span className="min-w-0">{c.text.replace(/^[-*+]\s+/, "· ")}</span>
                  )}
                </span>
              );
            })}
          </span>
        )}
      </button>
      <span
        aria-hidden="true"
        className="hidden size-9 shrink-0 items-center justify-center text-muted opacity-0 group-hover:opacity-100 md:flex"
      >
        <PencilIcon size={15} />
      </span>
    </li>
  );
}

function StatePicker({
  value,
  onChange,
  disabled,
  wide,
}: {
  value: ListState;
  onChange: (s: ListState) => void;
  disabled?: boolean;
  /** Quatro colunas em telas largas (senão, duas). */
  wide?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Estado"
      className={`grid grid-cols-2 gap-1 rounded-xl bg-rail p-1 ${wide ? "sm:grid-cols-4" : ""}`}
    >
      {STATES.map((s) => (
        <button
          key={s.state}
          type="button"
          role="radio"
          aria-checked={value === s.state}
          disabled={disabled}
          onClick={() => onChange(s.state)}
          className={`flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-2 text-sm md:h-9 ${
            value === s.state ? "bg-card text-text-strong" : "text-text-soft hover:text-text"
          }`}
        >
          <StateBox state={s.state} />
          {s.label}
        </button>
      ))}
    </div>
  );
}

function AddItemForm({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (title: string, state: ListState, buy: boolean) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [state, setState] = useState<ListState>(" ");
  const [buy, setBuy] = useState(false);
  const [open, setOpen] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await onAdd(title, state, buy)) {
      setTitle("");
      setOpen(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-panel p-2">
      <div className="flex items-center gap-2">
        <PlusIcon size={18} className="ml-1 shrink-0 text-muted" />
        <label className="sr-only" htmlFor="novo-item">
          Novo item
        </label>
        <input
          id="novo-item"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setOpen(true)}
          maxLength={500}
          placeholder="Adicionar item no fim da lista"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-muted md:h-9 md:text-sm"
        />
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="flex h-11 shrink-0 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50 md:h-9"
        >
          Adicionar
        </button>
      </div>
      {(open || title) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/60 pt-2">
          <div className="min-w-0 flex-1 basis-[18rem]">
            <StatePicker value={state} onChange={setState} wide />
          </div>
          <button
            type="button"
            aria-pressed={buy}
            onClick={() => setBuy((v) => !v)}
            title={`Marca o item para comprar (${BUY} na nota)`}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm md:h-9 ${
              buy ? "border-accent/60 bg-card text-accent" : "border-border text-text-soft hover:bg-active"
            }`}
          >
            <CartIcon size={16} />
            Para comprar
          </button>
        </div>
      )}
    </form>
  );
}

function EditSheet({
  item,
  noteId,
  busy,
  onClose,
  onSave,
}: {
  item: ListItem | null;
  noteId: string;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: ItemPatch) => void;
}) {
  const initialState: ListState = item && STATES.some((s) => s.state === item.state) ? (item.state as ListState) : " ";
  const [state, setState] = useState<ListState>(initialState);
  const [rating, setRating] = useState(item?.rating ?? "");
  const [comment, setComment] = useState(item?.comment ?? "");
  const ratingOk = rating.trim() === "" || RATING_RE.test(rating.trim());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!item || !ratingOk) return;
    const patch: ItemPatch = {};
    if (state !== item.state) patch.state = state;
    if (rating.trim() !== (item.rating ?? "") || comment.trim() !== (item.comment ?? "")) {
      patch.evaluation = { rating: rating.trim() || null, comment: comment.trim() || null };
    }
    if (patch.state === undefined && patch.evaluation === undefined) onClose();
    else onSave(patch);
  };

  const title = item ? `${item.emojis.join(" ")} ${markdownToPlain(item.title)}`.trim() : "";

  return (
    <Sheet open={item !== null} onClose={onClose} title={title || "Item"}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-3 pt-1">
        <StatePicker value={state} onChange={setState} disabled={busy} />
        <div className="flex gap-3">
          <label className="flex w-28 shrink-0 flex-col gap-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <StarIcon size={12} /> Nota
            </span>
            <input
              value={rating}
              onChange={(e) => setRating(e.target.value)}
              inputMode="decimal"
              placeholder="ex.: 9.5"
              aria-invalid={!ratingOk}
              maxLength={6}
              className={`h-11 rounded-lg border bg-rail px-3 text-[15px] text-text outline-none focus:border-accent/60 md:h-9 md:text-sm ${
                ratingOk ? "border-border" : "border-danger"
              }`}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
            Comentário
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={500}
              placeholder="Opcional"
              className="h-11 rounded-lg border border-border bg-rail px-3 text-[15px] text-text outline-none focus:border-accent/60 md:h-9 md:text-sm"
            />
          </label>
        </div>
        {!ratingOk && <p className="-mt-2 text-xs text-danger">A nota deve ser um número, como 8 ou 9.5.</p>}
        <div className="flex items-center gap-2">
          <NoteLink
            id={noteId}
            className="flex h-11 items-center rounded-lg px-3 text-sm text-accent hover:bg-active md:h-9"
          >
            Abrir nota
          </NoteLink>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center rounded-lg px-3 text-sm text-text-soft hover:bg-active md:h-9"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={busy || !ratingOk}
            className="flex h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-50 md:h-9"
          >
            <CheckIcon size={16} />
            Salvar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
