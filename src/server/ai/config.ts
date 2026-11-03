import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";

// Configuração do assistente: chave da API da Anthropic e modelo, de cada
// pessoa (chave cifrada no banco). Não há chave do servidor: quem não salvou
// a própria chave não usa o assistente (ninguém gasta os tokens de outro).

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", hint: "Mais capaz · US$ 4 / 20 por milhão de tokens" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", hint: "Rápido e bom · US$ 2 / 10 por milhão" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", hint: "Mais barato · US$ 0,10 / 0,50 por milhão" },
] as const;
export type AiModel = (typeof AI_MODELS)[number]["id"];
export const DEFAULT_MODEL: AiModel = "claude-opus-5-5";

const isModel = (m: unknown): m is AiModel => AI_MODELS.some((x) => x.id === m);

function secretKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET não definido.");
  return createHash("sha256").update(`noting-ai-key:${secret}`).digest();
}

/** "iv.tag.dados" em base64url. */
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function decrypt(packed: string): string | null {
  try {
    const [iv, tag, data] = packed.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null; // segredo trocado: a pessoa salva a chave de novo
  }
}

export type AiSettingsView = {
  /** Fim da chave salva ("…a1B2"), ou null. */
  keyHint: string | null;
  model: AiModel;
};

async function row(userId: string) {
  const [r] = await db
    .select({ aiKey: userSettings.aiKey, aiModel: userSettings.aiModel })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return r;
}

export async function getAiSettings(userId: string): Promise<AiSettingsView> {
  const r = await row(userId);
  const key = r?.aiKey ? decrypt(r.aiKey) : null;
  return {
    keyHint: key ? `…${key.slice(-4)}` : null,
    model: isModel(r?.aiModel) ? r.aiModel : DEFAULT_MODEL,
  };
}

/** Chave e modelo para chamar a API (null = sem chave configurada). */
export async function getAiConfig(userId: string): Promise<{ apiKey: string; model: AiModel } | null> {
  const r = await row(userId);
  const apiKey = r?.aiKey ? decrypt(r.aiKey) : null;
  if (!apiKey) return null;
  return { apiKey, model: isModel(r?.aiModel) ? r.aiModel : DEFAULT_MODEL };
}

/** `apiKey`: string nova, "" para apagar, undefined para manter. */
export async function saveAiSettings(userId: string, input: { apiKey?: string; model?: unknown }) {
  const set: { aiKey?: string | null; aiModel?: string } = {};
  if (input.apiKey !== undefined) set.aiKey = input.apiKey ? encrypt(input.apiKey) : null;
  if (input.model !== undefined) {
    if (!isModel(input.model)) throw new Error("Modelo inválido.");
    set.aiModel = input.model;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .insert(userSettings)
    .values({ userId, ...set })
    .onConflictDoUpdate({ target: userSettings.userId, set });
}
