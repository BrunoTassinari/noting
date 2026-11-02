import { InboxIcon, MigrateIcon } from "@/components/icons";

/** Telas do Bullet Journal com atalho no ribbon e na tela inicial do celular. */
export const BUJO_SCREENS = [
  { href: "/migrar", label: "Migrar tarefas", Icon: MigrateIcon },
  { href: "/pendencias", label: "Pendências", Icon: InboxIcon },
] as const;
