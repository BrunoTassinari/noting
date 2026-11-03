"use client";

import { Assistant } from "./assistant";
import { ScreenHeader } from "./screen-header";

/** Tela cheia do assistente (aba do app no desktop, tela no celular). */
export function AssistantScreen() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <ScreenHeader title="Assistente" subtitle="Claude com acesso às suas notas" />
      <Assistant />
    </div>
  );
}
