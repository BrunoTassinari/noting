import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { searchNotes } from "@/server/search";

// GET /api/search?q=... (Route Handler e não Server Action: actions rodam
// em fila no cliente, e a busca não deve esperar um autosave terminar).
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 200);
  const results = await searchNotes(session.user.id, q);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
