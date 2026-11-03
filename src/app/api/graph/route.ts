import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { links } from "@/db/schema";
import { auth } from "@/lib/auth";

// GET /api/graph: as ligações entre notas ([[links]] resolvidos), como pares
// [de, para]. As notas (nós) o navegador já tem na lista do vault.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const rows = await db
    .select({ from: links.fromId, to: links.toId })
    .from(links)
    .where(eq(links.userId, session.user.id));
  return NextResponse.json(
    { edges: rows.map((r) => [r.from, r.to]) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
