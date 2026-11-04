import type Anthropic from "@anthropic-ai/sdk";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { DATE_CONTEXT_TAG, NOTE_CONTEXT_TAG } from "@/lib/ai-display";
import { auth } from "@/lib/auth";
import { WEEKDAYS } from "@/lib/bujo";
import { type AgentEvent, apiErrorMessage, runAgent } from "@/server/ai/agent";
import { createChat, getChat, saveChatMessages } from "@/server/ai/chats";
import { getAiConfig, getAllowPrivate } from "@/server/ai/config";
import { isPrivatePath } from "@/lib/promote";
import { getNote } from "@/server/notes";

// POST /api/assistant: manda uma mensagem ao assistente e devolve a resposta
// em streaming (uma linha JSON por evento). Route Handler (e não Server
// Action) por causa do streaming.

export const maxDuration = 300;

type Msg = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;

type Attachment =
  | { kind: "image"; name: string; mediaType: string; data: string }
  | { kind: "pdf"; name: string; data: string }
  | { kind: "text"; name: string; text: string };

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_TEXT = 20_000;
const MAX_NOTE = 200_000;

function attachmentBlock(a: Attachment): Block | null {
  const name = String(a.name ?? "arquivo").slice(0, 200);
  if (a.kind === "image" && IMAGE_TYPES.has(a.mediaType) && typeof a.data === "string") {
    return { type: "image", source: { type: "base64", media_type: a.mediaType as "image/png", data: a.data } };
  }
  if (a.kind === "pdf" && typeof a.data === "string") {
    return { type: "document", title: name, source: { type: "base64", media_type: "application/pdf", data: a.data } };
  }
  if (a.kind === "text" && typeof a.text === "string") {
    return { type: "document", title: name, source: { type: "text", media_type: "text/plain", data: a.text } };
  }
  return null;
}

function dateContext(tz: string | undefined): string {
  let now = new Date();
  try {
    if (tz) now = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  } catch {
    // fuso inválido: usa o do servidor
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `${DATE_CONTEXT_TAG}Hoje é ${WEEKDAYS[now.getDay()]}, ${iso}, ${pad(now.getHours())}:${pad(now.getMinutes())}.</contexto>`;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const userId = session.user.id;

  const body = (await request.json().catch(() => null)) as {
    chatId?: string;
    text?: string;
    noteId?: string;
    attachments?: Attachment[];
    tz?: string;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  const files = Array.isArray(body?.attachments) ? body.attachments.slice(0, 10) : [];
  if (!text && files.length === 0) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });

  const config = await getAiConfig(userId);
  if (!config) {
    return NextResponse.json(
      { error: "Configure a chave da API da Anthropic em Configurações › API." },
      { status: 400 },
    );
  }

  let history: Msg[] = [];
  let chatId: string | null = null;
  let title = (text || files[0]?.name || "Conversa").replace(/\s+/g, " ").slice(0, 80);
  if (body?.chatId) {
    const chat = await getChat(userId, body.chatId);
    if (!chat) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    history = chat.messages as Msg[];
    chatId = chat.id;
    title = chat.title;
  }

  // Mensagem: anexos, nota aberta, data e o texto (por último).
  const content: Block[] = [];
  for (const f of files) {
    const b = attachmentBlock(f);
    if (b) content.push(b);
  }
  const allowPrivate = await getAllowPrivate(userId);
  if (body?.noteId) {
    const note = await getNote(userId, body.noteId);
    if (note && (allowPrivate || !isPrivatePath(note.path))) {
      const where = note.path ? `${note.path}/${note.title}` : note.title;
      content.push({
        type: "text",
        text: `${NOTE_CONTEXT_TAG} caminho="${where.replace(/"/g, "'")}">\n${note.body.slice(0, MAX_NOTE)}\n</nota_aberta>`,
      });
    }
  }
  content.push({ type: "text", text: dateContext(body?.tz) });
  content.push({ type: "text", text: text || "Veja o anexo." });

  const messages: Msg[] = [...history, { role: "user", content }];
  if (chatId) await saveChatMessages(userId, chatId, messages);
  else chatId = await createChat(userId, title, messages);
  const id = chatId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: AgentEvent | { t: "chat"; id: string; title: string } | { t: "done" } | { t: "error"; message: string }) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      send({ t: "chat", id, title });
      try {
        await runAgent({
          ...config,
          userId,
          messages,
          signal: request.signal,
          allowPrivate,
          emit: send,
          onStep: (m) => saveChatMessages(userId, id, m),
        });
        send({ t: "done" });
      } catch (err) {
        if (!request.signal.aborted) {
          console.error(err);
          send({ t: "error", message: apiErrorMessage(err) });
        }
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // já fechado
        }
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
