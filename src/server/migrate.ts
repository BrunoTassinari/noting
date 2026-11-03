import "server-only";
import { getHabits } from "./settings";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import {
  addDays,
  addMonths,
  BACKLOG,
  DAILY_FOLDER,
  dailyRef,
  type Day,
  dayFromDaily,
  firstOfMonth,
  isoDay,
  MONTHLY_FOLDER,
  monthFromMonthly,
} from "@/lib/bujo";
import {
  backlogGroups,
  type BacklogGroup,
  classifyLine,
  cleanResolved,
  destinationSpec,
  type Destination,
  destLineForTask,
  openTasks,
  type OpenTask,
  setTaskState,
} from "@/lib/migrate";
import { getOrCreateNote } from "./bujo";
import { NoteError, saveBodiesIfUnchanged } from "./notes";

// Migração de tarefas do Bullet Journal no servidor. Lê as notas envolvidas,
// calcula e grava tudo de uma vez só se nenhuma mudou no meio (hash do corpo,
// ver saveBodiesIfUnchanged); se mudou, relê e confere de novo. Poucas idas
// ao banco, que pode estar longe.

/** Quantos dias para trás a tela de migração olha (pela data no nome). */
export const MIGRATION_WINDOW_DAYS = 60;

/** Tentativas quando uma nota muda entre a leitura e a gravação. */
const ATTEMPTS = 3;

/** `created`: a nota de destino não existia (a árvore de notas muda). */
export type DestinationNote = { id: string; title: string; created: boolean };

/**
 * Grava `lines` no destino (nota criada com o modelo se faltar). A origem
 * NÃO é alterada aqui: está aberta no editor, que marca [>] e salva.
 */
export async function writeToDestination(
  userId: string,
  originId: string,
  dest: Destination,
  today: Day,
  lines: string[],
): Promise<DestinationNote> {
  if (lines.length === 0) throw new NoteError("Nada para migrar.");
  const spec = destinationSpec(dest, today, dest === "month" ? await getHabits(userId) : []);
  let created = false;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const note = await getOrCreateNote(userId, spec.ref, spec.template);
    created ||= note.created;
    if (note.id === originId) throw new NoteError("A tarefa já está nesta nota.");
    const after = spec.insert(note.body, lines);
    if (await saveBodiesIfUnchanged(userId, [{ id: note.id, path: spec.ref.path, before: note.body, after }])) {
      return { id: note.id, title: spec.ref.title, created };
    }
  }
  throw new NoteError("A nota de destino mudou enquanto era salva. Tente de novo.");
}

// ---------- Tela de migração ----------

export type MigrationSource = {
  noteId: string;
  title: string;
  kind: "day" | "month";
  /** Data da nota (dia, ou 1º do mês), "2026-10-30". */
  date: string;
  tasks: OpenTask[];
};

/** Tarefas abertas de dias passados e meses anteriores (janela de 60 dias). */
/**
 * `edited`: corpos finais de uma migração que corre ao mesmo tempo. A leitura
 * não espera a gravação (uma ida ao banco a menos); as notas alteradas usam o
 * corpo devolvido por ela. Notas de destino (hoje, amanhã, mês atual…) nunca
 * estão na janela, então não falta nenhuma.
 */
export async function listMigration(
  userId: string,
  today: Day,
  edited?: Promise<Record<string, string>>,
): Promise<MigrationSource[]> {
  const cutoff = addDays(today, -MIGRATION_WINDOW_DAYS);
  // Só as diárias da janela vêm do banco (o nome "2026.11.02" ordena como a
  // data), e não o corpo de um ano inteiro de notas.
  const dailyInWindow = and(
    eq(notes.path, DAILY_FOLDER),
    sql`${notes.title} collate "C" >= ${dailyRef(cutoff).title}`,
    sql`${notes.title} collate "C" < ${dailyRef(today).title}`,
  );
  const [read, bodies] = await Promise.all([
    db
      .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body })
      .from(notes)
      .where(
        and(
          eq(notes.userId, userId),
          or(dailyInWindow, eq(notes.path, MONTHLY_FOLDER)),
          like(notes.body, "%[ ]%"),
        ),
      ),
    edited,
  ]);
  const rows = bodies ? read.map((r) => (r.id in bodies ? { ...r, body: bodies[r.id] } : r)) : read;
  const thisMonth = firstOfMonth(today);
  const out: MigrationSource[] = [];
  for (const r of rows) {
    const d = dayFromDaily(r);
    const m = monthFromMonthly(r);
    const inWindow = d
      ? d < today && d >= cutoff
      : m
        ? m < thisMonth && addMonths(m, 1) > cutoff
        : false;
    if (!inWindow) continue;
    const tasks = openTasks(r.body);
    if (tasks.length === 0) continue;
    out.push({ noteId: r.id, title: r.title, kind: d ? "day" : "month", date: isoDay((d ?? m)!), tasks });
  }
  // Mais recentes primeiro; no mesmo mês, os dias antes do mês.
  return out.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === "day" ? -1 : 1));
}

export type MigrationAction = Destination | "done" | "cancel";

/** Notas alteradas e se alguma nota de destino foi criada. */
export type MigrationOutcome = {
  changed: string[];
  created: boolean;
  /** Corpo final de cada nota alterada (para remontar as telas sem reler). */
  bodies: Record<string, string>;
};

export type MigrationItem = { noteId: string; line: number; raw: string; action: MigrationAction };

const CONFLICT =
  "Uma das tarefas mudou desde que a lista foi carregada (editada em outro lugar). Atualize a lista e tente de novo.";

/**
 * Migra/conclui/cancela tarefas, identificadas por (nota, linha, texto da
 * linha). Se alguma linha mudou, nada é gravado. Só a linha vai para o
 * destino (sem subitens). `pullState`: estado que a origem recebe em vez do
 * padrão (as Pendências marcam sempre [>]).
 */
export async function migrateTasks(
  userId: string,
  today: Day,
  items: MigrationItem[],
  opts: { pullState?: ">" } = {},
): Promise<MigrationOutcome> {
  if (items.length === 0) return { changed: [], created: false, bodies: {} };
  const dests = [...new Set(items.map((i) => i.action))].filter(
    (a): a is Destination => a !== "done" && a !== "cancel",
  );
  const sourceIds = [...new Set(items.map((i) => i.noteId))];
  const habits = dests.includes("month") ? await getHabits(userId) : [];
  let created = false;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Uma ida ao banco: destinos (criados se faltarem) e origens em paralelo.
    const [destNotes, sources] = await Promise.all([
      Promise.all(
        dests.map((d) => {
          const spec = destinationSpec(d, today, habits);
          return getOrCreateNote(userId, spec.ref, spec.template);
        }),
      ),
      db
        .select({ id: notes.id, path: notes.path, body: notes.body })
        .from(notes)
        .where(and(eq(notes.userId, userId), inArray(notes.id, sourceIds))),
    ]);
    const destIds = new Map<Destination, string>();
    const bodies = new Map(sources.map((r) => [r.id, { path: r.path, body: r.body }]));
    dests.forEach((d, i) => {
      destIds.set(d, destNotes[i].id);
      created ||= destNotes[i].created;
      if (!bodies.has(destNotes[i].id)) {
        bodies.set(destNotes[i].id, { path: destinationSpec(d, today).ref.path, body: destNotes[i].body });
      }
    });

    const lines = new Map<string, string[]>();
    const adds = new Map<Destination, string[]>();
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.noteId}:${item.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const body = bodies.get(item.noteId)?.body;
      if (body === undefined) throw new NoteError("Nota não encontrada.");
      if (!lines.has(item.noteId)) lines.set(item.noteId, body.split("\n"));
      const src = lines.get(item.noteId)!;
      const info = classifyLine(item.raw);
      if (src[item.line] !== item.raw || info.kind !== "task" || info.state !== " ") {
        throw new NoteError(CONFLICT);
      }
      if (item.action === "done" || item.action === "cancel") {
        src[item.line] = setTaskState(item.raw, item.action === "done" ? "x" : "-")!;
        continue;
      }
      if (destIds.get(item.action) === item.noteId) throw new NoteError("A tarefa já está nesta nota.");
      const spec = destinationSpec(item.action, today);
      src[item.line] = setTaskState(item.raw, opts.pullState ?? (spec.scheduled ? "<" : ">"))!;
      adds.set(item.action, [...(adds.get(item.action) ?? []), destLineForTask(item.raw)!]);
    }

    const changed = new Map<string, string>();
    for (const [id, l] of lines) changed.set(id, l.join("\n"));
    for (const [d, add] of adds) {
      const id = destIds.get(d)!;
      const body = changed.get(id) ?? bodies.get(id)!.body;
      changed.set(id, destinationSpec(d, today).insert(body, add));
    }
    // Tudo ou nada; se alguma nota mudou no meio, relê e confere de novo.
    const ok = await saveBodiesIfUnchanged(
      userId,
      [...changed].map(([id, after]) => ({ id, path: bodies.get(id)!.path, before: bodies.get(id)!.body, after })),
    );
    if (ok) return { changed: [...changed.keys()], created, bodies: Object.fromEntries(changed) };
  }
  throw new NoteError(CONFLICT);
}

// ---------- Pendências ----------

export type Backlog = { noteId: string | null; groups: BacklogGroup[]; resolved: number };

async function backlogRow(userId: string) {
  const [row] = await db
    .select({ id: notes.id, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.path, BACKLOG.path), eq(notes.title, BACKLOG.title)));
  return row ?? null;
}

const backlogOf = (id: string, body: string): Backlog => ({
  noteId: id,
  groups: backlogGroups(body),
  resolved: cleanResolved(body).removed,
});

export async function getBacklog(userId: string): Promise<Backlog> {
  const row = await backlogRow(userId);
  if (!row) return { noteId: null, groups: [], resolved: 0 };
  return backlogOf(row.id, row.body);
}

/** Puxa itens das Pendências: [>] lá, "- [ ] texto" no destino. */
export async function pullFromBacklog(
  userId: string,
  today: Day,
  items: { line: number; raw: string }[],
  dest: Destination,
): Promise<MigrationOutcome & { backlog: Backlog }> {
  const row = await backlogRow(userId);
  if (!row) throw new NoteError("As Pendências ainda não existem.");
  const res = await migrateTasks(
    userId,
    today,
    items.map((i) => ({ ...i, noteId: row.id, action: dest })),
    { pullState: ">" },
  );
  // As Pendências como ficaram, sem reler do banco.
  return { ...res, backlog: backlogOf(row.id, res.bodies[row.id] ?? row.body) };
}

/** Tira das Pendências as linhas resolvidas ([x], [-], [>], [<]). */
export async function cleanBacklog(
  userId: string,
): Promise<{ noteId: string | null; removed: number; backlog: Backlog }> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const row = await backlogRow(userId);
    if (!row) return { noteId: null, removed: 0, backlog: { noteId: null, groups: [], resolved: 0 } };
    const { body, removed } = cleanResolved(row.body);
    if (
      removed === 0 ||
      (await saveBodiesIfUnchanged(userId, [{ id: row.id, path: BACKLOG.path, before: row.body, after: body }]))
    ) {
      return { noteId: row.id, removed, backlog: backlogOf(row.id, body) };
    }
  }
  throw new NoteError(CONFLICT);
}
