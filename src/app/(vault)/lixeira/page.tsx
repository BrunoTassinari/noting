import type { Metadata } from "next";
import { TrashScreen } from "@/components/vault/trash-screen";

export const metadata: Metadata = { title: "Lixeira · Noting" };

export default function TrashPage() {
  return <TrashScreen />;
}
