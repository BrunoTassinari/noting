import { VaultShell } from "@/components/vault/vault-shell";
import { requireUser } from "@/lib/session";
import { listNotes } from "@/server/notes";

export default async function VaultLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const notes = await listNotes(user.id);
  return <VaultShell notes={notes}>{children}</VaultShell>;
}
