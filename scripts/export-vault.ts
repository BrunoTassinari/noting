/**
 * Exporta as notas do Noting para uma pasta de arquivos .md (o caminho
 * inverso do import-vault). Serve de backup e de saída para o Obsidian.
 *
 *   npm run export-vault -- <pasta-de-destino> [--email voce@exemplo.com] [--mirror]
 *
 * Opções:
 *   --email    dono das notas (pode omitir se houver um único usuário)
 *   --mirror   deixa a pasta igual ao app: apaga os .md que não existem mais
 *              no Noting (pastas e arquivos ocultos, como .git, nunca são
 *              tocados). Sem --mirror, só cria/atualiza.
 *
 * Regras:
 *   - nota "Nota" na pasta "a/b" → a/b/Nota.md, com o conteúdo exato
 *   - a data de modificação do arquivo é a da nota
 *   - só reescreve arquivos cujo conteúdo mudou
 *
 * Usa DATABASE_URL de .env.local (ou do ambiente).
 */
import { config } from "dotenv";
import { mkdir, readdir, readFile, rm, rmdir, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });

type Args = { dir: string; email: string; mirror: boolean };

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  let email = "";
  let mirror = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") email = argv[++i] ?? "";
    else if (a.startsWith("--email=")) email = a.slice(8);
    else if (a === "--mirror") mirror = true;
    else if (a.startsWith("--")) fail(`Opção desconhecida: ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1) {
    fail("Uso: npm run export-vault -- <pasta-de-destino> [--email voce@exemplo.com] [--mirror]");
  }
  return { dir: path.resolve(rest[0]), email: email.trim().toLowerCase(), mirror };
}

/** Segmento seguro como nome de pasta/arquivo (nada de "..", ocultos ou barras). */
const safeSegment = (s: string) => s !== "" && s !== "." && s !== ".." && !s.startsWith(".") && !/[\\\0]/.test(s);

/** Lista os .md existentes (relativos), ignorando o que é oculto. */
async function existingMd(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await visit(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        out.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  await visit(root);
  return out;
}

/** Remove pastas que ficaram vazias (sem contar as ocultas). */
async function pruneEmptyDirs(dir: string, root: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && !e.name.startsWith(".")) await pruneEmptyDirs(path.join(dir, e.name), root);
  }
  if (dir !== root && (await readdir(dir)).length === 0) await rmdir(dir);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { db } = await import("../src/db");
  const { notes, user } = await import("../src/db/schema");
  const { asc, eq } = await import("drizzle-orm");

  let ownerId: string;
  if (args.email) {
    const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, args.email));
    if (!owner) fail(`Nenhum usuário com o e-mail ${args.email}.`);
    ownerId = owner.id;
  } else {
    const users = await db.select({ id: user.id }).from(user).limit(2);
    if (users.length !== 1) fail("Há mais de um usuário (ou nenhum): informe --email.");
    ownerId = users[0].id;
  }

  const rows = await db
    .select({ path: notes.path, title: notes.title, body: notes.body, updatedAt: notes.updatedAt })
    .from(notes)
    .where(eq(notes.userId, ownerId))
    .orderBy(asc(notes.path), asc(notes.title));

  await mkdir(args.dir, { recursive: true });
  const written = new Set<string>();
  const problems: string[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const n of rows) {
    const segments = [...(n.path ? n.path.split("/") : []), `${n.title}.md`];
    const label = [n.path, n.title].filter(Boolean).join("/");
    if (!segments.every(safeSegment)) {
      problems.push(`${label}: nome não pode virar arquivo (começa com "." ou tem caractere inválido)`);
      continue;
    }
    const rel = segments.join("/");
    const relKey = rel.toLowerCase(); // Windows/macOS não diferenciam maiúsculas
    if (written.has(relKey)) {
      problems.push(`${label}: mesmo nome de outra nota ignorando maiúsculas`);
      continue;
    }
    written.add(relKey);

    const file = path.join(args.dir, ...segments);
    const current = await readFile(file, "utf8").catch(() => null);
    if (current === n.body) {
      unchanged++;
    } else {
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, n.body, "utf8");
      if (current === null) created++;
      else updated++;
    }
    const s = await stat(file);
    if (s.mtime.getTime() !== n.updatedAt.getTime()) await utimes(file, n.updatedAt, n.updatedAt);
  }

  let removed = 0;
  if (args.mirror) {
    for (const rel of await existingMd(args.dir)) {
      if (written.has(rel.toLowerCase())) continue;
      await rm(path.join(args.dir, ...rel.split("/")));
      removed++;
    }
    await pruneEmptyDirs(args.dir, args.dir);
  }

  console.log(`Destino: ${args.dir}`);
  console.log(`Notas: ${rows.length} (novas ${created}, atualizadas ${updated}, iguais ${unchanged})`);
  if (args.mirror) console.log(`Removidos (não existem mais no app): ${removed}`);
  if (problems.length) {
    console.log(`Não exportadas: ${problems.length}`);
    for (const p of problems) console.log(`  - ${p}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
