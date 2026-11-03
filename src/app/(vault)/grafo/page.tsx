import type { Metadata } from "next";
import { GraphScreen } from "@/components/vault/graph-screen";

export const metadata: Metadata = { title: "Grafo · Noting" };

export default function GraphPage() {
  return <GraphScreen />;
}
