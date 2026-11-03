import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { captures, notes } from "@/db/schema";
import { dailyRef, dailyTemplate, parseDay } from "@/lib/bujo";
import { appendCaptures, type CaptureInput } from "@/lib/capture";
import { getOrCreateNote } from "./bujo";
import { sameWikilinkTargets } from "@/lib/wikilinks";
import { rebuildLinks } from "./links";

export type CaptureResult = { id: string; day: string; status: "added" | "duplicate" };

/** Ids guardados por este tempo: bem mais que qualquer fila offline real. */
const KEEP_IDS_DAYS = 90;

/**
 * Acrescenta as capturas no fim das notas diárias dos seus dias (criando a
 * nota com o modelo se faltar). Idempotente: um id já aplicado é ignorado.
 * Cada dia é uma transação: registra os ids e grava o corpo juntos.
 */
export async function applyCaptures(userId: string, input: CaptureInput[]): Promise<CaptureResult[]> {
  const byDay = new Map<string, CaptureInput[]>();
  for (const c of input) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);

  const results: CaptureResult[] = [];
  for (const [isoDay, items] of byDay) {
    const d = parseDay(isoDay)!;
    const note = await getOrCreateNote(userId, dailyRef(d), dailyTemplate(d));
    const added = await db.transaction(async (tx) => {
      const ids = await tx
        .insert(captures)
        .values(items.map((c) => ({ id: c.id, userId })))
        .onConflictDoNothing()
        .returning({ id: captures.id });
      const fresh = new Set(ids.map((r) => r.id));
      const texts = items.filter((c) => fresh.has(c.id)).map((c) => c.text);
      if (texts.length > 0) {
        // Trava a linha: outro salvamento no meio não perde a captura.
        const [row] = await tx
          .select({ body: notes.body })
          .from(notes)
          .where(and(eq(notes.userId, userId), eq(notes.id, note.id)))
          .for("update");
        if (!row) throw new Error("Nota diária sumiu durante a captura.");
        const body = appendCaptures(row.body, texts);
        await tx
          .update(notes)
          .set({ body })
          .where(and(eq(notes.userId, userId), eq(notes.id, note.id)));
        if (!sameWikilinkTargets(row.body, body)) {
          await rebuildLinks(tx, userId, [note.id], [{ id: note.id, path: dailyRef(d).path, body }]);
        }
      }
      return fresh;
    });
    for (const c of items) results.push({ id: c.id, day: isoDay, status: added.has(c.id) ? "added" : "duplicate" });
  }

  await db
    .delete(captures)
    .where(and(eq(captures.userId, userId), lt(captures.createdAt, sql`now() - make_interval(days => ${KEEP_IDS_DAYS})`)));
  return results;
}
