/**
 * Reconstrói a tabela links de todas as notas a partir dos [[links]].
 * Rode uma vez depois de atualizar para a versão com backlinks (ou sempre
 * que quiser garantir que o índice está certo):
 *
 *   npm run reindex-links
 *
 * Usa DATABASE_URL de .env.local (ou do ambiente).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { db } = await import("../src/db");
  const { notes } = await import("../src/db/schema");
  const { rebuildLinks } = await import("../src/db/link-index");

  const all = await db.select({ id: notes.id, userId: notes.userId }).from(notes);
  const byUser = new Map<string, string[]>();
  for (const n of all) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n.id]);

  for (const [userId, ids] of byUser) {
    await rebuildLinks(db, userId, ids);
    console.log(`Usuário ${userId}: ${ids.length} notas reindexadas.`);
  }
  console.log("Pronto.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
