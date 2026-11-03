"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Diálogos modais com <dialog> nativo (foco, Esc e backdrop de graça).

export function Modal({
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
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-xl border border-border bg-panel p-0 text-text backdrop:bg-black/60"
    >
      {open && (
        <div className="p-5">
          <h2 id={titleId} className="mb-4 text-base font-semibold text-text-strong">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export const buttonBase =
  "h-11 rounded-lg px-4 text-sm font-medium transition-opacity disabled:opacity-60 md:h-9";

export function DialogButtons({
  onCancel,
  confirmLabel,
  pending,
  danger,
}: {
  onCancel: () => void;
  confirmLabel: string;
  pending?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" onClick={onCancel} className={`${buttonBase} text-text-soft hover:bg-card`}>
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className={`${buttonBase} font-semibold ${
          danger ? "bg-danger text-accent-ink" : "bg-accent text-accent-ink"
        } hover:opacity-90`}
      >
        {confirmLabel}
      </button>
    </div>
  );
}

/** Pede um texto (nome, pasta). onSubmit devolve erro ou null. */
export function PromptDialog({
  open,
  onClose,
  title,
  label,
  initialValue,
  placeholder,
  hint,
  suggestions,
  confirmLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initialValue: string;
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
  confirmLabel: string;
  onSubmit: (value: string) => Promise<string | null>;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <PromptForm
        label={label}
        initialValue={initialValue}
        placeholder={placeholder}
        hint={hint}
        suggestions={suggestions}
        confirmLabel={confirmLabel}
        onCancel={onClose}
        onSubmit={onSubmit}
      />
    </Modal>
  );
}

function PromptForm({
  label,
  initialValue,
  placeholder,
  hint,
  suggestions,
  confirmLabel,
  onCancel,
  onSubmit,
}: {
  label: string;
  initialValue: string;
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (value: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputId = useId();
  const listId = useId();

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const err = await onSubmit(value);
        setPending(false);
        if (err) setError(err);
      }}
    >
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-text-soft">
        {label}
      </label>
      <input
        id={inputId}
        autoFocus
        value={value}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
        autoComplete="off"
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onFocus={(e) => e.currentTarget.select()}
        className="h-11 w-full rounded-lg border border-border bg-rail px-3.5 text-base text-text outline-none placeholder:text-muted focus:border-accent md:h-9 md:text-sm"
      />
      {suggestions?.length ? (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      ) : null}
      {hint && !error && <p className="mt-2 text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
      <DialogButtons onCancel={onCancel} confirmLabel={confirmLabel} pending={pending} />
    </form>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <Modal
      open={open}
      onClose={() => {
        setError(null);
        onClose();
      }}
      title={title}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          const err = await onConfirm();
          setPending(false);
          if (err) setError(err);
        }}
      >
        <div className="text-sm text-text-soft">{message}</div>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-danger">
            {error}
          </p>
        )}
        <DialogButtons onCancel={onClose} confirmLabel={confirmLabel} pending={pending} danger />
      </form>
    </Modal>
  );
}
