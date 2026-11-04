// Preferências gerais de cada pessoa (Configurações › Geral). Ficam na conta,
// valem em todos os aparelhos.

export type Prefs = {
  /** Pedir confirmação antes de mover uma nota para a lixeira. */
  confirmDeleteNote: boolean;
  /** Pedir confirmação antes de mover uma pasta para a lixeira. */
  confirmDeleteFolder: boolean;
  /** Pedir confirmação antes de excluir um item de lista. */
  confirmDeleteListItem: boolean;
  /** Onde nasce a nota criada ao clicar num [[link]] sem nota. */
  newLinkedNoteFolder: "root" | "same";
  /** "Virar nota" abre a nota nova. */
  openPromotedNote: boolean;
};

export const DEFAULT_PREFS: Prefs = {
  confirmDeleteNote: true,
  confirmDeleteFolder: true,
  confirmDeleteListItem: true,
  newLinkedNoteFolder: "root",
  openPromotedNote: false,
};

/** Junta o que veio do banco (ou do navegador) com os padrões, descartando lixo. */
export function cleanPrefs(input: unknown): Prefs {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Prefs = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]) {
    const v = raw[key];
    if (typeof DEFAULT_PREFS[key] === "boolean" && typeof v === "boolean") (out as Record<string, unknown>)[key] = v;
  }
  if (raw.newLinkedNoteFolder === "same" || raw.newLinkedNoteFolder === "root") out.newLinkedNoteFolder = raw.newLinkedNoteFolder;
  return out;
}
