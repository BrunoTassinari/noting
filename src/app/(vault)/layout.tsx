import { CaptureSync } from "@/components/vault/capture-sync";
import { VaultShell } from "@/components/vault/vault-shell";
import { requireUser } from "@/lib/session";
import { listNotes } from "@/server/notes";
import { getHabits, getPrefs } from "@/server/settings";

export default async function VaultLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [notes, habits, prefs] = await Promise.all([listNotes(user.id), getHabits(user.id), getPrefs(user.id)]);
  return (
    <>
      <VaultShell notes={notes} habits={habits} prefs={prefs}>{children}</VaultShell>
      <CaptureSync />
    </>
  );
}
