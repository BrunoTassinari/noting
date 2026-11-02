import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export type CurrentUser = { id: string; email: string; name: string };

/** Usuário da sessão atual (validada no banco), ou null. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const { id, email, name } = result.user;
  return { id, email, name };
});

/** Igual a getCurrentUser, mas manda para /login se não houver sessão. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
