import type { Metadata } from "next";
import { BacklogScreen } from "@/components/vault/backlog-screen";

export const metadata: Metadata = { title: "Pendências · Noting" };

export default function BacklogPage() {
  return <BacklogScreen />;
}
