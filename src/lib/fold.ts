// Normalização para busca: minúsculas e sem acentos ("Diário" → "diario"),
// guardando de onde veio cada caractere para destacar o trecho original.

const DIACRITICS = /\p{Diacritic}/gu;

export function fold(text: string): string {
  return text.normalize("NFD").replace(DIACRITICS, "").toLowerCase();
}

/** Texto normalizado + mapa: índice no normalizado → índice no original. */
export function foldWithMap(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const f = fold(text[i]);
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
  }
  map.push(text.length);
  return { folded, map };
}

/** Termos da busca: palavras normalizadas, sem repetição. */
export function searchTerms(query: string): string[] {
  return [...new Set(fold(query).split(/\s+/).filter(Boolean))].slice(0, 8);
}

/** Intervalos [início, fim) no texto original onde aparecem os termos. */
export function findTerms(text: string, terms: string[]): [number, number][] {
  if (terms.length === 0) return [];
  const { folded, map } = foldWithMap(text);
  const ranges: [number, number][] = [];
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + term.length)) {
      ranges.push([map[at], map[at + term.length]]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  // Junta sobreposições.
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
