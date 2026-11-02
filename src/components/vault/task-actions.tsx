"use client";

import { type ReactNode, useState } from "react";
import { Sheet } from "./sheet";

export type TaskOption<K extends string> = {
  key: K;
  label: string;
  /** Rótulo curto do botão no desktop. */
  short?: string;
  /** Texto de apoio no seletor do celular. */
  hint?: string;
  icon: ReactNode;
  danger?: boolean;
};

/**
 * Ações de uma tarefa: botões em linha no desktop; no celular, um botão que
 * abre o seletor (Sheet) com as mesmas opções.
 */
export function TaskActions<K extends string>({
  text,
  options,
  disabled,
  mobileLabel,
  onAction,
}: {
  text: string;
  options: TaskOption<K>[];
  disabled?: boolean;
  mobileLabel: string;
  onAction: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden shrink-0 flex-wrap items-center justify-end gap-1 md:flex">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            title={o.hint ? `${o.label} (${o.hint})` : o.label}
            aria-label={`${o.label}: ${text}`}
            onClick={() => onAction(o.key)}
            className={`flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs hover:bg-active disabled:opacity-50 ${
              o.danger ? "text-danger" : "text-text-soft hover:text-text"
            }`}
          >
            {o.short === undefined ? o.icon : o.short}
          </button>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="h-11 shrink-0 rounded-lg border border-border px-3 text-sm text-text active:bg-active disabled:opacity-50 md:hidden"
      >
        {mobileLabel}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={text}>
        <ul className="flex flex-col gap-1 pb-2 pt-1">
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  setOpen(false);
                  onAction(o.key);
                }}
                className="flex h-14 w-full items-center gap-3 rounded-lg px-3 text-left active:bg-active disabled:opacity-50"
              >
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-lg bg-card ${
                    o.danger ? "text-danger" : "text-accent"
                  }`}
                >
                  {o.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] ${o.danger ? "text-danger" : "text-text-strong"}`}>
                    {o.label}
                  </span>
                  {o.hint && <span className="block truncate text-xs text-muted">{o.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
