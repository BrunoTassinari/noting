import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

/**
 * Checagem otimista: só olha se o cookie de sessão existe. A validação de
 * verdade acontece no servidor (getCurrentUser / requireUser).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!hasSession && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Tudo, exceto a API de auth, a de captura e o conector MCP (respondem 401
    // em JSON), arquivos estáticos, a página offline e assets do Next.
    "/((?!api/auth|api/capture|api/mcp|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|capture-queue.js|icons/|icon.svg|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
