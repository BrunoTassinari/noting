// Lista de hábitos da pessoa logada, no navegador. O VaultProvider define a
// partir das configurações (servidor); o editor (formulário do dia, meses
// sem lista) e os modelos de nota do mês leem daqui.

let current: string[] = [];

export function setUserHabits(habits: string[]) {
  current = [...habits];
}

export function getUserHabits(): string[] {
  return current;
}
