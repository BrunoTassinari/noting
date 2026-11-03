"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  deleteChatAction,
  listChatsAction,
  loadAiSettingsAction,
  loadChatAction,
} from "@/app/(vault)/assistant-actions";
import {
  BookIcon,
  CalendarWeekIcon,
  CloseIcon,
  GlobeIcon,
  HistoryIcon,
  InboxIcon,
  NoteIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  StopIcon,
  TrashIcon,
} from "@/components/icons";
import { AI_SETTINGS_EVENT, type AssistantPart, type DisplayItem, type ToolPart, toolLabel } from "@/lib/ai-display";
import { resolveWikilink } from "@/lib/note-paths";
import { WIKILINK_RE } from "@/lib/wikilinks";
import { openMenuAt } from "./context-menu";
import type { MenuItem } from "./menu";
import { notesChanged } from "./note-cache";
import { wantsNewTab } from "./note-link";
import { useVault } from "./vault-context";

// Conversa com o assistente (Claude): lê, busca e edita as notas, recebe
// anexos (imagens, PDF, texto) e pode levar junto a nota aberta.

type Attachment =
  | { kind: "image"; name: string; mediaType: string; data: string }
  | { kind: "pdf"; name: string; data: string }
  | { kind: "text"; name: string; text: string };

type ServerEvent =
  | { t: "chat"; id: string; title: string }
  | { t: "text"; d: string }
  | { t: "tool"; id: string; name: string }
  | { t: "tool_input"; id: string; input: Record<string, unknown> }
  | { t: "tool_done"; id: string; error?: boolean; changed?: string[]; created?: boolean }
  | { t: "notice"; message: string }
  | { t: "done" }
  | { t: "error"; message: string };

const LAST_CHAT_KEY = "noting-ai-chat";
const MAX_REQUEST = 3_800_000; // a Vercel aceita até ~4,5 MB por pedido
const MAX_TEXT_FILE = 400_000;
const IMAGE_MAX_SIDE = 1568;

const store = {
  get: () => {
    try {
      return localStorage.getItem(LAST_CHAT_KEY);
    } catch {
      return null;
    }
  },
  set: (id: string | null) => {
    try {
      if (id) localStorage.setItem(LAST_CHAT_KEY, id);
      else localStorage.removeItem(LAST_CHAT_KEY);
    } catch {
      // ok
    }
  },
};

const attachmentSize = (a: Attachment) => ("data" in a ? a.data.length : a.text.length * 2);

function readAs(file: File, how: "dataURL" | "text"): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    if (how === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });
}

/** Imagem reduzida para no máximo 1568 px (o tamanho que o modelo usa), em JPEG. */
async function shrinkImage(file: File): Promise<{ mediaType: string; data: string }> {
  const url = await readAs(file, "dataURL");
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 1_000_000 && /^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    return { mediaType: file.type, data: url.split(",")[1] };
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { mediaType: "image/jpeg", data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

async function toAttachment(file: File): Promise<Attachment | string> {
  if (file.type.startsWith("image/")) {
    try {
      return { kind: "image", name: file.name, ...(await shrinkImage(file)) };
    } catch {
      return `Não consegui abrir a imagem ${file.name}.`;
    }
  }
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return { kind: "pdf", name: file.name, data: (await readAs(file, "dataURL")).split(",")[1] };
  }
  if (file.size > MAX_TEXT_FILE) return `${file.name} é grande demais.`;
  const text = await readAs(file, "text");
  if (text.includes("\u0000")) return `${file.name}: só imagens, PDF e arquivos de texto.`;
  return { kind: "text", name: file.name, text };
}

/** Tela de toque: Enter quebra linha (envia pelo botão). */
function useCoarsePointer() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

const SUGGESTIONS: { label: string; prompt: string; Icon: typeof NoteIcon; needsNote?: boolean }[] = [
  {
    label: "Resumo da semana",
    prompt:
      "Faça um resumo da minha semana até hoje: o que fiz, o que ficou aberto, eventos, humor e hábitos. Termine com 3 pontos de atenção para a próxima semana.",
    Icon: CalendarWeekIcon,
  },
  {
    label: "Explicar esta nota",
    prompt: "Explique esta nota: as ideias principais, como se ligam e o que vale aprofundar.",
    Icon: BookIcon,
    needsNote: true,
  },
  {
    label: "Priorizar pendências",
    prompt: "Leia minhas Pendências e sugira o que priorizar agora, agrupando por tema.",
    Icon: InboxIcon,
  },
];

export function Assistant({ compact = false }: { compact?: boolean }) {
  const { activeNote, notes, goToNote, openSettings, showError } = useVault();
  const router = useRouter();
  const [chatId, setChatId] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [withNote, setWithNote] = useState(true);
  const [ready, setReady] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const checkReady = useCallback(() => {
    void loadAiSettingsAction()
      .catch(() => null)
      .then((r) => setReady(r?.ok ? Boolean(r.settings.keyHint || r.settings.serverKey) : true));
  }, []);

  const open = useCallback(async (id: string | null) => {
    abortRef.current?.abort();
    store.set(id);
    setChatId(id);
    setDraft("");
    setFiles([]);
    if (!id) {
      setItems([]);
      setTitle(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const r = await loadChatAction(id).catch(() => null);
    if (r?.ok) {
      setItems(r.items);
      setTitle(r.title);
    } else {
      store.set(null);
      setChatId(null);
      setItems([]);
      setTitle(null);
    }
    setLoading(false);
    stick.current = true;
  }, []);

  useEffect(() => {
    checkReady();
    const onFocus = () => document.visibilityState === "visible" && checkReady();
    window.addEventListener("focus", onFocus);
    window.addEventListener(AI_SETTINGS_EVENT, checkReady);
    // Reabre a última conversa (estado só muda no retorno, não no efeito).
    const last = store.get();
    let cancelled = false;
    void (last ? loadChatAction(last).catch(() => null) : Promise.resolve(null)).then((r) => {
      if (cancelled) return;
      if (r?.ok) {
        setChatId(r.id);
        setItems(r.items);
        setTitle(r.title);
      } else store.set(null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(AI_SETTINGS_EVENT, checkReady);
      abortRef.current?.abort();
    };
  }, [checkReady]);

  // Rola até o fim enquanto a resposta chega (se a pessoa não subiu a tela).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [items]);

  const send = async (text: string) => {
    const msg = text.trim();
    if ((!msg && files.length === 0) || streaming) return;
    const size = files.reduce((n, f) => n + attachmentSize(f), 0);
    if (size > MAX_REQUEST) {
      showError("Anexos grandes demais (máximo ~3,5 MB por mensagem).");
      return;
    }
    const noteId = withNote && activeNote ? activeNote.id : undefined;
    const base: DisplayItem[] = [
      ...items,
      {
        role: "user",
        text: msg,
        files: files.map((f) => (f.kind === "image" ? "imagem" : f.name)),
        note: noteId ? [activeNote!.path, activeNote!.title].filter(Boolean).join("/") : undefined,
      },
    ];
    const parts: AssistantPart[] = [];
    const render = () => setItems([...base, { role: "assistant", parts: parts.map((p) => ({ ...p })) }]);
    render();
    setDraft("");
    setFiles([]);
    setStreaming(true);
    stick.current = true;

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const changed = new Set<string>();
    let created = false;
    const fail = (message: string) => {
      parts.push({ type: "text", text: `⚠️ ${message}` });
      render();
    };

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          text: msg,
          noteId,
          attachments: files,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        fail(data?.error ?? "Não foi possível falar com o assistente.");
        if (res.status === 400) checkReady();
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line) as ServerEvent;
          if (e.t === "chat") {
            setChatId(e.id);
            setTitle(e.title);
            store.set(e.id);
          } else if (e.t === "text") {
            const last = parts[parts.length - 1];
            if (last?.type === "text") last.text += e.d;
            else parts.push({ type: "text", text: e.d });
          } else if (e.t === "tool") {
            parts.push({ type: "tool", id: e.id, name: e.name, status: "running" });
          } else if (e.t === "tool_input") {
            const t = parts.find((p): p is ToolPart => p.type === "tool" && p.id === e.id);
            if (t) {
              t.input = e.input;
              if (t.name === "web_search" || t.name === "web_fetch") t.status = "done";
            }
          } else if (e.t === "tool_done") {
            const t = parts.find((p): p is ToolPart => p.type === "tool" && p.id === e.id);
            if (t) t.status = e.error ? "error" : "done";
            e.changed?.forEach((id) => changed.add(id));
            if (e.created) created = true;
          } else if (e.t === "notice") {
            parts.push({ type: "text", text: `\n\n_${e.message}_` });
          } else if (e.t === "error") {
            fail(e.message);
          }
          render();
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") fail("A conexão caiu no meio da resposta.");
    } finally {
      setStreaming(false);
      abortRef.current = null;
      for (const p of parts) if (p.type === "tool" && p.status === "running") p.status = "error";
      render();
      if (changed.size) notesChanged([...changed]);
      if (created) router.refresh();
    }
  };

  const showHistory = async (anchor: HTMLElement) => {
    const r = await listChatsAction().catch(() => null);
    const chats = r?.ok ? r.chats : [];
    const menu: MenuItem[] = [
      { label: "Nova conversa", icon: <PlusIcon size={15} />, onSelect: () => void open(null) },
      ...chats.slice(0, 30).map<MenuItem>((c) => ({
        label: c.title,
        icon: <SparklesIcon size={15} className={c.id === chatId ? "text-accent" : "text-muted"} />,
        onSelect: () => void open(c.id),
      })),
    ];
    if (chatId) {
      menu.push({
        label: "Excluir esta conversa",
        icon: <TrashIcon size={15} />,
        danger: true,
        onSelect: async () => {
          await deleteChatAction(chatId).catch(() => null);
          void open(null);
        },
      });
    }
    openMenuAt(anchor, menu, "Conversas");
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: Attachment[] = [];
    for (const f of Array.from(list)) {
      const a = await toAttachment(f);
      if (typeof a === "string") showError(a);
      else next.push(a);
    }
    setFiles((cur) => [...cur, ...next].slice(0, 10));
  };

  const coarse = useCoarsePointer();
  const pad = compact ? "px-3" : "px-4 md:px-6";

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      <div className={`flex h-10 shrink-0 items-center gap-1 ${compact ? "px-2" : "px-3"}`}>
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-semibold text-muted">
          {title ?? "Nova conversa"}
        </span>
        <IconButton label="Nova conversa" onClick={() => void open(null)} disabled={streaming && !chatId}>
          <PlusIcon size={16} />
        </IconButton>
        <IconButton label="Conversas anteriores" onClick={(e) => void showHistory(e.currentTarget)}>
          <HistoryIcon size={16} />
        </IconButton>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className={`min-h-0 flex-1 overflow-y-auto pb-4 ${pad}`}
      >
        <div className={compact ? "" : "mx-auto max-w-3xl"}>
          {loading ? (
            <p className="py-6 text-[13px] text-muted">Carregando…</p>
          ) : ready === false ? (
            <SetupCard onOpen={openSettings} />
          ) : items.length === 0 ? (
            <Welcome
              hasNote={Boolean(activeNote)}
              onPick={(s) => {
                if (s.needsNote) setWithNote(true);
                void send(s.prompt);
              }}
            />
          ) : (
            <div className="flex flex-col gap-4 py-2">
              {items.map((item, i) =>
                item.role === "user" ? (
                  <UserBubble key={i} item={item} />
                ) : (
                  <AssistantReply
                    key={i}
                    parts={item.parts}
                    busy={streaming && i === items.length - 1}
                    resolve={(target) => resolveWikilink(notes, target)?.id ?? null}
                    onOpen={goToNote}
                  />
                ),
              )}
            </div>
          )}
        </div>
      </div>

      <div className={`shrink-0 pb-3 ${pad}`}>
        <div className={compact ? "" : "mx-auto max-w-3xl"}>
          <div className="rounded-xl border border-border bg-rail focus-within:border-border-strong">
            {(files.length > 0 || activeNote) && (
              <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
                {activeNote && (
                  <Chip
                    on={withNote}
                    onClick={() => setWithNote((v) => !v)}
                    title={withNote ? "A nota aberta vai junto (clique para tirar)" : "Clique para mandar a nota aberta junto"}
                  >
                    <NoteIcon size={13} className="shrink-0" />
                    <span className="truncate">{activeNote.title}</span>
                  </Chip>
                )}
                {files.map((f, i) => (
                  <Chip key={i} on onRemove={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                    <PaperclipIcon size={13} className="shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </Chip>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={draft}
              rows={compact ? 2 : 3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              onPaste={(e) => {
                if (e.clipboardData.files.length) {
                  e.preventDefault();
                  void addFiles(e.clipboardData.files);
                }
              }}
              placeholder={coarse ? "Pergunte sobre suas notas…" : "Pergunte sobre suas notas… (Enter envia, Shift+Enter quebra linha)"}
              aria-label="Mensagem para o assistente"
              className="block max-h-60 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-relaxed text-text outline-none placeholder:text-muted md:text-sm"
            />
            <div className="flex items-center gap-1 px-1.5 pb-1.5">
              <IconButton label="Anexar arquivo (imagem, PDF, texto)" onClick={() => fileRef.current?.click()}>
                <PaperclipIcon size={16} />
              </IconButton>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.pdf,.md,.txt,.csv,.json,text/*"
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex-1" />
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Parar"
                  title="Parar"
                  className="flex size-11 items-center justify-center rounded-lg bg-card text-text hover:bg-active md:size-8"
                >
                  <StopIcon size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void send(draft)}
                  disabled={!draft.trim() && files.length === 0}
                  aria-label="Enviar"
                  title="Enviar"
                  className="flex size-11 items-center justify-center rounded-lg bg-accent text-accent-ink disabled:opacity-40 md:size-8"
                >
                  <SendIcon size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text disabled:opacity-40 md:size-7"
    >
      {children}
    </button>
  );
}

function Chip({
  on,
  onClick,
  onRemove,
  title,
  children,
}: {
  on: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`flex h-7 max-w-full items-center gap-1 rounded-md border px-2 text-xs ${
        on ? "border-border-strong bg-card text-text" : "border-dashed border-border text-muted line-through"
      }`}
    >
      <button type="button" onClick={onClick} title={title} className="flex min-w-0 items-center gap-1" disabled={!onClick}>
        {children}
      </button>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Remover anexo" className="-mr-1 text-muted hover:text-text">
          <CloseIcon size={13} />
        </button>
      )}
    </span>
  );
}

function SetupCard({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 text-[13px] leading-relaxed text-text-soft">
      <p className="mb-2 flex items-center gap-2 font-semibold text-text-strong">
        <SparklesIcon size={16} className="text-hue-orchid" /> Configure o assistente
      </p>
      <p className="mb-3">
        O assistente usa a API da Anthropic, com a sua chave (crie em console.anthropic.com › API Keys). O uso é cobrado
        na conta da API, à parte da assinatura do Claude.
      </p>
      <button type="button" onClick={onOpen} className="h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink">
        Abrir Configurações
      </button>
    </div>
  );
}

function Welcome({ hasNote, onPick }: { hasNote: boolean; onPick: (s: (typeof SUGGESTIONS)[number]) => void }) {
  return (
    <div className="py-6">
      <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-strong">
        <SparklesIcon size={16} className="text-hue-orchid" /> Assistente
      </p>
      <p className="mb-4 text-[13px] leading-relaxed text-muted">
        Pergunte sobre suas notas: ele busca, lê e, se você pedir, cria e edita notas. Anexe imagens, PDFs ou textos com o
        clipe (ou arrastando).
      </p>
      <div className="flex flex-col gap-1.5">
        {SUGGESTIONS.filter((s) => hasNote || !s.needsNote).map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => onPick(s)}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-left text-[13px] text-text hover:bg-card md:min-h-9"
          >
            <s.Icon size={15} className="shrink-0 text-muted" />
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ item }: { item: Extract<DisplayItem, { role: "user" }> }) {
  return (
    <div className="flex flex-col items-end gap-1">
      {(item.note || item.files.length > 0) && (
        <div className="flex max-w-[90%] flex-wrap justify-end gap-1">
          {item.note && (
            <span className="flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] text-muted">
              <NoteIcon size={11} /> {item.note.split("/").pop()}
            </span>
          )}
          {item.files.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-[11px] text-muted">
              <PaperclipIcon size={11} /> {f}
            </span>
          ))}
        </div>
      )}
      {item.text && (
        <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-xl bg-active px-3 py-2 text-[14px] leading-relaxed text-text-strong">
          {item.text}
        </div>
      )}
    </div>
  );
}

const TOOL_ICONS: Record<string, typeof NoteIcon> = {
  search_notes: SearchIcon,
  list_notes: SearchIcon,
  read_note: NoteIcon,
  read_journal: CalendarWeekIcon,
  create_note: PlusIcon,
  append_to_note: PencilIcon,
  edit_note: PencilIcon,
  web_search: GlobeIcon,
  web_fetch: GlobeIcon,
};

function AssistantReply({
  parts,
  busy,
  resolve,
  onOpen,
}: {
  parts: AssistantPart[];
  busy: boolean;
  resolve: (target: string) => string | null;
  onOpen: (id: string, newTab?: boolean) => void;
}) {
  const last = parts[parts.length - 1];
  const thinking = busy && (!last || last.type === "tool" ? true : false);
  return (
    <div className="flex flex-col gap-2">
      {parts.map((p, i) =>
        p.type === "text" ? (
          <Markdown key={i} text={p.text} resolve={resolve} onOpen={onOpen} />
        ) : (
          <ToolLine key={p.id} part={p} resolve={resolve} onOpen={onOpen} />
        ),
      )}
      {thinking && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Pensando…
        </p>
      )}
    </div>
  );
}

function ToolLine({
  part,
  resolve,
  onOpen,
}: {
  part: ToolPart;
  resolve: (target: string) => string | null;
  onOpen: (id: string, newTab?: boolean) => void;
}) {
  const { verb, target, detail } = toolLabel(part.name, part.input);
  const Icon = TOOL_ICONS[part.name] ?? SparklesIcon;
  const id = target ? resolve(target) : null;
  const write = part.name === "create_note" || part.name === "append_to_note" || part.name === "edit_note";
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 text-xs ${
        part.status === "error" ? "text-danger" : write ? "text-hue-fern" : "text-muted"
      }`}
    >
      <Icon size={13} className={`shrink-0 ${part.status === "running" ? "animate-pulse" : ""}`} />
      <span className="shrink-0">{verb}</span>
      {target &&
        (id ? (
          <button
            type="button"
            onClick={(e) => onOpen(id, wantsNewTab(e))}
            className="min-w-0 truncate text-accent hover:underline"
          >
            {target.split("/").pop()}
          </button>
        ) : (
          <span className="min-w-0 truncate">{target.split("/").pop()}</span>
        ))}
      {detail && <span className="min-w-0 truncate">{detail}</span>}
      {part.status === "error" && <span className="shrink-0">· falhou</span>}
    </div>
  );
}

/** [[alvo|apelido]] → link Markdown com o esquema "wikilink:". */
const withWikilinks = (text: string) =>
  text.replace(WIKILINK_RE, (_m, target: string, alias?: string) => {
    const label = (alias ?? target.split("#")[0].split("/").pop() ?? target).replace(/[[\]]/g, "");
    return `[${label}](wikilink:${encodeURIComponent(target)})`;
  });

function Markdown({
  text,
  resolve,
  onOpen,
}: {
  text: string;
  resolve: (target: string) => string | null;
  onOpen: (id: string, newTab?: boolean) => void;
}) {
  return (
    <div className="ai-md break-words text-[14px] leading-relaxed text-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => (url.startsWith("wikilink:") ? url : defaultUrlTransform(url))}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("wikilink:")) {
              const id = resolve(decodeURIComponent(href.slice(9)));
              return id ? (
                <button type="button" className="text-accent hover:underline" onClick={(e) => onOpen(id, wantsNewTab(e))}>
                  {children}
                </button>
              ) : (
                <span className="text-muted underline decoration-dotted" title="Nota não encontrada">
                  {children}
                </span>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                {children}
              </a>
            );
          },
        }}
      >
        {withWikilinks(text)}
      </ReactMarkdown>
    </div>
  );
}
