import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseDay } from "@/lib/bujo";
import { CAPTURE_MAX_BATCH, CAPTURE_MAX_LENGTH, type CaptureInput } from "@/lib/capture";
import { isUuid } from "@/lib/note-paths";
import { applyCaptures } from "@/server/capture";

const noStore = { "Cache-Control": "private, no-store" };

// POST /api/capture { captures: [{ id, day: "2026-11-02", text }] }
// Fila de capturas offline (public/capture-queue.js). Responde com o destino
// de cada id; o aparelho só tira da fila o que voltou aqui.
export async function POST(req: Request) {
  const h = await headers();
  // Só o próprio site (o cookie já é SameSite=Lax; isto é uma segunda trava).
  const origin = h.get("origin");
  if (origin && new URL(origin).host !== h.get("host")) {
    return NextResponse.json({ error: "Origem não permitida." }, { status: 403, headers: noStore });
  }

  const session = await auth.api.getSession({ headers: h });
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401, headers: noStore });

  const json: unknown = await req.json().catch(() => null);
  const list = (json as { captures?: unknown } | null)?.captures;
  if (!Array.isArray(list) || list.length > CAPTURE_MAX_BATCH) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers: noStore });
  }

  const valid: CaptureInput[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of list as Record<string, unknown>[]) {
    const id = typeof raw?.id === "string" ? raw.id.toLowerCase() : "";
    if (!isUuid(id)) continue; // sem id não há como o aparelho reconhecer
    if (seen.has(id)) continue;
    seen.add(id);
    const text = typeof raw.text === "string" ? raw.text.trim() : "";
    const day = typeof raw.day === "string" ? raw.day : "";
    if (!text || text.length > CAPTURE_MAX_LENGTH || !parseDay(day)) invalid.push(id);
    else valid.push({ id, day, text });
  }

  const results = await applyCaptures(session.user.id, valid);
  return NextResponse.json(
    { results: [...results, ...invalid.map((id) => ({ id, status: "invalid" as const }))] },
    { headers: noStore },
  );
}
