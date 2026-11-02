"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type LoginState = { error: string | null; email: string };

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Informe e-mail e senha.", email };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError && error.status === "UNAUTHORIZED") {
      return { error: "E-mail ou senha incorretos.", email };
    }
    if (error instanceof APIError && error.status === "TOO_MANY_REQUESTS") {
      return { error: "Muitas tentativas. Espere um pouco.", email };
    }
    console.error("Falha no login", error);
    return { error: "Não foi possível entrar. Tente de novo.", email };
  }

  redirect("/");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/login");
}
