import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NoteIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { signupEnabled } from "./actions";
import { LoginForm } from "./login-form";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Entrar · Noting" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/");
  const canSignUp = await signupEnabled();
  const signingUp = canSignUp && (await searchParams).modo === "cadastro";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-accent">
            <NoteIcon size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-strong">Noting</h1>
            <p className="text-[13px] text-muted">
              {signingUp ? "Crie sua conta" : "Entre para abrir seu vault"}
            </p>
          </div>
        </div>

        {signingUp ? <SignUpForm key="cadastro" /> : <LoginForm key="login" />}

        {canSignUp && (
          <p className="mt-5 text-center text-[13px] text-muted">
            {signingUp ? "Já tem conta? " : "Não tem conta? "}
            <Link
              href={signingUp ? "/login" : "/login?modo=cadastro"}
              className="inline-flex min-h-11 items-center font-medium text-accent hover:underline md:min-h-0"
            >
              {signingUp ? "Entrar" : "Criar conta"}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
