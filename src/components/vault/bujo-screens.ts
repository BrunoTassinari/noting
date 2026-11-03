import { ChecklistIcon, FlagIcon, InboxIcon, MigrateIcon, TrashIcon } from "@/components/icons";

/**
 * Telas do Bullet Journal com atalho no ribbon e na tela inicial do celular.
 * `tone`: cor do ícone (matizes do tema; classes literais para o Tailwind).
 */
export const BUJO_SCREENS = [
  { href: "/migrar", label: "Migrar tarefas", Icon: MigrateIcon, tone: "text-hue-cornflower" },
  { href: "/pendencias", label: "Pendências", Icon: InboxIcon, tone: "text-hue-fern" },
  { href: "/listas", label: "Listas", Icon: ChecklistIcon, tone: "text-hue-verdigris" },
  { href: "/sinalizadores", label: "Sinalizadores", Icon: FlagIcon, tone: "text-hue-ember" },
  { href: "/lixeira", label: "Lixeira", Icon: TrashIcon, tone: "text-muted" },
] as const;
