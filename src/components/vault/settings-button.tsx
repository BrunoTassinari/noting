"use client";

import { SlidersIcon } from "@/components/icons";
import { useVault } from "./vault-context";

/** Botão do ribbon: abre as Configurações (hábitos). */
export function SettingsButton() {
  const { openSettings } = useVault();
  return (
    <button
      type="button"
      aria-label="Configurações"
      title="Configurações"
      onClick={openSettings}
      className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-text"
    >
      <SlidersIcon size={18} />
    </button>
  );
}
