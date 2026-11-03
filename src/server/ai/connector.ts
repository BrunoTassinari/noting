import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";

// Token do conector MCP: o app do Claude (claude.ai, apps, Claude Code) manda
// esse token para ler e editar as notas da pessoa. Só o hash fica no banco;
// o token aparece uma vez, ao ser criado.

const PREFIX = "noting_";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function hasConnectorToken(userId: string): Promise<boolean> {
  const [r] = await db
    .select({ h: userSettings.mcpTokenHash })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return Boolean(r?.h);
}

/** Cria um token novo (o anterior para de valer) e devolve-o. */
export async function createConnectorToken(userId: string): Promise<string> {
  const token = PREFIX + randomBytes(32).toString("base64url");
  const set = { mcpTokenHash: hash(token) };
  await db.insert(userSettings).values({ userId, ...set }).onConflictDoUpdate({ target: userSettings.userId, set });
  return token;
}

export async function revokeConnectorToken(userId: string): Promise<void> {
  await db.update(userSettings).set({ mcpTokenHash: null }).where(eq(userSettings.userId, userId));
}

/** Dono do token, ou null. */
export async function userForConnectorToken(token: string): Promise<string | null> {
  if (!token.startsWith(PREFIX) || token.length > 200) return null;
  const [r] = await db
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.mcpTokenHash, hash(token)));
  return r?.userId ?? null;
}
