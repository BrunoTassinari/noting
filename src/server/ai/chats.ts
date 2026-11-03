import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiChats } from "@/db/schema";
import { isUuid } from "@/lib/note-paths";

export type ChatMeta = { id: string; title: string; updatedAt: string };
export type ChatFull = ChatMeta & { messages: unknown[] };

const MAX_CHATS_LISTED = 100;

export async function listChats(userId: string): Promise<ChatMeta[]> {
  const rows = await db
    .select({ id: aiChats.id, title: aiChats.title, updatedAt: aiChats.updatedAt })
    .from(aiChats)
    .where(eq(aiChats.userId, userId))
    .orderBy(desc(aiChats.updatedAt))
    .limit(MAX_CHATS_LISTED);
  return rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }));
}

export async function getChat(userId: string, id: string): Promise<ChatFull | null> {
  if (!isUuid(id)) return null;
  const [r] = await db
    .select()
    .from(aiChats)
    .where(and(eq(aiChats.userId, userId), eq(aiChats.id, id)));
  return r ? { id: r.id, title: r.title, updatedAt: r.updatedAt.toISOString(), messages: r.messages } : null;
}

export async function createChat(userId: string, title: string, messages: unknown[]): Promise<string> {
  const [r] = await db.insert(aiChats).values({ userId, title, messages }).returning({ id: aiChats.id });
  return r.id;
}

export async function saveChatMessages(userId: string, id: string, messages: unknown[]): Promise<void> {
  await db
    .update(aiChats)
    .set({ messages })
    .where(and(eq(aiChats.userId, userId), eq(aiChats.id, id)));
}

export async function deleteChat(userId: string, id: string): Promise<void> {
  if (!isUuid(id)) return;
  await db.delete(aiChats).where(and(eq(aiChats.userId, userId), eq(aiChats.id, id)));
}
