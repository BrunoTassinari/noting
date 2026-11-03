"use server";

import Anthropic from "@anthropic-ai/sdk";
import { type DisplayItem, toDisplay } from "@/lib/ai-display";
import { requireUser } from "@/lib/session";
import { type ChatMeta, deleteChat, getChat, listChats } from "@/server/ai/chats";
import { type AiSettingsView, getAiSettings, saveAiSettings } from "@/server/ai/config";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

export async function listChatsAction(): Promise<Result<{ chats: ChatMeta[] }>> {
  const user = await requireUser();
  return { ok: true, chats: await listChats(user.id) };
}

export async function loadChatAction(id: string): Promise<Result<{ id: string; title: string; items: DisplayItem[] }>> {
  const user = await requireUser();
  const chat = await getChat(user.id, id);
  if (!chat) return { ok: false, error: "Conversa não encontrada." };
  return { ok: true, id: chat.id, title: chat.title, items: toDisplay(chat.messages) };
}

export async function deleteChatAction(id: string): Promise<Result<object>> {
  const user = await requireUser();
  await deleteChat(user.id, id);
  return { ok: true };
}

export async function loadAiSettingsAction(): Promise<Result<{ settings: AiSettingsView }>> {
  const user = await requireUser();
  return { ok: true, settings: await getAiSettings(user.id) };
}

/**
 * Salva a chave (testada antes numa chamada barata) e o modelo.
 * `apiKey`: nova chave, "" para remover, undefined para manter.
 */
export async function saveAiSettingsAction(input: {
  apiKey?: string;
  model?: string;
}): Promise<Result<{ settings: AiSettingsView }>> {
  const user = await requireUser();
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : undefined;
  if (apiKey) {
    if (!/^sk-ant-[\w-]{20,}$/.test(apiKey)) return { ok: false, error: "Isso não parece uma chave da API (começa com sk-ant-)." };
    try {
      await new Anthropic({ apiKey, maxRetries: 1 }).models.list({ limit: 1 });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) return { ok: false, error: "Chave inválida." };
      if (err instanceof Anthropic.APIError) return { ok: false, error: `A API respondeu com erro: ${err.message}` };
      return { ok: false, error: "Não foi possível testar a chave agora." };
    }
  }
  try {
    await saveAiSettings(user.id, { apiKey, model: input.model });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar." };
  }
  return { ok: true, settings: await getAiSettings(user.id) };
}
