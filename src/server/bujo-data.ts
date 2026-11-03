import "server-only";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import {
  dailyRef,
  dailyTemplate,
  DAILY_FOLDER,
  type Day,
  day,
  monthlyRef,
  monthlyTemplate,
  type NoteRef,
} from "@/lib/bujo";
import {
  appendToSection,
  asList,
  dayData,
  type DayData,
  type MonthData,
  parseHabitsBlock,
  parseMonth,
  type ScalarKey,
} from "@/lib/bujo-data";
import { type FmValue, readFrontmatter, setFrontmatterKey } from "@/lib/frontmatter";
import { sha256Hex } from "@/lib/hash";
import { getOrCreateNote, pullFutureLogIntoMonth } from "./bujo";
import { NoteError, updateNoteBody } from "./notes";
import { getHabits } from "./settings";

// Leitura e gravação dos dados do Bullet Journal em notas que NÃO estão
// abertas no editor (as diárias do mês, a nota do mês). A nota aberta é
// alterada no próprio editor; o autosave dela detecta conflito por hash.

export async function getMonthData(userId: string, month: string): Promise<MonthData> {
  const ym = parseMonth(month);
  if (!ym) throw new NoteError("Mês inválido.");
  const prefix = `${ym.y}.${String(ym.m).padStart(2, "0")}.`;
  const monthRef = monthlyRef(day(ym.y, ym.m, 1));
  const habitsPromise = getHabits(userId); // em paralelo com as notas
  const [daily, monthly] = await Promise.all([
    db
      .select({ id: notes.id, title: notes.title, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, DAILY_FOLDER), like(notes.title, `${prefix}%`))),
    db
      .select({ body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, monthRef.path), eq(notes.title, monthRef.title))),
  ]);

  const days: MonthData["days"] = {};
  for (const n of daily) {
    const m = /^\d{4}\.\d{2}\.(\d{2})$/.exec(n.title);
    if (!m) continue;
    days[+m[1]] = { ...dayData(readFrontmatter(n.body)), id: n.id };
  }

  const fallback = await habitsPromise;
  let habits = fallback;
  const body = monthly[0]?.body ?? "";
  const block = new RegExp("^```bujo-habits[ \\t]*\\n([\\s\\S]*?)^```[ \\t]*$", "gm");
  for (let r = block.exec(body); r; r = block.exec(body)) {
    const parsed = parseHabitsBlock(r[1], fallback);
    if (parsed.month === null || parsed.month === month) {
      habits = parsed.habits;
      if (parsed.month === month) break;
    }
  }
  return { month, days, habits };
}

/**
 * Edita o corpo de uma nota fora do editor, criando-a com o modelo se não
 * existir. Se a nota mudar no meio (outro aparelho/aba), lê de novo e tenta
 * outra vez; `edit` devolve null quando não há nada a mudar.
 */
async function editNote(
  userId: string,
  ref: NoteRef,
  template: string,
  edit: (body: string) => string | null,
  opts: { relink: boolean; onCreate?: (note: { id: string; body: string }) => Promise<void> },
): Promise<{ id: string; body: string; created: boolean }> {
  let created = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    let note = await getOrCreateNote(userId, ref, template);
    if (note.created) {
      created = true;
      if (opts.onCreate) {
        await opts.onCreate(note);
        note = await getOrCreateNote(userId, ref, template); // corpo depois do onCreate
      }
    }
    const next = edit(note.body);
    if (next === null || next === note.body) return { id: note.id, body: note.body, created };
    const baseHash = (await sha256Hex(note.body)) ?? undefined;
    const res = await updateNoteBody(userId, note.id, next, { relink: opts.relink, baseHash });
    if (res.ok) return { id: note.id, body: next, created };
  }
  throw new NoteError("A nota mudou enquanto era salva. Tente de novo.");
}

function setKeyIn(body: string, key: string, value: FmValue | null): string | null {
  const change = setFrontmatterKey(body, key, value);
  if (!change) return null;
  return body.slice(0, change.from) + change.insert + body.slice(change.to);
}

export type DayWrite = { id: string; created: boolean; data: DayData };

const dailyResult = (r: { id: string; body: string; created: boolean }): DayWrite => ({
  id: r.id,
  created: r.created,
  data: dayData(readFrontmatter(r.body)),
});

/** Grava (ou apaga, com null) uma chave de valor único no frontmatter do dia. */
export async function setDayValue(userId: string, d: Day, key: ScalarKey, value: string | null): Promise<DayWrite> {
  const r = await editNote(userId, dailyRef(d), dailyTemplate(d), (body) => setKeyIn(body, key, value), {
    relink: false,
  });
  return dailyResult(r);
}

/** Marca/desmarca um hábito na lista `habitos` do dia. */
export async function setDayHabit(userId: string, d: Day, habit: string, on: boolean): Promise<DayWrite> {
  const r = await editNote(
    userId,
    dailyRef(d),
    dailyTemplate(d),
    (body) => {
      const list = asList(readFrontmatter(body).habitos);
      const has = list.includes(habit);
      if (has === on) return null;
      const next = on ? [...list, habit] : list.filter((h) => h !== habit);
      return setKeyIn(body, "habitos", next.length ? next : null);
    },
    { relink: false },
  );
  return dailyResult(r);
}

/** Acrescenta `line` ao fim da seção `heading` da nota do mês de `d`. */
export async function appendToMonth(
  userId: string,
  d: Day,
  heading: string,
  line: string,
): Promise<{ id: string; created: boolean }> {
  const r = await editNote(
    userId,
    monthlyRef(d),
    monthlyTemplate(d, await getHabits(userId)),
    (body) => appendToSection(body, heading, line),
    // Nota do mês nova: traz as tarefas do Future Log, como ao abrir pelo menu.
    { relink: true, onCreate: (note) => pullFutureLogIntoMonth(userId, note, d) },
  );
  return { id: r.id, created: r.created };
}
