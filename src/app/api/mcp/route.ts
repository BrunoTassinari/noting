import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { WEEKDAYS } from "@/lib/bujo";
import { userForConnectorToken } from "@/server/ai/connector";
import { runNoteTool } from "@/server/ai/tools";

// Conector MCP: o app do Claude (claude.ai, celular, desktop, Claude Code)
// usa as notas por aqui, com a assinatura da pessoa (sem API paga).
// Autenticação: "Authorization: Bearer noting_…" ou "?token=noting_…".
// Sem estado: cada pedido monta o servidor de novo (serverless).

export const maxDuration = 60;

const INSTRUCTIONS = `Notas da pessoa no Noting (vault em Markdown no estilo Obsidian, com Bullet Journal).
- Bullet Journal/Daily/AAAA.MM.DD: nota de cada dia; Bullet Journal/Weekly/AAAA.Wnn e Bullet Journal/Monthly/AAAA.mês.
- Bullet Journal/Pendências, Bullet Journal/Future Log, Bullet Journal/Listas/… (livros, filmes…). Fichamentos em Conhecimento/Fichamentos.
- Tarefas: "- [ ]" aberta, "- [x]" feita, "- [/]" em andamento, "- [>]" migrada, "- [<]" agendada, "- [-]" cancelada, "- [o]" evento. Emojis: ❗ importante, 💼 trabalho, 💡 ideia, 🔔 lembrança, 🌱 hábito.
Use as ferramentas sempre que a pergunta depender do que está escrito; não invente conteúdo que não leu. Para resumos de período use read_journal (today dá a data de hoje). Só crie ou altere notas quando a pessoa pedir; antes de editar, leia a nota. Links entre notas: [[Título]]. Modelos de nota ficam em Templates/ (variáveis {{title}}, {{date}}, {{time}}): ao criar uma nota de um tipo que tem template, siga o template.`;

const note = z.string().describe('Título ("Dom Casmurro") ou caminho com título ("Conhecimento/Fichamentos/Dom Casmurro").');
const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

function buildServer(userId: string) {
  const server = new McpServer({ name: "noting", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const call = (name: string) => async (input: Record<string, unknown>) => {
    const out = await runNoteTool(userId, name, input);
    return { content: [{ type: "text" as const, text: out.content }], isError: out.isError };
  };

  server.registerTool(
    "today",
    { title: "Data de hoje", description: "Data e dia da semana de hoje (fuso de São Paulo).", annotations: READ },
    async () => {
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const pad = (n: number) => String(n).padStart(2, "0");
      const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      return { content: [{ type: "text", text: `Hoje é ${WEEKDAYS[now.getDay()]}, ${iso}.` }] };
    },
  );
  server.registerTool(
    "search_notes",
    {
      title: "Buscar notas",
      description: "Busca notas por palavras no título e no conteúdo (sem diferenciar acentos). Devolve até 20 notas com um trecho.",
      inputSchema: { query: z.string().describe("Palavras a buscar.") },
      annotations: READ,
    },
    call("search_notes"),
  );
  server.registerTool(
    "list_notes",
    {
      title: "Listar notas",
      description: "Lista notas (caminho/título e data da última alteração), mais recentes primeiro. Filtre por pasta (inclui subpastas) e/ou por alteração a partir de uma data.",
      inputSchema: {
        folder: z.string().optional().describe('Pasta, ex.: "Conhecimento/Fichamentos".'),
        changed_since: z.string().optional().describe("Data AAAA-MM-DD."),
      },
      annotations: READ,
    },
    call("list_notes"),
  );
  server.registerTool(
    "read_note",
    { title: "Ler nota", description: "Lê o conteúdo completo (Markdown) de uma nota.", inputSchema: { note }, annotations: READ },
    call("read_note"),
  );
  server.registerTool(
    "read_journal",
    {
      title: "Ler o diário",
      description: "Lê as notas diárias do Bullet Journal de um período (e as semanais que caem nele). Para resumos de semana ou mês.",
      inputSchema: {
        from: z.string().describe("Primeiro dia, AAAA-MM-DD."),
        to: z.string().describe("Último dia, AAAA-MM-DD (até 62 dias depois de from)."),
      },
      annotations: READ,
    },
    call("read_journal"),
  );
  server.registerTool(
    "create_note",
    {
      title: "Criar nota",
      description: "Cria uma nota nova. Só quando a pessoa pedir. Se o título já existir na pasta, ganha um número.",
      inputSchema: {
        folder: z.string().describe('Pasta, ex.: "Conhecimento". Vazio = raiz.'),
        title: z.string().describe("Título (sem .md)."),
        content: z.string().describe("Conteúdo em Markdown."),
      },
      annotations: WRITE,
    },
    call("create_note"),
  );
  server.registerTool(
    "append_to_note",
    {
      title: "Acrescentar em nota",
      description: "Acrescenta texto ao fim de uma nota existente. Só quando a pessoa pedir.",
      inputSchema: { note, content: z.string().describe("Markdown a acrescentar.") },
      annotations: WRITE,
    },
    call("append_to_note"),
  );
  server.registerTool(
    "edit_note",
    {
      title: "Editar nota",
      description:
        "Troca um trecho exato de uma nota por outro. Leia a nota antes; old_text precisa aparecer uma única vez, igual. Só quando a pessoa pedir.",
      inputSchema: {
        note,
        old_text: z.string().describe("Trecho atual, exato."),
        new_text: z.string().describe("Texto que entra no lugar."),
      },
      annotations: { ...WRITE, destructiveHint: true },
    },
    call("edit_note"),
  );
  return server;
}

function tokenOf(request: Request): string {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  return m?.[1] ?? new URL(request.url).searchParams.get("token") ?? "";
}

async function handle(request: Request): Promise<Response> {
  const userId = await userForConnectorToken(tokenOf(request));
  if (!userId) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Token do Noting ausente ou inválido." }, id: null },
      { status: 401 },
    );
  }
  const server = buildServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
