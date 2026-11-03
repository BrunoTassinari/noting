"use server";

import { revalidatePath } from "next/cache";
import { parseDay } from "@/lib/bujo";
import { requireUser } from "@/lib/session";
import { NoteError } from "@/server/notes";
import { applyHabitsToMonth, cleanHabits, saveHabits } from "@/server/settings";

export type SaveHabitsResult = { ok: true; habits: string[]; monthNoteId: string | null } | { ok: false; error: string };

/**
 * Salva a lista de hábitos da pessoa. `applyToMonthOf` ("2026-11-03", data
 * do navegador): também troca a lista do bloco de hábitos da nota desse mês.
 */
export async function saveHabitsAction(habits: unknown, applyToMonthOf?: string): Promise<SaveHabitsResult> {
  const user = await requireUser();
  try {
    const clean = cleanHabits(habits);
    await saveHabits(user.id, clean);
    const d = typeof applyToMonthOf === "string" ? parseDay(applyToMonthOf) : null;
    const monthNoteId = d ? await applyHabitsToMonth(user.id, d, clean) : null;
    revalidatePath("/", "layout"); // a lista chega ao app pelo layout
    return { ok: true, habits: clean, monthNoteId };
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Não foi possível salvar. Tente de novo." };
  }
}
