"use server";

import { refresh } from "next/cache";
import { type Day, parseDay } from "@/lib/bujo";
import {
  type DayData,
  isMediaKind,
  isScalarKey,
  MEDIA_HEADING,
  mediaLine,
  MEMORABLE_HEADING,
  memorableLine,
  normalizeValue,
  oneLine,
} from "@/lib/bujo-data";
import { requireUser } from "@/lib/session";
import { appendToMonth, setDayHabit, setDayValue } from "@/server/bujo-data";
import { NoteError } from "@/server/notes";

// Ações do Bullet Journal que gravam em notas que não estão abertas no
// editor: frontmatter das notas diárias (tabela de hábitos) e as seções da
// nota do mês (linha "Registrar" do formulário do dia).

export type BujoResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_TEXT = 2_000;

function dayOf(iso: unknown): Day {
  const d = typeof iso === "string" ? parseDay(iso) : null;
  if (!d) throw new NoteError("Data inválida.");
  return d;
}

function textOf(s: unknown, field: string, required: boolean): string {
  if (s === undefined || s === null) s = "";
  if (typeof s !== "string" || s.length > MAX_TEXT) throw new NoteError(`${field} inválido.`);
  const t = oneLine(s);
  if (required && !t) throw new NoteError(`Preencha ${field.toLowerCase()}.`);
  return t;
}

async function run<T extends { created: boolean }>(fn: (userId: string) => Promise<T>): Promise<BujoResult<T>> {
  const user = await requireUser();
  let value: T;
  try {
    value = await fn(user.id);
  } catch (err) {
    if (err instanceof NoteError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Algo deu errado. Tente de novo." };
  }
  // Nota nova: a árvore muda. Só o conteúdo mudou: nada a atualizar.
  if (value.created) refresh();
  return { ok: true, ...value };
}

type DayWriteResult = BujoResult<{ id: string; created: boolean; data: DayData }>;

/** Grava (ou apaga, com null) humor/stress/clima/temperatura/cardio do dia. */
export async function setDayValueAction(isoDate: string, key: string, value: string | null): Promise<DayWriteResult> {
  return run(async (userId) => {
    const d = dayOf(isoDate);
    if (!isScalarKey(key)) throw new NoteError("Campo inválido.");
    if (value !== null && (typeof value !== "string" || value.length > 50)) throw new NoteError("Valor inválido.");
    const v = normalizeValue(key, value);
    if (v === undefined) throw new NoteError("Valor inválido.");
    return setDayValue(userId, d, key, v);
  });
}

/** Marca (on) ou desmarca um hábito no dia. */
export async function setDayHabitAction(isoDate: string, habit: string, on: boolean): Promise<DayWriteResult> {
  return run(async (userId) => {
    const d = dayOf(isoDate);
    const h = textOf(habit, "Hábito", true);
    if (h.length > 200) throw new NoteError("Hábito inválido.");
    return setDayHabit(userId, d, h, on === true);
  });
}

/** "Dia memorável": linha em "## Dias memoráveis" da nota do mês. */
export async function addMemorableDayAction(
  isoDate: string,
  text: string,
): Promise<BujoResult<{ id: string; created: boolean }>> {
  return run(async (userId) => {
    const d = dayOf(isoDate);
    const t = textOf(text, "Texto", true);
    return appendToMonth(userId, d, MEMORABLE_HEADING, memorableLine(d, t));
  });
}

/** "Série / filme / livro": linha em "## O que vi e li" da nota do mês. */
export async function addMediaAction(
  isoDate: string,
  entry: { kind: string; title: string; stars?: number | null; ongoing?: boolean; comment?: string },
): Promise<BujoResult<{ id: string; created: boolean }>> {
  return run(async (userId) => {
    const d = dayOf(isoDate);
    if (typeof entry !== "object" || entry === null || !isMediaKind(entry.kind)) {
      throw new NoteError("Tipo inválido.");
    }
    const title = textOf(entry.title, "Título", true);
    const comment = textOf(entry.comment, "Comentário", false);
    const stars = entry.stars ?? null;
    if (stars !== null && !(Number.isInteger(stars) && stars >= 1 && stars <= 5)) {
      throw new NoteError("Estrelas inválidas.");
    }
    const line = mediaLine({ kind: entry.kind, title, stars, ongoing: entry.ongoing === true, comment });
    return appendToMonth(userId, d, MEDIA_HEADING, line);
  });
}
