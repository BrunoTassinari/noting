// Converte o histórico salvo (formato da API da Anthropic) no que a conversa
// mostra: mensagens da pessoa (texto e anexos) e respostas do assistente
// (texto e as ações nas notas). Usado no servidor e no navegador.

export type ToolPart = {
  type: "tool";
  id: string;
  name: string;
  input?: Record<string, unknown>;
  status: "running" | "done" | "error";
};
export type AssistantPart = { type: "text"; text: string } | ToolPart;

export type DisplayItem =
  | { role: "user"; text: string; files: string[]; note?: string }
  | { role: "assistant"; parts: AssistantPart[] };

/** Prefixo do bloco com a nota aberta (para não mostrá-lo como texto). */
export const NOTE_CONTEXT_TAG = "<nota_aberta";
export const DATE_CONTEXT_TAG = "<contexto>";

type Block = { type?: string; [k: string]: unknown };

const blocks = (content: unknown): Block[] =>
  typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? (content as Block[]) : [];

export function toDisplay(messages: unknown[]): DisplayItem[] {
  const out: DisplayItem[] = [];
  const tools = new Map<string, ToolPart>();

  for (const raw of messages) {
    const m = raw as { role?: string; content?: unknown };
    const content = blocks(m.content);

    if (m.role === "user") {
      const results = content.filter((b) => b.type === "tool_result");
      for (const r of results) {
        const t = tools.get(String(r.tool_use_id));
        if (t) t.status = r.is_error ? "error" : "done";
      }
      if (results.length === content.length && results.length > 0) continue; // só resultados

      let text = "";
      let note: string | undefined;
      const files: string[] = [];
      for (const b of content) {
        if (b.type === "text") {
          const t = String(b.text ?? "");
          if (t.startsWith(NOTE_CONTEXT_TAG)) note = /caminho="([^"]*)"/.exec(t)?.[1] ?? "nota";
          else if (!t.startsWith(DATE_CONTEXT_TAG)) text = text ? `${text}\n\n${t}` : t;
        } else if (b.type === "image") files.push(String(b.title ?? "imagem"));
        else if (b.type === "document") files.push(String(b.title ?? "arquivo"));
      }
      out.push({ role: "user", text, files, note });
      continue;
    }

    if (m.role === "assistant") {
      let last = out[out.length - 1];
      if (!last || last.role !== "assistant") {
        last = { role: "assistant", parts: [] };
        out.push(last);
      }
      for (const b of content) {
        if (b.type === "text" && b.text) {
          last.parts.push({ type: "text", text: String(b.text) });
        } else if (b.type === "tool_use" || b.type === "server_tool_use") {
          const part: ToolPart = {
            type: "tool",
            id: String(b.id),
            name: String(b.name),
            input: (b.input ?? {}) as Record<string, unknown>,
            status: b.type === "server_tool_use" ? "done" : "running",
          };
          tools.set(part.id, part);
          last.parts.push(part);
        } else if (b.type === "web_search_tool_result") {
          const t = tools.get(String(b.tool_use_id));
          const c = b.content as { type?: string } | undefined;
          if (t && c && !Array.isArray(c) && c.type?.endsWith("error")) t.status = "error";
        }
      }
    }
  }
  // Ação sem resultado = conversa interrompida no meio.
  for (const t of tools.values()) if (t.status === "running") t.status = "error";
  return out;
}

const s = (v: unknown) => (typeof v === "string" ? v : "");
const ddmm = (iso: string) => (/^\d{4}-(\d{2})-(\d{2})$/.exec(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

/** Texto curto da ação e a nota envolvida (para virar link). */
export function toolLabel(name: string, input: Record<string, unknown> = {}): { verb: string; target?: string; detail?: string } {
  switch (name) {
    case "search_notes":
      return { verb: "Buscou", detail: `“${s(input.query)}”` };
    case "list_notes":
      return { verb: "Listou as notas", detail: s(input.folder) ? `em ${s(input.folder)}` : undefined };
    case "read_note":
      return { verb: "Leu", target: s(input.note) };
    case "read_journal":
      return { verb: "Leu o diário", detail: `de ${ddmm(s(input.from))} a ${ddmm(s(input.to))}` };
    case "create_note":
      return { verb: "Criou", target: [s(input.folder), s(input.title)].filter(Boolean).join("/") };
    case "append_to_note":
      return { verb: "Acrescentou em", target: s(input.note) };
    case "edit_note":
      return { verb: "Editou", target: s(input.note) };
    case "web_search":
      return { verb: "Pesquisou na web", detail: `“${s(input.query)}”` };
    case "web_fetch":
      return { verb: "Abriu", detail: s(input.url) };
    default:
      return { verb: name };
  }
}

/** Disparado pelas Configurações ao salvar a chave ou o modelo. */
export const AI_SETTINGS_EVENT = "noting-ai-settings";
