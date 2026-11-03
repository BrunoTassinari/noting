"use server";

import { timingSafeEqual } from "node:crypto";
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

export type SignUpState = { error: string | null; email: string; name: string };

/** Cadastro só existe se SIGNUP_CODE estiver definida no ambiente. */
export async function signupEnabled(): Promise<boolean> {
  return Boolean(process.env.SIGNUP_CODE?.trim());
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Cria a conta com o código de convite (SIGNUP_CODE) e já entra. O cadastro
 * público do Better Auth continua desligado: este é o único caminho.
 */
export async function signUp(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const keep = { email, name };

  const expected = process.env.SIGNUP_CODE?.trim();
  if (!expected) return { error: "O cadastro está desativado.", ...keep };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Informe um e-mail válido.", ...keep };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", ...keep };
  if (password.length > 128) return { error: "Senha longa demais.", ...keep };
  if (password !== confirm) return { error: "As senhas não conferem.", ...keep };
  if (!sameCode(code, expected)) {
    await new Promise((r) => setTimeout(r, 1000)); // desestimula tentativas
    return { error: "Código de convite incorreto.", ...keep };
  }

  try {
    const ctx = await auth.$context;
    if (await ctx.internalAdapter.findUserByEmail(email)) {
      return { error: "Já existe uma conta com esse e-mail. Entre com ela.", ...keep };
    }
    const hash = await ctx.password.hash(password);
    const user = await ctx.internalAdapter.createUser(
      { email, name: name || email.split("@")[0], emailVerified: true },
      { method: "signup" },
    );
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: hash,
    });
    await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
  } catch (error) {
    console.error("Falha no cadastro", error);
    return { error: "Não foi possível criar a conta. Tente de novo.", ...keep };
  }

  redirect("/");
}
