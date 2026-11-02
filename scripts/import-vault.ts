/**
 * Importa um vault de arquivos .md (ex.: Obsidian) para o Noting.
 * Os arquivos originais não são modificados.
 *
 *   npm run import-vault -- <pasta-do-vault> --email voce@exemplo.com [opções]
 *
 * Opções:
 *   --dry-run     mostra o que seria importado, sem gravar nada
 *   --overwrite   se já existir nota com o mesmo nome na mesma pasta,
 *                 substitui o conteúdo (padrão: pula)
 *
 * Regras:
 *   - pasta/subpasta/Nota.md → nota "Nota" na pasta "pasta/subpasta"
 *   - ignora pastas e arquivos ocultos (.obsidian, .trash, .git...) e
 *     node_modules; arquivos que não são .md (imagens, PDFs) são listados
 *     como ignorados
 *   - o conteúdo fica igual (só troca quebras de linha \r\n por \n e tira o
 *     BOM); a data de modificação do arquivo vira a data da nota
 *
 * Usa DATABASE_URL de .env.local (ou do ambiente).
 */
import { config } from "dotenv";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });

const MAX_BODY = 1_000_000; // mesmo limite do app
const BATCH = 200;

type Args = { dir: string; email: string; dryRun: boolean; overwrite: boolean };

function parseArgs(argv: string[]): Args {
  const rest: string[] = [];
  let email = "";
  let dryRun = false;
  let overwrite = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") email = argv[++i] ?? "";
    else if (a.startsWith("--email=")) email = a.slice(8);
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--overwrite") overwrite = true;
    else if (a.startsWith("--")) fail(`Opção desconhecida: ${a}`);
    else rest.push(a);
  }
  if (rest.length !== 1 || !email) {
    fail('Uso: npm run import-vault -- <pasta-do-vault> --email voce@exemplo.com [--dry-run] [--overwrite]');
  }
  return { dir: path.resolve(rest[0]), email: email.trim().toLowerCase(), dryRun, overwrite };
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

type Found = { file: string; rel: string; mtime: Date; birthtime: Date };

/** Percorre a pasta: .md encontrados e outros arquivos ignorados. */
async function walk(root: string): Promise<{ md: Found[]; ignored: string[] }> {
  const md: Found[] = [];
  const ignored: string[] = [];
  async function visit(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(root, full).split(path.sep).join("/");
      if (e.isDirectory()) await visit(full);
      else if (e.isFile() && e.name.toLowerCase().endsWith(".md")) {
        const s = await stat(full);
        md.push({ file: full, rel, mtime: s.mtime, birthtime: s.birthtime });
      } else if (e.isFile()) ignored.push(rel);
    }
  }
  await visit(root);
  return { md, ignored };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const info = await stat(args.dir).catch(() => null);
  if (!info?.isDirectory()) fail(`Pasta não encontrada: ${args.dir}`);

  // Imports depois do dotenv (a conexão lê DATABASE_URL).
  const { db } = await import("../src/db");
  const { notes, user } = await import("../src/db/schema");
  const { rebuildLinks } = await import("../src/db/link-index");
  const { validateFolder, validateTitle } = await import("../src/lib/note-paths");
  const { eq, sql } = await import("drizzle-orm");

  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, args.email));
  if (!owner) fail(`Nenhum usuário com o e-mail ${args.email}. Crie com npm run create-user.`);

  const { md, ignored } = await walk(args.dir);
  console.log(`Vault: ${args.dir}`);
  console.log(`Encontrados: ${md.length} arquivos .md, ${ignored.length} outros arquivos (ignorados).`);

  type Row = { path: string; title: string; body: string; createdAt: Date; updatedAt: Date; rel: string };
  const rows: Row[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const f of md) {
    const parts = f.rel.split("/");
    const name = parts.pop()!.replace(/\.md$/i, "");
    const folder = validateFolder(parts.join("/"));
    const title = validateTitle(name);
    if ("error" in folder) {
      problems.push(`${f.rel}: ${folder.error}`);
      continue;
    }
    if ("error" in title) {
      problems.push(`${f.rel}: ${title.error}`);
      continue;
    }
    const key = `${folder.value}\u0000${title.value}`;
    if (seen.has(key)) {
      problems.push(`${f.rel}: nome repetido na mesma pasta depois de normalizar espaços`);
      continue;
    }
    seen.add(key);

    let body = await readFile(f.file, "utf8");
    if (body.charCodeAt(0) === 0xfeff) body = body.slice(1);
    body = body.replace(/\r\n?/g, "\n");
    if (body.length > MAX_BODY) {
      problems.push(`${f.rel}: maior que 1 MB, não importado`);
      continue;
    }
    // birthtime pode vir zerado em alguns sistemas de arquivos.
    const created = f.birthtime.getTime() > 0 && f.birthtime <= f.mtime ? f.birthtime : f.mtime;
    rows.push({ path: folder.value, title: title.value, body, createdAt: created, updatedAt: f.mtime, rel: f.rel });
  }

  // O que já existe no Noting para este usuário?
  const existing = new Set(
    (
      await db
        .select({ path: notes.path, title: notes.title })
        .from(notes)
        .where(eq(notes.userId, owner.id))
    ).map((n) => `${n.path}\u0000${n.title}`),
  );
  const fresh = rows.filter((r) => !existing.has(`${r.path}\u0000${r.title}`));
  const clashes = rows.filter((r) => existing.has(`${r.path}\u0000${r.title}`));

  console.log("");
  console.log(`Novas notas:                ${fresh.length}`);
  console.log(
    `Já existem no Noting:       ${clashes.length} (${args.overwrite ? "conteúdo será substituído" : "serão puladas; use --overwrite para substituir"})`,
  );
  console.log(`Com problema (não entram):  ${problems.length}`);
  for (const p of problems) console.log(`  - ${p}`);
  if (ignored.length) {
    const sample = ignored.slice(0, 10);
    console.log(`Arquivos que não são .md (ignorados): ${ignored.length}`);
    for (const i of sample) console.log(`  - ${i}`);
    if (ignored.length > sample.length) console.log(`  … e mais ${ignored.length - sample.length}`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: nada foi gravado.");
    process.exit(0);
  }

  const toWrite = args.overwrite ? rows : fresh;
  let written = 0;
  for (let i = 0; i < toWrite.length; i += BATCH) {
    const chunk = toWrite.slice(i, i + BATCH).map((r) => ({
      userId: owner.id,
      path: r.path,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    const q = db.insert(notes).values(chunk);
    const res = args.overwrite
      ? await q
          .onConflictDoUpdate({
            target: [notes.userId, notes.path, notes.title],
            set: { body: sql`excluded.body`, updatedAt: sql`excluded.updated_at` },
          })
          .returning({ id: notes.id })
      : await q.onConflictDoNothing().returning({ id: notes.id });
    written += res.length;
    process.stdout.write(`\rGravando… ${Math.min(i + BATCH, toWrite.length)}/${toWrite.length}`);
  }
  if (toWrite.length) process.stdout.write("\n");

  // Reconstrói os links de todas as notas do usuário (novas e antigas:
  // [[links]] antigos podem apontar para notas que acabaram de chegar).
  const all = await db.select({ id: notes.id }).from(notes).where(eq(notes.userId, owner.id));
  console.log("Reconstruindo links e backlinks…");
  const ids = all.map((n) => n.id);
  for (let i = 0; i < ids.length; i += 1000) await rebuildLinks(db, owner.id, ids.slice(i, i + 1000));

  console.log(`\nPronto: ${written} notas ${args.overwrite ? "importadas/atualizadas" : "importadas"}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
