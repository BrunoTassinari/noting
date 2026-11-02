import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoteIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · Noting" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-card text-accent">
            <NoteIcon size={20} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-text-strong">Noting</h1>
            <p className="text-[13px] text-muted">Entre para abrir seu vault</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
