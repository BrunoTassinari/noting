// Reescrita de [[links]] quando uma nota é renomeada ou movida (como o
// Obsidian com "Atualizar links internos" ligado). Funções puras: o
// servidor passa as notas do usuário antes e depois da mudança.

import { type NoteMeta, resolveWikilink } from "./note-paths";
import { blankCode, WIKILINK_RE } from "./wikilinks";

type Ref = Pick<NoteMeta, "id" | "path" | "title" | "updatedAt">;

export type RelinkChange = {
  /** A nota mudou de lugar: notas com path/title antes e depois. */
  before: Ref[];
  after: Ref[];
  /** Nota renomeada/movida. */
  targetId: string;
  /** "rename": todo link que apontava para ela passa a usar o nome novo.
   *  "move": só muda link com pasta, ou que deixaria de resolver. */
  kind: "rename" | "move";
};

/** Caminho completo para um [[link]]: 'Pasta/Nota', ou '/Nota' na raiz. */
export function fullLinkPath(note: Pick<NoteMeta, "path" | "title">): string {
  return `${note.path}/${note.title}`;
}

/**
 * [[Título]] curto chega à nota sem ambiguidade? Só se o nome é único no
 * vault, ou se ela é a única com esse nome na pasta de quem linka. (Com
 * empate em outras pastas a resolução depende da ordem das notas.)
 */
function shortIsSafe(notes: Ref[], target: Ref, fromPath: string): boolean {
  const lower = target.title.toLowerCase();
  const same = notes.filter((n) => n.title.toLowerCase() === lower);
  if (same.length === 1) return same[0].id === target.id;
  const here = same.filter((n) => n.path === fromPath);
  return here.length === 1 && here[0].id === target.id;
}

/** Novo texto do alvo (sem #seção nem |apelido), ou null se não muda. */
function newTargetName(name: string, fromPath: string, change: RelinkChange): string | null {
  const target = change.after.find((n) => n.id === change.targetId);
  if (!target) return null;
  const ext = /\.md$/i.exec(name)?.[0] ?? "";
  const usedPath = name.includes("/");
  const resolvesShort = shortIsSafe(change.after, target, fromPath);

  let next: string;
  if (change.kind === "move" && !usedPath) {
    // [[Nota]] curto: continua igual se ainda chega à nota.
    if (resolvesShort) return null;
    next = fullLinkPath(target);
  } else if (usedPath) {
    next = fullLinkPath(target);
    // Foi para a raiz: [[Nota]] basta se não for ambíguo (senão, [[/Nota]]).
    if (!target.path && !name.startsWith("/") && resolvesShort) next = target.title;
  } else {
    next = resolvesShort ? target.title : fullLinkPath(target);
  }
  next += ext;
  return next === name ? null : next;
}

/**
 * Reescreve, no corpo de uma nota em `fromPath`, os [[links]] que
 * resolviam para a nota alterada. Preserva #seção, |apelido e espaços;
 * ignora trechos de código. Devolve o corpo novo e quantos links mudaram.
 */
export function rewriteLinks(
  body: string,
  fromPath: string,
  change: RelinkChange,
): { body: string; count: number } {
  const text = blankCode(body);
  let out = "";
  let last = 0;
  let count = 0;
  for (const m of text.matchAll(WIKILINK_RE)) {
    const raw = m[1];
    if (!raw.trim()) continue;
    if (resolveWikilink(change.before, raw, fromPath)?.id !== change.targetId) continue;

    // raw = "  Pasta/Nota#Seção " → troca só "Pasta/Nota".
    const hash = raw.indexOf("#");
    const namePart = hash === -1 ? raw : raw.slice(0, hash);
    const lead = namePart.length - namePart.trimStart().length;
    const name = namePart.trim();
    const next = newTargetName(name, fromPath, change);
    if (next === null) continue;

    const start = m.index + 2 + lead; // depois de "[[" e dos espaços
    out += body.slice(last, start) + next;
    last = start + name.length;
    count++;
  }
  if (count === 0) return { body, count: 0 };
  return { body: out + body.slice(last), count };
}
