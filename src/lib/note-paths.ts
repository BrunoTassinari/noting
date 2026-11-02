// Regras de caminho das notas, compartilhadas entre cliente e servidor.
//
//   path  = pasta da nota, segmentos separados por '/', sem barras nas
//           pontas ('' = raiz). Ex.: 'Projetos/app-notas'
//   title = nome da nota, sem '/'.

export const MAX_TITLE_LENGTH = 200;
export const MAX_PATH_LENGTH = 500;
export const DEFAULT_TITLE = "Sem título";

export type NoteMeta = {
  id: string;
  path: string;
  title: string;
  updatedAt: string; // ISO
};

/** Normaliza uma pasta digitada: tira espaços e barras sobrando. */
export function normalizeFolder(input: string): string {
  return input
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/");
}

export function validateFolder(input: string): { value: string } | { error: string } {
  const value = normalizeFolder(input);
  if (value.length > MAX_PATH_LENGTH) {
    return { error: "Caminho da pasta muito longo." };
  }
  return { value };
}

export function validateTitle(input: string): { value: string } | { error: string } {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return { error: "O nome não pode ficar vazio." };
  if (value.includes("/")) return { error: "O nome não pode conter “/”." };
  if (value.length > MAX_TITLE_LENGTH) return { error: "Nome muito longo." };
  return { value };
}

/** 'Projetos/app-notas' → ['Projetos', 'app-notas'] */
export function folderSegments(path: string): string[] {
  return path ? path.split("/") : [];
}

/** Pasta pai: 'a/b' → 'a'; 'a' → ''. */
export function parentFolder(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function folderName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

/** Texto para exibir uma pasta: 'Projetos / app-notas' ou 'Raiz'. */
export function displayFolder(path: string): string {
  return path ? folderSegments(path).join(" / ") : "Raiz";
}

const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export type FolderNode = {
  name: string;
  path: string;
  folders: FolderNode[];
  notes: NoteMeta[];
};

/** Monta a árvore de pastas a partir do campo path de cada nota. */
export function buildTree(notes: NoteMeta[]): FolderNode {
  const root: FolderNode = { name: "", path: "", folders: [], notes: [] };
  const byPath = new Map<string, FolderNode>([["", root]]);

  const ensure = (path: string): FolderNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const parent = ensure(parentFolder(path));
    const node: FolderNode = { name: folderName(path), path, folders: [], notes: [] };
    parent.folders.push(node);
    byPath.set(path, node);
    return node;
  };

  for (const note of notes) ensure(note.path).notes.push(note);

  const sort = (node: FolderNode) => {
    node.folders.sort((a, b) => collator.compare(a.name, b.name));
    node.notes.sort((a, b) => collator.compare(a.title, b.title));
    node.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/** Todas as pastas existentes (inclui ancestrais), ordenadas. */
export function listFolders(notes: NoteMeta[]): string[] {
  const set = new Set<string>();
  for (const { path } of notes) {
    let p = path;
    while (p) {
      set.add(p);
      p = parentFolder(p);
    }
  }
  return [...set].sort(collator.compare);
}

/** Pastas ancestrais de uma pasta, incluindo ela: 'a/b' → ['a', 'a/b']. */
export function ancestorFolders(path: string): string[] {
  const segs = folderSegments(path);
  return segs.map((_, i) => segs.slice(0, i + 1).join("/"));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

/** Primeiro título livre: "Sem título", "Sem título 2", ... */
export function nextFreeTitle(taken: Iterable<string>, base = DEFAULT_TITLE): string {
  const set = new Set(taken);
  if (!set.has(base)) return base;
  for (let n = 2; ; n++) {
    if (!set.has(`${base} ${n}`)) return `${base} ${n}`;
  }
}

/**
 * Resolve o alvo de um [[link]] para uma nota, como o Obsidian:
 *   [[Nota]], [[Pasta/Nota]], [[Nota#Seção]], [[Nota|apelido]].
 * Sem caminho, prefere a nota da mesma pasta de quem linka.
 */
export function resolveWikilink<T extends NoteMeta>(
  notes: T[],
  rawTarget: string,
  fromPath = "",
): T | null {
  const target = rawTarget.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
  if (!target) return null;
  const lower = target.toLowerCase();

  if (target.includes("/")) {
    const path = normalizeFolder(parentFolder(target)).toLowerCase();
    const title = folderName(target).toLowerCase();
    return notes.find((n) => n.path.toLowerCase() === path && n.title.toLowerCase() === title) ?? null;
  }

  const matches = notes.filter((n) => n.title.toLowerCase() === lower);
  if (matches.length <= 1) return matches[0] ?? null;
  return (
    matches.find((n) => n.title === target && n.path === fromPath) ??
    matches.find((n) => n.path === fromPath) ??
    matches.find((n) => n.title === target) ??
    [...matches].sort((a, b) => a.path.length - b.path.length)[0]
  );
}

/** Título usado para criar a nota de um [[link]] ainda inexistente. */
export function wikilinkTitle(rawTarget: string): string {
  const target = rawTarget.split("|")[0].split("#")[0].trim().replace(/\.md$/i, "");
  return folderName(target);
}
