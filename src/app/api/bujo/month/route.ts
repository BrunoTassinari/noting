import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { parseMonth } from "@/lib/bujo-data";
import { getMonthData } from "@/server/bujo-data";

// GET /api/bujo/month?m=2026-11: dados do frontmatter de cada nota diária do
// mês (humor, stress, clima, temperatura, cardio, hábitos) e a lista de
// hábitos da nota do mês. Usado pela tabela de hábitos e pelo gráfico.
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const month = request.nextUrl.searchParams.get("m") ?? "";
  if (!parseMonth(month)) return NextResponse.json({ error: "Mês inválido." }, { status: 400 });

  const data = await getMonthData(session.user.id, month);
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
