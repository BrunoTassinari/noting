import { ChecklistIcon, FlagIcon, InboxIcon, MigrateIcon, TrashIcon } from "@/components/icons";

/** Telas do Bullet Journal com atalho no ribbon e na tela inicial do celular. */
export const BUJO_SCREENS = [
  { href: "/migrar", label: "Migrar tarefas", Icon: MigrateIcon },
  { href: "/pendencias", label: "Pendências", Icon: InboxIcon },
  { href: "/listas", label: "Listas", Icon: ChecklistIcon },
  { href: "/sinalizadores", label: "Sinalizadores", Icon: FlagIcon },
  { href: "/lixeira", label: "Lixeira", Icon: TrashIcon },
] as const;
