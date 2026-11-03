import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes, userSettings } from "@/db/schema";
import { type Day, monthlyRef } from "@/lib/bujo";
import { NoteError } from "./notes";
import { sha256Hex } from "@/lib/hash";
import { updateNoteBody } from "./notes";

export const MAX_HABITS = 30;
const MAX_HABIT_LENGTH = 40;

/** Hábitos da pessoa (lista vazia se nunca configurou). */
export async function getHabits(userId: string): Promise<string[]> {
  const [row] = await db
    .select({ habits: userSettings.habits })
    .from(userSettings)
    .where(eq(userSettings.userId, userId));
  return Array.isArray(row?.habits) ? row.habits : [];
}

/** Limpa a lista: sem vazios, sem repetidos, sem quebra de linha, tamanho máximo. */
export function cleanHabits(input: unknown): string[] {
  if (!Array.isArray(input)) throw new NoteError("Lista de hábitos inválida.");
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const h = raw.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    if (!h) continue;
    if (h.length > MAX_HABIT_LENGTH) throw new NoteError(`Nome de hábito muito longo: “${h.slice(0, 20)}…”.`);
    if (!out.some((x) => x.toLowerCase() === h.toLowerCase())) out.push(h);
  }
  if (out.length > MAX_HABITS) throw new NoteError(`No máximo ${MAX_HABITS} hábitos.`);
  return out;
}

export async function saveHabits(userId: string, habits: string[]): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, habits })
    .onConflictDoUpdate({ target: userSettings.userId, set: { habits } });
}

/** Troca a lista do bloco ```bujo-habits``` do mês (formato "month: AAAA-MM" + "- Hábito"). */
export function replaceHabitsBlock(body: string, month: string, habits: string[]): string | null {
  const re = /^```bujo-habits[ \t]*\n([\s\S]*?)^```[ \t]*$/gm;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const inner = m[1];
    const blockMonth = /^\s*month:\s*(\d{4}-\d{2})\s*$/m.exec(inner)?.[1] ?? null;
    if (blockMonth !== null && blockMonth !== month) continue;
    const next = ["```bujo-habits", `month: ${blockMonth ?? month}`, ...habits.map((h) => `- ${h}`), "```"].join("\n");
    return body.slice(0, m.index) + next + body.slice(m.index + m[0].length);
  }
  return null;
}

/**
 * Aplica a lista ao bloco de hábitos da nota do mês de `d`, se a nota existir.
 * Devolve o id da nota alterada (ou null).
 */
export async function applyHabitsToMonth(userId: string, d: Day, habits: string[]): Promise<string | null> {
  const ref = monthlyRef(d);
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await db
      .select({ id: notes.id, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, ref.path), eq(notes.title, ref.title)));
    if (!row) return null;
    const next = replaceHabitsBlock(row.body, month, habits);
    if (next === null || next === row.body) return null;
    const res = await updateNoteBody(userId, row.id, next, { relink: false, baseHash: (await sha256Hex(row.body))! });
    if (res.ok) return row.id;
  }
  throw new NoteError("A nota do mês mudou enquanto gravava. Tente de novo.");
}
