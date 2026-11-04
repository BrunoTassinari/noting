"use client";

import { useEffect, useState } from "react";
import {
  connectorStatusAction,
  createConnectorTokenAction,
  loadAiSettingsAction,
  revokeConnectorTokenAction,
  setAllowPrivateAction,
  saveAiSettingsAction,
} from "@/app/(vault)/assistant-actions";
import { saveHabitsAction } from "@/app/(vault)/settings-actions";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, PlusIcon } from "@/components/icons";
import { isoDay, MONTHS, today } from "@/lib/bujo";
import { setUserHabits } from "@/lib/user-habits";
import { AI_SETTINGS_EVENT } from "@/lib/ai-display";
import { buttonBase, Modal } from "./dialogs";

const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "O mais capaz · US$ 4 / 20 por milhão de tokens (entrada / saída)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Rápido e bom · US$ 2 / 10 por milhão" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "O mais barato · US$ 0,10 / 0,50 por milhão" },
];

/** Configurações da pessoa: hábitos do Bullet Journal e o assistente. */
export function SettingsDialog({
  open,
  onClose,
  habits,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  habits: string[];
  /** Depois de salvar: id da nota do mês alterada (para esquecer o cache). */
  onSaved: (monthNoteId: string | null) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Configurações">
      <SettingsTabs habits={habits} onClose={onClose} onSaved={onSaved} />
    </Modal>
  );
}

function SettingsTabs({
  habits,
  onClose,
  onSaved,
}: {
  habits: string[];
  onClose: () => void;
  onSaved: (monthNoteId: string | null) => void;
}) {
  const [tab, setTab] = useState<"habits" | "claude" | "ai">("habits");
  return (
    <>
      <div role="tablist" aria-label="Seções" className="mb-4 flex gap-1 rounded-lg bg-rail p-1">
        {(
          [
            ["habits", "Hábitos"],
            ["claude", "Conector Claude"],
            ["ai", "Chave da API"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-9 flex-1 rounded-md text-[13px] font-medium md:h-8 ${tab === key ? "bg-active text-text-strong" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "habits" ? (
        <HabitsForm initial={habits} onCancel={onClose} onSaved={onSaved} />
      ) : tab === "claude" ? (
        <ConnectorForm onClose={onClose} />
      ) : (
        <AiForm onClose={onClose} />
      )}
    </>
  );
}

/** Conector MCP: o app do Claude (com a assinatura) lê e edita as notas. */
function ConnectorForm({ onClose }: { onClose: () => void }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/api/mcp`;

  useEffect(() => {
    void connectorStatusAction()
      .catch(() => null)
      .then((r) => {
        setActive(r?.ok ? r.active : false);
        if (r?.ok) setAllowPrivate(r.allowPrivate);
      });
  }, []);

  const create = async () => {
    if (active && !window.confirm("Gerar um token novo? O atual para de funcionar no Claude.")) return;
    setBusy(true);
    const r = await createConnectorTokenAction().catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setToken(r.token);
      setActive(true);
    }
  };
  const revoke = async () => {
    if (!window.confirm("Desligar o conector? O Claude deixa de ver suas notas.")) return;
    setBusy(true);
    await revokeConnectorTokenAction().catch(() => null);
    setBusy(false);
    setToken(null);
    setActive(false);
  };
  const copy = (label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const field = (label: string, value: string) => (
    <div>
      <div className="mb-1 text-xs text-muted">{label}</div>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-rail px-3 py-2 font-mono text-xs leading-5 text-text">
          {value}
        </code>
        <button type="button" onClick={() => copy(label, value)} className={`${buttonBase} border border-border text-text hover:bg-card`}>
          {copied === label ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );

  if (active === null) return <p className="py-4 text-[13px] text-muted">Carregando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Usar as notas no Claude</h3>
        <p className="mt-0.5 text-xs leading-normal text-muted">
          Converse no claude.ai, no app do Claude ou no Claude Code (com a sua assinatura, sem custo extra) e ele busca,
          lê e, se você pedir, edita suas notas.
        </p>
      </div>

      {token ? (
        <>
          {field("Endereço (URL do servidor)", url)}
          {field("Token (aparece só agora: guarde)", token)}
          <ol className="list-decimal space-y-1 pl-5 text-xs leading-normal text-text-soft">
            <li>
              No claude.ai: <b>Configurações › Conectores › Adicionar conector personalizado</b>.
            </li>
            <li>Nome: Noting. URL: o endereço acima.</li>
            <li>
              Em autenticação, escolha enviar um cabeçalho: <span className="font-mono">Authorization</span> ={" "}
              <span className="font-mono">Bearer</span> + espaço + o token. Se não houver essa opção, use como URL o
              endereço com token (abaixo) e &ldquo;Sem login&rdquo;.
            </li>
            <li>Numa conversa, ative o Noting no menu de ferramentas e pergunte sobre suas notas.</li>
          </ol>
          {field("Endereço com token (se não houver opção de cabeçalho)", `${url}?token=${token}`)}
          {field(
            "Claude Code (terminal)",
            `claude mcp add --transport http noting ${url} --header "Authorization: Bearer ${token}"`,
          )}
        </>
      ) : active ? (
        <p className="rounded-lg border border-border bg-rail px-3 py-2 text-[13px] text-text">
          Conector ligado. O token só aparece quando é criado; se perdeu, gere outro (o antigo para de valer).
        </p>
      ) : (
        <p className="text-[13px] text-text-soft">Gere um token para ligar o conector.</p>
      )}

      <label className="flex min-h-11 cursor-pointer items-start gap-2 text-[13px] text-text-soft md:min-h-0">
        <input
          type="checkbox"
          checked={allowPrivate}
          onChange={(e) => {
            const v = e.target.checked;
            setAllowPrivate(v);
            void setAllowPrivateAction(v);
          }}
          className="mt-0.5 size-4 accent-[var(--color-accent)]"
        />
        <span>
          Deixar o Claude ler a pasta <b>Pessoal</b>
          <span className="block text-xs text-muted">
            Desligado: terapia, diários e tudo em Pessoal/ ficam fora do alcance do conector e do assistente.
          </span>
        </span>
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        {active && (
          <button type="button" disabled={busy} onClick={() => void revoke()} className={`${buttonBase} text-danger hover:bg-card`}>
            Desligar
          </button>
        )}
        <button type="button" onClick={onClose} className={`${buttonBase} text-text-soft hover:bg-card`}>
          Fechar
        </button>
        <button type="button" disabled={busy} onClick={() => void create()} className={`${buttonBase} bg-accent text-accent-ink`}>
          {busy ? "Gerando…" : active ? "Gerar novo token" : "Gerar token"}
        </button>
      </div>
    </div>
  );
}

function AiForm({ onClose }: { onClose: () => void }) {
  const [keyHint, setKeyHint] = useState<string | null>(null);
  const [model, setModel] = useState(AI_MODELS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadAiSettingsAction()
      .catch(() => null)
      .then((r) => {
        if (r?.ok) {
          setKeyHint(r.settings.keyHint);
          setModel(r.settings.model);
        }
        setLoaded(true);
      });
  }, []);

  const save = async (patch: { apiKey?: string; model?: string }) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const r = await saveAiSettingsAction(patch).catch(() => null);
    setSaving(false);
    if (!r?.ok) {
      setError(r?.error ?? "Não foi possível salvar.");
      return false;
    }
    setKeyHint(r.settings.keyHint);
    setModel(r.settings.model);
    setApiKey("");
    window.dispatchEvent(new Event(AI_SETTINGS_EVENT));
    setSaved(true);
    return true;
  };

  if (!loaded) return <p className="py-4 text-[13px] text-muted">Carregando…</p>;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Chave da API da Anthropic</h3>
        <p className="mt-0.5 text-xs leading-normal text-muted">
          Crie em console.anthropic.com › API Keys e coloque créditos em Billing. O uso é cobrado lá, à parte da
          assinatura do Claude. A chave fica cifrada e é sua: cada pessoa usa a própria.
        </p>
      </div>
      {keyHint ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-rail px-3 py-2 text-[13px]">
          <span className="flex-1 text-text">
            Chave salva <span className="font-mono text-muted">sk-ant-{keyHint}</span>
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save({ apiKey: "" })}
            className="text-xs text-danger hover:underline disabled:opacity-60"
          >
            Remover
          </button>
        </div>
      ) : null}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (apiKey.trim()) void save({ apiKey });
        }}
      >
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={keyHint ? "Trocar a chave (sk-ant-…)" : "sk-ant-…"}
          aria-label="Chave da API"
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-rail px-3 font-mono text-base text-text outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm"
        />
        <button
          type="submit"
          disabled={saving || !apiKey.trim()}
          className={`${buttonBase} bg-accent text-accent-ink disabled:opacity-60`}
        >
          {saving ? "Testando…" : "Salvar"}
        </button>
      </form>

      <div>
        <h3 className="mb-1.5 text-sm font-semibold text-text">Modelo</h3>
        <div className="flex flex-col gap-1">
          {AI_MODELS.map((m) => (
            <label key={m.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-lg px-1 py-1.5 hover:bg-card md:min-h-0">
              <input
                type="radio"
                name="ai-model"
                checked={model === m.id}
                disabled={saving}
                onChange={() => void save({ model: m.id })}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                <span className="block text-[13px] text-text">{m.label}</span>
                <span className="block text-xs text-muted">{m.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-[13px] text-hue-fern">Salvo.</p>}

      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={`${buttonBase} text-text-soft hover:bg-card`}>
          Fechar
        </button>
      </div>
    </div>
  );
}

function HabitsForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: string[];
  onCancel: () => void;
  onSaved: (monthNoteId: string | null) => void;
}) {
  const [list, setList] = useState(initial);
  const [draft, setDraft] = useState("");
  const [applyMonth, setApplyMonth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const monthName = MONTHS[today().getUTCMonth()];

  const add = () => {
    const h = draft.replace(/\s+/g, " ").trim();
    if (!h) return;
    if (list.some((x) => x.toLowerCase() === h.toLowerCase())) {
      setError("Esse hábito já está na lista.");
      return;
    }
    setList([...list, h]);
    setDraft("");
    setError(null);
  };
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };

  const save = async () => {
    setSaving(true);
    const pending = draft.trim() ? [...list, draft.trim()] : list;
    const r = await saveHabitsAction(pending, applyMonth ? isoDay(today()) : undefined);
    setSaving(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setUserHabits(r.habits);
    onSaved(r.monthNoteId);
  };

  const iconBtn =
    "flex size-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-card hover:text-text disabled:opacity-30 md:size-8";

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-text">Hábitos</h3>
        <p className="mt-0.5 text-xs leading-normal text-muted">
          Aparecem como botões no registro do dia e na tabela dos meses novos. Cada mês guarda a
          lista que tinha quando foi criado.
        </p>
      </div>

      <ul className="flex max-h-[40vh] flex-col gap-1 overflow-y-auto">
        {list.length === 0 && <li className="py-2 text-[13px] text-muted">Nenhum hábito ainda.</li>}
        {list.map((h, i) => (
          <li key={h} className="flex items-center gap-1 rounded-lg border border-border bg-rail pl-3">
            <span className="min-w-0 flex-1 truncate text-[15px] text-text md:text-sm">{h}</span>
            <button type="button" aria-label={`Subir ${h}`} title="Subir" disabled={i === 0} onClick={() => move(i, -1)} className={iconBtn}>
              <ArrowLeftIcon size={15} className="rotate-90" />
            </button>
            <button
              type="button"
              aria-label={`Descer ${h}`}
              title="Descer"
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
              className={iconBtn}
            >
              <ArrowRightIcon size={15} className="rotate-90" />
            </button>
            <button
              type="button"
              aria-label={`Remover ${h}`}
              title="Remover"
              onClick={() => setList(list.filter((x) => x !== h))}
              className={`${iconBtn} hover:text-danger`}
            >
              <CloseIcon size={15} />
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Novo hábito (ex.: Meditar)"
          aria-label="Novo hábito"
          maxLength={40}
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-rail px-3 text-base text-text outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm"
        />
        <button type="submit" className={`${buttonBase} flex items-center gap-1 border border-border text-text hover:bg-card`}>
          <PlusIcon size={15} /> Adicionar
        </button>
      </form>

      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[13px] text-text-soft md:min-h-0">
        <input type="checkbox" checked={applyMonth} onChange={(e) => setApplyMonth(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        Aplicar também à tabela de hábitos de {monthName}
      </label>

      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${buttonBase} text-text-soft hover:bg-card`}>
          Cancelar
        </button>
        <button type="button" disabled={saving} onClick={() => void save()} className={`${buttonBase} bg-accent text-accent-ink disabled:opacity-60`}>
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
