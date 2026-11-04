import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { addDays, dailyRef, type Day, isoDay, parseDay, weeklyRef } from "@/lib/bujo";
import { sha256Hex } from "@/lib/hash";
import { resolveWikilink, type NoteMeta } from "@/lib/note-paths";
import { isPrivatePath } from "@/lib/promote";
import { createNote, getNote, listNotes, NoteError, updateNoteBody } from "../notes";
import { searchNotes } from "../search";

// Ferramentas que o assistente usa para ver e mexer nas notas da pessoa.
// Tudo passa pelas mesmas funções do app (filtradas por userId).

type Tool = Anthropic.Beta.BetaTool;

const MAX_BODY = 120_000; // caracteres de uma nota devolvidos ao modelo
const MAX_PERIOD_DAYS = 62;

const noteParam = {
  type: "string",
  description: 'Nota: título ("Dom Casmurro") ou caminho com título ("Conhecimento/Fichamentos/Dom Casmurro"), como num [[link]].',
} as const;

export const NOTE_TOOLS: Tool[] = [
  {
    name: "search_notes",
    description:
      "Busca notas por palavras no título e no conteúdo (sem diferenciar acentos). Devolve até 20 notas com um trecho. Use para achar notas sobre um assunto.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Palavras a buscar." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "list_notes",
    description:
      "Lista notas (caminho/título e data da última alteração), mais recentes primeiro. Filtre por pasta (inclui subpastas) e/ou por alteração a partir de uma data.",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", description: 'Pasta, ex.: "Conhecimento/Fichamentos". Vazio = todas.' },
        changed_since: { type: "string", description: "Data AAAA-MM-DD: só notas alteradas a partir dela." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_note",
    description: "Lê o conteúdo completo (Markdown) de uma nota.",
    input_schema: {
      type: "object",
      properties: { note: noteParam },
      required: ["note"],
      additionalProperties: false,
    },
  },
  {
    name: "read_journal",
    description:
      "Lê as notas diárias do Bullet Journal de um período (e as semanais que caem nele). Use para resumos de semana ou mês.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Primeiro dia, AAAA-MM-DD." },
        to: { type: "string", description: "Último dia, AAAA-MM-DD (até 62 dias depois de from)." },
      },
      required: ["from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "create_note",
    description:
      "Cria uma nota nova. Só use quando a pessoa pedir para criar ou salvar algo. Se já existir uma nota com o título na pasta, o título ganha um número.",
    input_schema: {
      type: "object",
      properties: {
        folder: { type: "string", description: 'Pasta, ex.: "Conhecimento". Vazio = raiz.' },
        title: { type: "string", description: "Título (nome do arquivo, sem .md)." },
        content: { type: "string", description: "Conteúdo em Markdown." },
      },
      required: ["folder", "title", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "append_to_note",
    description: "Acrescenta texto ao fim de uma nota existente. Só use quando a pessoa pedir.",
    input_schema: {
      type: "object",
      properties: { note: noteParam, content: { type: "string", description: "Markdown a acrescentar." } },
      required: ["note", "content"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_note",
    description:
      "Troca um trecho exato de uma nota por outro. Leia a nota antes; old_text precisa aparecer uma única vez, igual (espaços e quebras de linha incluídos). Só use quando a pessoa pedir.",
    input_schema: {
      type: "object",
      properties: {
        note: noteParam,
        old_text: { type: "string", description: "Trecho atual, exato." },
        new_text: { type: "string", description: "Texto que entra no lugar." },
      },
      required: ["note", "old_text", "new_text"],
      additionalProperties: false,
    },
  },
];

export const WRITE_TOOLS = new Set(["create_note", "append_to_note", "edit_note"]);

export type ToolOutcome = {
  /** Texto devolvido ao modelo. */
  content: string;
  isError?: boolean;
  /** Notas alteradas (o app recarrega) e nota de referência (para o link). */
  changed?: string[];
  created?: boolean;
  noteId?: string;
};

const fail = (content: string): ToolOutcome => ({ content, isError: true });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const fullName = (n: NoteMeta) => (n.path ? `${n.path}/${n.title}` : n.title);

function findNote(all: NoteMeta[], ref: string): NoteMeta | ToolOutcome {
  const target = ref.trim().replace(/^\[\[|\]\]$/g, "");
  if (!target) return fail("Informe a nota.");
  const hit = resolveWikilink(all, target);
  if (hit) return hit;
  const lower = target.toLowerCase();
  const near = all.filter((n) => n.title.toLowerCase().includes(lower)).slice(0, 8);
  return fail(
    `Nota "${target}" não encontrada.` +
      (near.length ? ` Parecidas: ${near.map(fullName).join("; ")}.` : " Use search_notes para procurar."),
  );
}

const isOutcome = (x: NoteMeta | ToolOutcome): x is ToolOutcome => "content" in x;

function clip(body: string) {
  return body.length > MAX_BODY ? `${body.slice(0, MAX_BODY)}\n\n[… nota cortada: ${body.length} caracteres no total]` : body;
}

async function readByRefs(userId: string, refs: { path: string; title: string }[]) {
  if (refs.length === 0) return [];
  const titles = [...new Set(refs.map((r) => r.title))];
  return db
    .select({ path: notes.path, title: notes.title, body: notes.body })
    .from(notes)
    .where(and(eq(notes.userId, userId), inArray(notes.title, titles)));
}

/** Grava `next` só se o corpo não mudou desde `before` (outro aparelho). */
async function save(userId: string, note: NoteMeta, before: string, next: string): Promise<ToolOutcome | null> {
  const res = await updateNoteBody(userId, note.id, next, { baseHash: (await sha256Hex(before))! });
  if (!res.ok) return fail("A nota mudou enquanto eu editava. Leia de novo e tente outra vez.");
  return null;
}

const PRIVATE_MSG =
  "Essa nota está na pasta Pessoal, que é privada: o Claude não tem acesso (a pessoa pode liberar em Configurações › Conector Claude).";

export async function runNoteTool(
  userId: string,
  name: string,
  input: Record<string, unknown>,
  opts: { allowPrivate?: boolean } = {},
): Promise<ToolOutcome> {
  const visible = (path: string) => opts.allowPrivate || !isPrivatePath(path);
  /** Acha a nota; privada (sem permissão) = erro explicando. */
  const find = async (ref: string) => {
    const hit = findNote(await listNotes(userId), ref);
    if (!isOutcome(hit) && !visible(hit.path)) return fail(PRIVATE_MSG);
    return hit;
  };
  try {
    switch (name) {
      case "search_notes": {
        const results = (await searchNotes(userId, str(input.query), 40)).filter((r) => visible(r.path)).slice(0, 20);
        if (results.length === 0) return { content: "Nenhuma nota encontrada." };
        return {
          content: results
            .map((r) => `- ${r.path ? `${r.path}/` : ""}${r.title}${r.snippet ? `: ${r.snippet}` : ""}`)
            .join("\n"),
        };
      }

      case "list_notes": {
        const folder = str(input.folder).trim().replace(/^\/+|\/+$/g, "").toLowerCase();
        const since = input.changed_since ? parseDay(str(input.changed_since)) : null;
        let list = (await listNotes(userId)).filter(
          (n) => visible(n.path) && (!folder || n.path.toLowerCase() === folder || n.path.toLowerCase().startsWith(`${folder}/`)),
        );
        if (since) list = list.filter((n) => new Date(n.updatedAt) >= since);
        list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        if (list.length === 0) return { content: "Nenhuma nota." };
        const shown = list.slice(0, 300);
        return {
          content:
            shown.map((n) => `- ${fullName(n)} (alterada ${n.updatedAt.slice(0, 10)})`).join("\n") +
            (list.length > shown.length ? `\n[… mais ${list.length - shown.length} notas; filtre por pasta]` : ""),
        };
      }

      case "read_note": {
        const hit = await find(str(input.note));
        if (isOutcome(hit)) return hit;
        const note = await getNote(userId, hit.id);
        if (!note) return fail("Nota não encontrada.");
        return {
          content: `# ${fullName(note)} (alterada ${note.updatedAt.slice(0, 10)})\n\n${clip(note.body) || "(nota vazia)"}`,
          noteId: note.id,
        };
      }

      case "read_journal": {
        const from = parseDay(str(input.from));
        const to = parseDay(str(input.to));
        if (!from || !to || to < from) return fail("Datas inválidas (use AAAA-MM-DD, from ≤ to).");
        const days: Day[] = [];
        for (let d = from; d <= to && days.length < MAX_PERIOD_DAYS; d = addDays(d, 1)) days.push(d);
        const daily = days.map(dailyRef);
        const weekly = [...new Map(days.map((d) => weeklyRef(d)).map((r) => [r.title, r])).values()];
        const rows = await readByRefs(userId, [...weekly, ...daily]);
        const body = (ref: { path: string; title: string }) =>
          rows.find((r) => r.path === ref.path && r.title === ref.title)?.body;
        const parts: string[] = [];
        for (const w of weekly) {
          const b = body(w);
          if (b?.trim()) parts.push(`## Semana ${w.title}\n\n${clip(b)}`);
        }
        days.forEach((d, i) => {
          const b = body(daily[i]);
          if (b?.trim()) parts.push(`## Dia ${isoDay(d)}\n\n${clip(b)}`);
        });
        if (parts.length === 0) return { content: "Nenhuma nota diária nesse período." };
        const missing = days.length - days.filter((_, i) => body(daily[i])?.trim()).length;
        return {
          content: parts.join("\n\n---\n\n") + (missing ? `\n\n[${missing} dia(s) sem nota]` : ""),
        };
      }

      case "create_note": {
        const content = str(input.content);
        if (!visible(str(input.folder))) return fail(PRIVATE_MSG);
        const meta = await createNote(userId, { path: str(input.folder), title: str(input.title) });
        if (content) await updateNoteBody(userId, meta.id, content);
        return {
          content: `Nota criada: [[${fullName(meta)}]]`,
          changed: [meta.id],
          created: true,
          noteId: meta.id,
        };
      }

      case "append_to_note": {
        const hit = await find(str(input.note));
        if (isOutcome(hit)) return hit;
        const note = await getNote(userId, hit.id);
        if (!note) return fail("Nota não encontrada.");
        const add = str(input.content).replace(/^\n+/, "");
        if (!add.trim()) return fail("Nada para acrescentar.");
        const sep = !note.body ? "" : note.body.endsWith("\n\n") ? "" : note.body.endsWith("\n") ? "\n" : "\n\n";
        const err = await save(userId, note, note.body, note.body + sep + add);
        if (err) return err;
        return { content: `Texto acrescentado em [[${fullName(note)}]].`, changed: [note.id], noteId: note.id };
      }

      case "edit_note": {
        const hit = await find(str(input.note));
        if (isOutcome(hit)) return hit;
        const note = await getNote(userId, hit.id);
        if (!note) return fail("Nota não encontrada.");
        const oldText = str(input.old_text);
        if (!oldText) return fail("old_text vazio.");
        const first = note.body.indexOf(oldText);
        if (first < 0) return fail("old_text não aparece na nota. Leia a nota de novo e copie o trecho exato.");
        if (note.body.indexOf(oldText, first + 1) >= 0)
          return fail("old_text aparece mais de uma vez. Inclua mais texto em volta para ficar único.");
        const next = note.body.slice(0, first) + str(input.new_text) + note.body.slice(first + oldText.length);
        const err = await save(userId, note, note.body, next);
        if (err) return err;
        return { content: `Nota [[${fullName(note)}]] editada.`, changed: [note.id], noteId: note.id };
      }

      default:
        return fail(`Ferramenta desconhecida: ${name}`);
    }
  } catch (err) {
    if (err instanceof NoteError) return fail(err.message);
    console.error(err);
    return fail("Erro ao executar a ferramenta.");
  }
}
