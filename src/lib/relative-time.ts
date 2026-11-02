// "agora", "hoje", "ontem", "sex", "12 out" — como na lista do design.

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function relativeTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return "agora";
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  if (date.getTime() >= startOfToday) {
    return diff < 3_600_000 ? `${Math.floor(diff / 60_000)} min` : "hoje";
  }
  if (date.getTime() >= startOfToday - day) return "ontem";
  if (date.getTime() >= startOfToday - 6 * day) return WEEKDAYS[date.getDay()];
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? label : `${label} ${date.getFullYear()}`;
}
