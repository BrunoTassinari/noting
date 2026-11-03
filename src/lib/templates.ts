import { MONTHS, WEEKDAYS } from "./bujo";
import type { NoteMeta } from "./note-paths";

// Templates: notas da pasta "Templates". Ao usar, as variáveis (no formato do
// Obsidian) são trocadas: {{title}}, {{date}}, {{time}} e {{date:DD/MM/YYYY}}.

export const TEMPLATES_FOLDER = "Templates";

export const isTemplate = (n: { path: string }) =>
  n.path === TEMPLATES_FOLDER || n.path.startsWith(`${TEMPLATES_FOLDER}/`);

export function listTemplates<T extends NoteMeta>(notes: T[]): T[] {
  return notes.filter(isTemplate).sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Formato estilo moment: YYYY, YY, MMMM, MM, M, DD, D, dddd, ddd, HH, mm, ss. */
export function formatDate(d: Date, format: string): string {
  const tokens: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MMMM: MONTHS[d.getMonth()],
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    dddd: WEEKDAYS[d.getDay()],
    ddd: WEEKDAYS[d.getDay()].slice(0, 3),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return format.replace(/\[([^\]]*)\]|YYYY|YY|MMMM|MM|M|DD|D|dddd|ddd|HH|mm|ss/g, (m, literal?: string) =>
    literal !== undefined ? literal : tokens[m],
  );
}

/** Troca as variáveis do template. */
export function fillTemplate(body: string, ctx: { title: string; now?: Date }): string {
  const now = ctx.now ?? new Date();
  return body.replace(/\{\{\s*(title|date|time)(?::([^}]*))?\s*\}\}/gi, (_m, name: string, fmt?: string) => {
    const key = name.toLowerCase();
    if (key === "title") return ctx.title;
    if (key === "time") return formatDate(now, fmt?.trim() || "HH:mm");
    return formatDate(now, fmt?.trim() || "YYYY-MM-DD");
  });
}
