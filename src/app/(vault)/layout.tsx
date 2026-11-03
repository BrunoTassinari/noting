import { CaptureSync } from "@/components/vault/capture-sync";
import { VaultShell } from "@/components/vault/vault-shell";
import { requireUser } from "@/lib/session";
import { listNotes } from "@/server/notes";
import { getHabits } from "@/server/settings";

export default async function VaultLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [notes, habits] = await Promise.all([listNotes(user.id), getHabits(user.id)]);
  return (
    <>
      <VaultShell notes={notes} habits={habits}>{children}</VaultShell>
      <CaptureSync />
    </>
  );
}
