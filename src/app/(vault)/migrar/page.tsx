import type { Metadata } from "next";
import { MigrateScreen } from "@/components/vault/migrate-screen";

export const metadata: Metadata = { title: "Migrar tarefas · Noting" };

export default function MigratePage() {
  return <MigrateScreen />;
}
