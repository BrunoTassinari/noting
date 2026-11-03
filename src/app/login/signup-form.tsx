"use client";

import { useActionState } from "react";
import { signUp, type SignUpState } from "./actions";

const initialState: SignUpState = { error: null, email: "", name: "" };

const inputClass =
  "h-11 w-full rounded-lg border border-border bg-rail px-3.5 text-base text-text outline-none placeholder:text-muted focus:border-accent";
const labelClass = "text-[13px] font-medium text-text-soft";

function Field({
  id,
  label,
  hint,
  ...input
}: { id: string; label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input id={id} name={id} className={inputClass} {...input} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Nome" autoComplete="name" defaultValue={state.name} placeholder="Opcional" />
      <Field id="email" label="E-mail" type="email" autoComplete="email" required defaultValue={state.email} />
      <Field
        id="password"
        label="Senha"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Pelo menos 8 caracteres."
      />
      <Field id="confirm" label="Confirmar senha" type="password" autoComplete="new-password" required minLength={8} />
      <Field
        id="code"
        label="Código de convite"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        required
        hint="Peça o código a quem administra o Noting."
      />

      {state.error && (
        <p role="alert" className="text-[13px] text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-lg bg-accent text-[15px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
