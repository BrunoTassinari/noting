"use client";

import { getUserHabits } from "@/lib/user-habits";
import { useCallback, useTransition } from "react";
import { openPeriodicNoteAction } from "@/app/(vault)/actions";
import { type Day, isoDay, periodicNote, type PeriodicKind, today } from "@/lib/bujo";
import { failOptimisticNote, startOptimisticNote } from "./optimistic-note";
import { useVault } from "./vault-context";

/**
 * Abre a nota do dia/semana/mês (Bullet Journal), criando com o modelo se
 * não existir. Abre na hora: nota já na lista → navega direto; senão mostra
 * o modelo enquanto o servidor grava (criação otimista).
 */
export function usePeriodicNotes() {
  const { notes, activeNote, goToNote, showError } = useVault();
  const [pending, startTransition] = useTransition();

  const openPeriodic = useCallback(
    (kind: PeriodicKind, d: Day = today()) => {
      const { ref, template } = periodicNote(kind, d, getUserHabits());
      const existing = notes.find((n) => n.path === ref.path && n.title === ref.title);
      if (existing) {
        if (existing.id !== activeNote?.id) goToNote(existing.id);
        return;
      }
      const id = crypto.randomUUID();
      startOptimisticNote(
        { id, path: ref.path, title: ref.title, updatedAt: new Date().toISOString() },
        { body: template, selectTitle: false },
      );
      startTransition(async () => {
        // A data vai do relógio local; o servidor não decide o "hoje".
        const res = await openPeriodicNoteAction(kind, isoDay(d), id);
        if (!res) return; // redirecionou para /n/<id>
        if (!res.ok) {
          failOptimisticNote(id, res.error);
          showError(res.error);
        } else if (res.id !== id) {
          // Já existia (criada em outro aparelho): abre essa.
          failOptimisticNote(id, "A nota já existia.");
          goToNote(res.id);
        }
      });
    },
    [notes, activeNote?.id, goToNote, showError],
  );

  return { openPeriodic, pending };
}
