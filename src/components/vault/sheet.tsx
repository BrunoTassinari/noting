"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

/** Gaveta que sobe de baixo (celular e telas sem o painel direito). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mb-0 mt-auto max-h-[80dvh] w-full max-w-none rounded-t-2xl border border-b-0 border-border bg-panel p-0 text-text backdrop:bg-black/60 md:mx-auto md:max-w-lg"
    >
      {open && (
        <div className="flex max-h-[80dvh] flex-col">
          <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
            <h2 id={titleId} className="flex-1 text-base font-semibold text-text-strong">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Fechar"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-[10px] text-muted"
            >
              <CloseIcon size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(20px,env(safe-area-inset-bottom))]">
            {children}
          </div>
        </div>
      )}
    </dialog>
  );
}
