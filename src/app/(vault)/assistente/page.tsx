import type { Metadata } from "next";
import { AssistantScreen } from "@/components/vault/assistant-screen";

export const metadata: Metadata = { title: "Assistente · Noting" };

export default function AssistantPage() {
  return <AssistantScreen />;
}
