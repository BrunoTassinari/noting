import type { Metadata } from "next";
import { ListsScreen } from "@/components/vault/lists-screen";

export const metadata: Metadata = { title: "Listas · Noting" };

export default function ListsPage() {
  return <ListsScreen />;
}
