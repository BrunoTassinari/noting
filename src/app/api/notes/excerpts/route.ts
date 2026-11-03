import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listExcerpts } from "@/server/notes";

// GET /api/notes/excerpts: resumo de cada nota ({ id: texto }), para a lista
// "Recentes" do celular. Fora do layout para ele ficar leve.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const excerpts = await listExcerpts(session.user.id);
  return NextResponse.json({ excerpts }, { headers: { "Cache-Control": "private, no-store" } });
}
