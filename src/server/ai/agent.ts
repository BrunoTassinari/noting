import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AiModel } from "./config";
import { NOTE_TOOLS, runNoteTool } from "./tools";

type Msg = Anthropic.Beta.BetaMessageParam;

// Laço do assistente: chama o modelo (com streaming), executa as ferramentas
// pedidas nas notas e repete até a resposta final. O histórico só cresce
// (nada é reescrito), o que mantém o cache de prompt e o raciocínio válidos.

const MAX_TURNS = 30;

const SYSTEM = `Você é o assistente do Noting, o app de notas em Markdown da pessoa com quem fala (um "vault" no estilo Obsidian, com Bullet Journal). Responda em português do Brasil, de forma direta.

Você tem ferramentas para buscar, listar e ler as notas, e para criar ou alterar notas. Use-as sempre que a pergunta depender do que está escrito no vault: não invente conteúdo de notas que não leu. Ao citar uma nota, escreva o link no formato [[Pasta/Título]] ou [[Título]]: ele vira um link clicável.

Organização do vault:
- Bullet Journal/Daily/AAAA.MM.DD: nota de cada dia (tarefas, eventos, anotações, registro do dia com humor e hábitos).
- Bullet Journal/Weekly/AAAA.Wnn e Bullet Journal/Monthly/AAAA.mês: notas da semana e do mês.
- Bullet Journal/Pendências, Bullet Journal/Future Log e Bullet Journal/Listas/… (livros, filmes etc.).
- Tarefas: "- [ ]" aberta, "- [x]" feita, "- [/]" em andamento, "- [>]" migrada, "- [<]" agendada, "- [-]" cancelada; evento é "- [ ] 📅" (antigo: "- [o]"). Emojis sinalizam: ❗ importante, 💼 trabalho, 💡 ideia, 🔔 lembrança, 🌱 hábito, 📅 evento.
- Fichamentos de livros costumam ficar em Conhecimento/Fichamentos.
- Modelos de nota ficam em Templates/ (variáveis {{title}}, {{date}}, {{time}}): ao criar uma nota de um tipo que tem template, siga o template.

Para resumos de período (semana, mês), use read_journal com as datas certas. Só crie ou altere notas quando a pessoa pedir; ao editar, leia a nota antes e mexa só no necessário. Escreva notas em Markdown no mesmo estilo das que já existem.`;

const WEB_TOOLS = [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] as unknown as Anthropic.Beta.BetaToolUnion[];

export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "tool"; id: string; name: string }
  | { t: "tool_input"; id: string; input: Record<string, unknown> }
  | { t: "tool_done"; id: string; error?: boolean; changed?: string[]; created?: boolean }
  | { t: "notice"; message: string };

export class AgentError extends Error {}

/** Mensagem de erro da API em português. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Chave da API inválida. Confira em Configurações › API.";
  if (err instanceof Anthropic.PermissionDeniedError) return "A chave não tem permissão para esse modelo.";
  if (err instanceof Anthropic.RateLimitError) return "Limite de uso da API atingido. Espere um pouco e tente de novo.";
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance/i.test(err.message)) return "Sem créditos na conta da API (console.anthropic.com › Billing).";
    return `A API recusou o pedido: ${err.message}`;
  }
  if (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500) return "A API da Anthropic está instável. Tente de novo.";
  if (err instanceof Anthropic.APIConnectionError) return "Não foi possível falar com a API da Anthropic.";
  if (err instanceof AgentError) return err.message;
  return "Algo deu errado no assistente.";
}

export async function runAgent(opts: {
  apiKey: string;
  model: AiModel;
  userId: string;
  messages: Msg[];
  signal: AbortSignal;
  emit: (e: AgentEvent) => void;
  /** Chamado a cada rodada completa (resposta + resultados), para salvar. */
  onStep: (messages: Msg[]) => Promise<void>;
  /** Pode ler a pasta Pessoal. */
  allowPrivate?: boolean;
}) {
  const { model, userId, signal, emit, onStep } = opts;
  const client = new Anthropic({ apiKey: opts.apiKey, maxRetries: 2 });
  const messages = [...opts.messages];
  // Recusa por segurança: a API refaz o pedido em outro modelo (Opus e Sonnet).
  const fallback = model !== "claude-haiku-5-5";

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal.aborted) return;
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: 64000,
        system: SYSTEM,
        tools: [...NOTE_TOOLS, ...WEB_TOOLS],
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "medium" },
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );

    stream.on("streamEvent", (ev) => {
      if (ev.type === "content_block_start") {
        const b = ev.content_block;
        if (b.type === "tool_use" || b.type === "server_tool_use") emit({ t: "tool", id: b.id, name: b.name });
      } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        emit({ t: "text", d: ev.delta.text });
      }
    });

    const message = await stream.finalMessage();
    messages.push({ role: "assistant", content: message.content as Anthropic.Beta.BetaContentBlockParam[] });

    for (const b of message.content) {
      if (b.type === "server_tool_use") emit({ t: "tool_input", id: b.id, input: b.input as Record<string, unknown> });
    }

    if (message.stop_reason === "refusal") {
      await onStep(messages);
      emit({ t: "notice", message: "O modelo preferiu não responder a esse pedido." });
      return;
    }
    if (message.stop_reason === "pause_turn") {
      await onStep(messages);
      continue;
    }

    const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (uses.length === 0 || message.stop_reason !== "tool_use") {
      if (message.stop_reason === "max_tokens") emit({ t: "notice", message: "A resposta ficou longa demais e foi cortada." });
      await onStep(messages);
      return;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const input = (use.input && typeof use.input === "object" ? use.input : {}) as Record<string, unknown>;
      emit({ t: "tool_input", id: use.id, input });
      const out = await runNoteTool(userId, use.name, input, { allowPrivate: opts.allowPrivate });
      emit({ t: "tool_done", id: use.id, error: out.isError, changed: out.changed, created: out.created });
      results.push({ type: "tool_result", tool_use_id: use.id, content: out.content, is_error: out.isError || undefined });
    }
    messages.push({ role: "user", content: results });
    await onStep(messages);
  }
  emit({ t: "notice", message: "Parei depois de muitas etapas. Peça para continuar se precisar." });
}
