import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isUuid } from "@/lib/note-paths";
import { getNoteWithBacklinks } from "@/server/links";

// GET /api/notes/<id>: conteúdo + backlinks de uma nota. Usado para
// pré-carregar ao passar o mouse/tocar, e abrir a nota na hora do clique.
export async function GET(_req: Request, ctx: RouteContext<"/api/notes/[id]">) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });

  const note = await getNoteWithBacklinks(session.user.id, id);
  if (!note) return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });

  return NextResponse.json(
    { note },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
