import "server-only";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { type DbLike } from "@/db/link-index";
import { notes } from "@/db/schema";
import {
  addDays,
  addMonths,
  BACKLOG,
  DAILY_FOLDER,
  type Day,
  dayFromDaily,
  firstOfMonth,
  isoDay,
  MONTHLY_FOLDER,
  monthFromMonthly,
  type NoteRef,
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
import { mentionersOf, rebuildLinks } from "./links";
import { NoteError } from "./notes";

// Migração de tarefas do Bullet Journal no servidor. Tudo em transação:
// as notas envolvidas ficam travadas (FOR UPDATE) enquanto mudam.

/** Quantos dias para trás a tela de migração olha (pela data no nome). */
export const MIGRATION_WINDOW_DAYS = 60;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** getOrCreateNote dentro da transação. */
async function getOrCreateIn(tx: DbLike, userId: string, ref: NoteRef, template: string): Promise<string> {
  const inserted = await tx
    .insert(notes)
    .values({ userId, path: ref.path, title: ref.title, body: template })
    .onConflictDoNothing()
    .returning({ id: notes.id });
  if (inserted[0]) {
    await rebuildLinks(tx, userId, [inserted[0].id, ...(await mentionersOf(tx, userId, ref.title))]);
    return inserted[0].id;
  }
  const [row] = await tx
    .select({ id: notes.id })
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.path, ref.path), eq(notes.title, ref.title)));
  return row.id;
}

/** Corpos das notas, travados até o fim da transação. */
async function lockBodies(tx: Tx, userId: string, ids: string[]): Promise<Map<string, string>> {
  const rows = await tx
    .select({ id: notes.id, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), inArray(notes.id, [...new Set(ids)])))
    .orderBy(notes.id) // ordem fixa: evita deadlock entre duas migrações
    .for("update");
  return new Map(rows.map((r) => [r.id, r.body]));
}

async function saveBodies(tx: Tx, userId: string, changed: Map<string, string>) {
  for (const [id, body] of changed) {
    await tx.update(notes).set({ body }).where(and(eq(notes.userId, userId), eq(notes.id, id)));
  }
  await rebuildLinks(tx, userId, [...changed.keys()]);
}

export type DestinationNote = { id: string; title: string };

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
  const spec = destinationSpec(dest, today);
  return db.transaction(async (tx) => {
    const id = await getOrCreateIn(tx, userId, spec.ref, spec.template);
    if (id === originId) throw new NoteError("A tarefa já está nesta nota.");
    const body = (await lockBodies(tx, userId, [id])).get(id)!;
    await saveBodies(tx, userId, new Map([[id, spec.insert(body, lines)]]));
    return { id, title: spec.ref.title };
  });
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
export async function listMigration(userId: string, today: Day): Promise<MigrationSource[]> {
  const rows = await db
    .select({ id: notes.id, path: notes.path, title: notes.title, body: notes.body })
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        or(eq(notes.path, DAILY_FOLDER), eq(notes.path, MONTHLY_FOLDER)),
        like(notes.body, "%[ ]%"),
      ),
    );
  const cutoff = addDays(today, -MIGRATION_WINDOW_DAYS);
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
): Promise<string[]> {
  if (items.length === 0) return [];
  return db.transaction(async (tx) => {
    const dests = [...new Set(items.map((i) => i.action))].filter(
      (a): a is Destination => a !== "done" && a !== "cancel",
    );
    const destIds = new Map<Destination, string>();
    for (const d of dests) {
      const spec = destinationSpec(d, today);
      destIds.set(d, await getOrCreateIn(tx, userId, spec.ref, spec.template));
    }
    const bodies = await lockBodies(tx, userId, [...items.map((i) => i.noteId), ...destIds.values()]);

    const lines = new Map<string, string[]>();
    const adds = new Map<Destination, string[]>();
    const seen = new Set<string>();
    for (const item of items) {
      const key = `${item.noteId}:${item.line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const body = bodies.get(item.noteId);
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
      const body = changed.get(id) ?? bodies.get(id)!;
      changed.set(id, destinationSpec(d, today).insert(body, add));
    }
    await saveBodies(tx, userId, changed);
    return [...changed.keys()];
  });
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

export async function getBacklog(userId: string): Promise<Backlog> {
  const row = await backlogRow(userId);
  if (!row) return { noteId: null, groups: [], resolved: 0 };
  return { noteId: row.id, groups: backlogGroups(row.body), resolved: cleanResolved(row.body).removed };
}

/** Puxa itens das Pendências: [>] lá, "- [ ] texto" no destino. */
export async function pullFromBacklog(
  userId: string,
  today: Day,
  items: { line: number; raw: string }[],
  dest: Destination,
): Promise<string[]> {
  const row = await backlogRow(userId);
  if (!row) throw new NoteError("As Pendências ainda não existem.");
  return migrateTasks(
    userId,
    today,
    items.map((i) => ({ ...i, noteId: row.id, action: dest })),
    { pullState: ">" },
  );
}

/** Tira das Pendências as linhas resolvidas ([x], [-], [>], [<]). */
export async function cleanBacklog(userId: string): Promise<{ noteId: string | null; removed: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: notes.id, body: notes.body })
      .from(notes)
      .where(and(eq(notes.userId, userId), eq(notes.path, BACKLOG.path), eq(notes.title, BACKLOG.title)))
      .for("update");
    if (!row) return { noteId: null, removed: 0 };
    const { body, removed } = cleanResolved(row.body);
    if (removed > 0) await saveBodies(tx, userId, new Map([[row.id, body]]));
    return { noteId: row.id, removed };
  });
}
