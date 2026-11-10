import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { type Day, type NoteRef, periodicNote, type PeriodicKind } from "@/lib/bujo";
import { fillPeriodic, PERIODIC_TEMPLATE_TITLE } from "@/lib/periodic-templates";
import { TEMPLATES_FOLDER } from "@/lib/templates";

/**
 * Caminho e modelo da nota do dia/semana/mês: usa "Templates/Nota do dia"
 * (etc.) se a pessoa criou; senão, o modelo padrão do app.
 */
export async function periodicNoteFor(
  userId: string,
  kind: PeriodicKind,
  d: Day,
  habits: string[] = [],
): Promise<{ ref: NoteRef; template: string }> {
  const base = periodicNote(kind, d, habits);
  const [row] = await db
    .select({ body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.path, TEMPLATES_FOLDER), eq(notes.title, PERIODIC_TEMPLATE_TITLE[kind])))
    .limit(1);
  if (!row || !row.body.trim()) return base;
  return { ref: base.ref, template: fillPeriodic(row.body, kind, d, habits) };
}
