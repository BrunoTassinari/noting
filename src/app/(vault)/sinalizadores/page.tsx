import type { Metadata } from "next";
import { SignalsScreen } from "@/components/vault/signals-screen";

export const metadata: Metadata = { title: "Sinalizadores · Noting" };

export default function SignalsPage() {
  return <SignalsScreen />;
}
