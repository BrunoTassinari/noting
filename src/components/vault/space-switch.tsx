"use client";

import { SPACES, setSpace, useSpace } from "./space-store";

/** Seletor "BuJo | Acervo | Tudo". */
export function SpaceSwitch({ className = "" }: { className?: string }) {
  const space = useSpace();
  return (
    <div role="tablist" aria-label="Espaço" className={`flex gap-0.5 rounded-lg bg-rail p-0.5 ${className}`}>
      {SPACES.map((s) => (
        <button
          key={s.key}
          type="button"
          role="tab"
          aria-selected={space === s.key}
          onClick={() => setSpace(s.key)}
          className={`h-9 min-w-0 flex-1 rounded-md text-[13px] font-medium md:h-7 md:text-xs ${
            space === s.key ? "bg-active text-text-strong" : "text-muted hover:text-text"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
