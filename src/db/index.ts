import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL ausente. Copie .env.example para .env.local e preencha.",
  );
}

// Reaproveita o pool entre recargas do dev server e invocações serverless.
// Abrir conexão com o Postgres (TCP + TLS + autenticação) custa várias idas e
// voltas; manter as conexões vivas entre requisições evita isso.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const pool = new Pool({
    connectionString,
    max: 5,
    // Conexão ociosa fica aberta por 30 s (padrão do pg: 10 s), para que uma
    // pausa curta ao escrever não custe uma conexão nova no próximo save.
    idleTimeoutMillis: 30_000,
    // TCP keepalive: detecta conexão derrubada pelo caminho (NAT, pooler).
    keepAlive: true,
  });
  // Erro numa conexão ociosa (ex.: o Neon suspendeu o banco) não pode derrubar
  // o processo: o pool descarta essa conexão e abre outra quando precisar.
  pool.on("error", (err) => console.error("Postgres (conexão ociosa):", err.message));
  return pool;
}

const pool = globalForDb.pgPool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
