"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
import { NEXT_THEME, setThemePref, THEME_LABEL, type ThemePref, useThemePref } from "@/components/theme";

export function ThemeIcon({ pref, size = 18 }: { pref: ThemePref; size?: number }) {
  if (pref === "light") return <SunIcon size={size} />;
  if (pref === "dark") return <MoonIcon size={size} />;
  return <MonitorIcon size={size} />;
}

/** Botão do ribbon: alterna sistema → claro → escuro. */
export function ThemeButton() {
  const pref = useThemePref();
  const label = `${THEME_LABEL[pref]} (clique para trocar)`;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => setThemePref(NEXT_THEME[pref])}
      className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-card hover:text-text"
    >
      <ThemeIcon pref={pref} />
    </button>
  );
}
