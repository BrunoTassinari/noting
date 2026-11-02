import { redirect } from "next/navigation";
import { LogoutIcon } from "@/components/icons";
import { getCurrentUser } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

// Tela provisória: o layout de 3 painéis entra na etapa 2.
export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-10 items-center gap-2 border-b border-border bg-panel pl-3.5 pr-2">
        <span className="flex-1 text-[13px] font-semibold text-text">
          Meu vault
        </span>
        <span className="hidden text-xs text-muted sm:inline">{user.email}</span>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sair"
            title="Sair"
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted hover:bg-active hover:text-text sm:h-7 sm:w-7"
          >
            <LogoutIcon size={16} />
          </button>
        </form>
      </header>
      <main className="flex flex-1 items-center justify-center bg-surface p-6 text-center text-muted">
        Você está logado. A lista de notas e o editor chegam nas próximas etapas.
      </main>
    </div>
  );
}
